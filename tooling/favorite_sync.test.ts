import assert from 'node:assert/strict';
import test from 'node:test';
import { sendFavoriteMutationBatchWithIsolation } from '../relisten/library/favorite_mutation_batch_isolation.ts';
import {
  importUuidsSettledByCompaction,
  isTrulyUnsentFavoriteMutation,
} from '../relisten/library/favorite_mutation_compaction.ts';
import { earliestFutureRetryAt } from '../relisten/library/favorite_retry_schedule.ts';
import {
  favoriteSyncPresentationState,
  resumedFavoriteSyncRunStatus,
} from '../relisten/library/favorite_sync_presentation.ts';
import { preferNewerUsernameProfile } from '../relisten/accounts/username_profile_monotonicity.ts';
import { isPostgresUuid } from '../relisten/util/postgres_uuid.ts';
import {
  canPlaySourceTrackForTargets,
  canUseNetworkAudioForTargets,
} from '../relisten/library/catalog_audio_availability_policy.ts';
import {
  anonymousFavoriteSourceFingerprint,
} from '../relisten/library/anonymous_favorite_import_fingerprint.ts';
import { anonymousFavoriteImportState } from '../relisten/library/anonymous_favorite_import_state.ts';
import {
  CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS,
  catalogAvailabilityNeedsRefresh,
  favoriteMetadataNeedsHydration,
  favoritePresenceChangeNeedsHydration,
  filterActiveFavoriteReferences,
} from '../relisten/library/catalog_availability_refresh_policy.ts';
import { upsertResolvedCatalogDtos } from '../relisten/library/resolved_catalog_dto_updater.ts';
import { favoriteSyncErrorIsRetryable } from '../relisten/library/favorite_mutation_batch_isolation.ts';
import {
  favoriteSyncStateSnapshot,
  favoriteSyncStateView,
} from '../relisten/library/favorite_sync_state_snapshot.ts';

test('favorite sync snapshots change when a live Realm object is mutated in place', () => {
  const state = {
    runStatus: 'waiting' as 'waiting' | 'saved',
    lastErrorRetryable: false as boolean,
    lastSuccessfulSyncAt: undefined as Date | undefined,
  };
  const waitingSnapshot = favoriteSyncStateSnapshot(state);

  state.lastErrorRetryable = true;
  const retryableSnapshot = favoriteSyncStateSnapshot(state);
  assert.notEqual(retryableSnapshot, waitingSnapshot);
  assert.equal(favoriteSyncStateView(retryableSnapshot).lastErrorRetryable, true);

  state.lastErrorRetryable = false;
  state.runStatus = 'saved';
  state.lastSuccessfulSyncAt = new Date('2026-07-19T12:00:00Z');
  const savedSnapshot = favoriteSyncStateSnapshot(state);

  assert.notEqual(savedSnapshot, waitingSnapshot);
  assert.deepEqual(favoriteSyncStateView(savedSnapshot), {
    runStatus: 'saved',
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
    lastErrorRetryable: false,
    lastSuccessfulSyncAt: new Date('2026-07-19T12:00:00Z'),
  });
});

function accountError(code: string, problem: Record<string, unknown> | null = null) {
  const error = new Error(code) as Error & {
    code: string;
    problem: Record<string, unknown> | null;
    retryable: boolean;
  };
  error.name = 'AccountsApiError';
  error.code = code;
  error.problem = problem;
  error.retryable = false;
  return error;
}

function mutation(id: string, catalogUuid: string) {
  return {
    mutation_uuid: id,
    catalog_type: 'artist' as const,
    catalog_uuid: catalogUuid,
    desired_state: 'favorite' as const,
    favorite_uuid: `favorite-${id}`,
  };
}

test('an obsolete catalog rejection leaves the mutation pending for a later server retry', async () => {
  const favorite = mutation('favorite', '22222222-2222-4222-8222-222222222222');
  let sendCount = 0;
  const rejected: string[] = [];

  await assert.rejects(
    sendFavoriteMutationBatchWithIsolation({
      request: { contract_version: 1, mutations: [favorite] },
      send: async () => {
        sendCount += 1;
        throw accountError('catalog_unavailable', {
          unavailable_references: [],
        });
      },
      apply: () => assert.fail('A rejected request cannot be applied.'),
      reject: (mutationUuids) => rejected.push(...mutationUuids),
    }),
    (error) => (error as Error & { code?: string }).code === 'catalog_unavailable'
  );

  assert.equal(sendCount, 1);
  assert.deepEqual(rejected, []);
  assert.equal(favoriteSyncErrorIsRetryable('catalog_unavailable', false), true);
});

test('an unfavorite request syncs without catalog metadata or a favorite UUID', async () => {
  const request = {
    contract_version: 1 as const,
    mutations: [
      {
        mutation_uuid: 'remove',
        catalog_type: 'show' as const,
        catalog_uuid: '22222222-2222-4222-8222-222222222222',
        desired_state: 'not_favorite' as const,
      },
    ],
  };
  let sent = false;

  await sendFavoriteMutationBatchWithIsolation({
    request,
    send: async (submitted) => {
      sent = true;
      assert.deepEqual(submitted, request);
      return { contract_version: 1, library_revision: 1, results: [] };
    },
    apply: () => {},
    reject: () => assert.fail('A valid unfavorite cannot be rejected locally.'),
  });

  assert.equal(sent, true);
});

test('a terminal account failure bubbles without bisecting or rejecting mutations', async () => {
  const failure = accountError('invalid_token');
  let sendCount = 0;
  let rejectCount = 0;

  await assert.rejects(
    sendFavoriteMutationBatchWithIsolation({
      request: {
        contract_version: 1,
        mutations: [
          mutation('first', '11111111-1111-4111-8111-111111111111'),
          mutation('second', '22222222-2222-4222-8222-222222222222'),
        ],
      },
      send: async () => {
        sendCount += 1;
        throw failure;
      },
      apply: () => assert.fail('A failed account request cannot be applied.'),
      reject: () => {
        rejectCount += 1;
      },
    }),
    (error) => error === failure
  );

  assert.equal(sendCount, 1);
  assert.equal(rejectCount, 0);
});

test('durable retry scheduling selects the earliest future deadline', () => {
  const now = new Date('2026-07-19T12:00:00Z').getTime();

  assert.equal(
    earliestFutureRetryAt(
      [undefined, new Date(now - 1), new Date(now + 30_000), new Date(now + 5_000)],
      now
    ),
    now + 5_000
  );
});

test('catalog UUID validation accepts legacy PostgreSQL UUID values', () => {
  assert.equal(isPostgresUuid('8bf22e27-11de-96e8-4653-964ff9faae2d'), true);
  assert.equal(isPostgresUuid('00000000-0000-0000-0000-000000000000'), false);
  assert.equal(isPostgresUuid('not-a-uuid'), false);
});

test('explicit catalog removal blocks network audio but preserves a local download', () => {
  const unavailableShow = new Set(['show:22222222-2222-4222-8222-222222222222']);
  const track = {
    uuid: '11111111-1111-4111-8111-111111111111',
    sourceUuid: '33333333-3333-4333-8333-333333333333',
    showUuid: '22222222-2222-4222-8222-222222222222',
    artistUuid: '44444444-4444-4444-8444-444444444444',
  };

  assert.equal(canUseNetworkAudioForTargets(new Set(), track), true);
  assert.equal(canUseNetworkAudioForTargets(unavailableShow, track), false);
  assert.equal(canPlaySourceTrackForTargets(unavailableShow, track), false);
  assert.equal(
    canPlaySourceTrackForTargets(unavailableShow, {
      ...track,
      offlineInfo: { isPlayableOffline: () => true },
    }),
    true
  );
});

test('catalog availability refreshes unknown answers promptly and known answers daily', () => {
  const now = new Date('2026-07-19T12:00:00Z');
  const justInsideFreshnessWindow = new Date(
    now.getTime() - CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS + 1
  );
  const freshnessBoundary = new Date(
    now.getTime() - CATALOG_AVAILABILITY_REFRESH_INTERVAL_MS
  );

  assert.equal(catalogAvailabilityNeedsRefresh(undefined, now), true);
  assert.equal(catalogAvailabilityNeedsRefresh(justInsideFreshnessWindow, now), false);
  assert.equal(catalogAvailabilityNeedsRefresh(freshnessBoundary, now), true);
});

test('favorite hydration eligibility follows active membership and resets on refavorite', () => {
  const now = new Date('2026-07-19T12:00:00Z');
  const recentlyUnavailable = {
    availabilityCheckedAt: new Date('2026-07-19T11:59:00Z'),
    effectivePresent: true,
    hasLocalMetadata: false,
    metadataStatus: 'unavailable' as const,
  };

  assert.equal(favoriteMetadataNeedsHydration(recentlyUnavailable, now), false);
  assert.equal(
    favoriteMetadataNeedsHydration(
      {
        ...recentlyUnavailable,
        effectivePresent: false,
        metadataStatus: 'unknown',
      },
      now
    ),
    false
  );
  assert.equal(
    favoriteMetadataNeedsHydration({ ...recentlyUnavailable, metadataStatus: 'unknown' }, now),
    true
  );
  assert.equal(
    favoritePresenceChangeNeedsHydration(false, true, 'unavailable'),
    true
  );
  assert.equal(
    favoritePresenceChangeNeedsHydration(true, true, 'unavailable'),
    false
  );
});

test('a hydration batch is rechecked after an unfavorite', () => {
  const reference = {
    catalog_type: 'show' as const,
    catalog_uuid: '22222222-2222-4222-8222-222222222222',
  };
  const activeTargets = new Set([`${reference.catalog_type}:${reference.catalog_uuid}`]);
  const active = (candidate: typeof reference) =>
    activeTargets.has(`${candidate.catalog_type}:${candidate.catalog_uuid}`);

  assert.deepEqual(filterActiveFavoriteReferences([reference], active), [reference]);
  activeTargets.clear();
  assert.deepEqual(filterActiveFavoriteReferences([reference], active), []);
  activeTargets.add(`${reference.catalog_type}:${reference.catalog_uuid}`);
  assert.deepEqual(filterActiveFavoriteReferences([reference], active), [reference]);
});

test('resolver omissions retain cached catalog DTOs', () => {
  const cached = new Map([['cached', { uuid: 'cached', name: 'Cached metadata' }]]);

  upsertResolvedCatalogDtos(
    {
      artists: [{ uuid: 'new', name: 'New metadata' }],
      years: [],
      venues: [],
      tours: [],
      shows: [],
      sources: [],
      source_sets: [],
      source_tracks: [],
      songs: [],
    },
    {
      artists: (entity) => cached.set(entity.uuid, entity),
      years: () => assert.fail('An omitted catalog group cannot be applied.'),
      venues: () => assert.fail('An omitted catalog group cannot be applied.'),
      tours: () => assert.fail('An omitted catalog group cannot be applied.'),
      shows: () => assert.fail('An omitted catalog group cannot be applied.'),
      sources: () => assert.fail('An omitted catalog group cannot be applied.'),
      source_sets: () => assert.fail('An omitted catalog group cannot be applied.'),
      source_tracks: () => assert.fail('An omitted catalog group cannot be applied.'),
      songs: () => assert.fail('An omitted catalog group cannot be applied.'),
    }
  );

  assert.deepEqual(cached.get('cached'), {
    uuid: 'cached',
    name: 'Cached metadata',
  });
  assert.deepEqual(cached.get('new'), { uuid: 'new', name: 'New metadata' });
});

test('a fresh or failed library read cannot be presented as saved', () => {
  assert.equal(
    favoriteSyncPresentationState({
      runStatus: undefined,
      hasInFlightMutation: false,
      hasRejectedMutation: false,
      hasActionableFailure: false,
      hasRetryableFailure: false,
      pendingMutationCount: 0,
    }),
    'waiting'
  );
  assert.equal(
    favoriteSyncPresentationState({
      runStatus: 'needs_attention',
      hasInFlightMutation: false,
      hasRejectedMutation: false,
      hasActionableFailure: true,
      hasRetryableFailure: false,
      pendingMutationCount: 0,
    }),
    'needsAttention'
  );
  assert.equal(
    favoriteSyncPresentationState({
      runStatus: 'saved',
      hasInFlightMutation: false,
      hasRejectedMutation: false,
      hasActionableFailure: false,
      hasRetryableFailure: false,
      pendingMutationCount: 0,
    }),
    'saved'
  );
  assert.equal(
    favoriteSyncPresentationState({
      runStatus: 'needs_attention',
      hasInFlightMutation: false,
      hasRejectedMutation: false,
      hasActionableFailure: false,
      hasRetryableFailure: true,
      pendingMutationCount: 0,
    }),
    'waiting'
  );
  assert.equal(resumedFavoriteSyncRunStatus('needs_attention', false), 'needs_attention');
  assert.equal(resumedFavoriteSyncRunStatus('syncing', true), 'waiting');
});

test('favorite compaction preserves every operation that may have reached the server', () => {
  const mutations = [
    { id: 'never-sent', state: 'pending', attemptCount: 0, importUuid: 'fresh-import' },
    {
      id: 'ambiguous-response',
      state: 'pending',
      attemptCount: 1,
      importUuid: 'attempted-import',
    },
    { id: 'in-flight', state: 'in_flight', attemptCount: 1, importUuid: 'attempted-import' },
    { id: 'rejected', state: 'needs_attention', attemptCount: 1 },
  ];

  assert.deepEqual(
    mutations.filter(isTrulyUnsentFavoriteMutation).map((item) => item.id),
    ['never-sent']
  );
  assert.deepEqual([...importUuidsSettledByCompaction(mutations)], ['fresh-import']);
});

test('anonymous import receipts identify one exact source snapshot', () => {
  const firstSnapshot = [
    { catalogType: 'artist', catalogUuid: '11111111-1111-4111-8111-111111111111' },
    { catalogType: 'show', catalogUuid: '22222222-2222-4222-8222-222222222222' },
  ];
  const reorderedFingerprint = anonymousFavoriteSourceFingerprint([...firstSnapshot].reverse());
  const firstFingerprint = anonymousFavoriteSourceFingerprint(firstSnapshot);
  const changedFingerprint = anonymousFavoriteSourceFingerprint([
    firstSnapshot[0],
    { catalogType: 'show', catalogUuid: '33333333-3333-4333-8333-333333333333' },
  ]);

  assert.equal(reorderedFingerprint, firstFingerprint);
  assert.notEqual(changedFingerprint, firstFingerprint);
});

test('an older import decision does not hide a new anonymous snapshot', () => {
  assert.equal(
    anonymousFavoriteImportState({
      isAuthenticatedScope: true,
      anonymousFavoriteCount: 1,
      currentReceiptState: undefined,
    }),
    'available'
  );
});

test('an idempotent username receipt cannot replace a newer cached profile', () => {
  const commandResult = accountProfile(2, 'receipt_name');
  const newerCachedProfile = accountProfile(3, 'newer_name');

  assert.equal(preferNewerUsernameProfile(commandResult, newerCachedProfile), newerCachedProfile);
  assert.equal(
    preferNewerUsernameProfile(accountProfile(4, 'latest_name'), newerCachedProfile).username,
    'latest_name'
  );
});

function accountProfile(usernameVersion: number, username: string) {
  return {
    userUuid: '019b6ce0-d644-7000-8000-000000000001',
    username,
    usernameVersion,
    usernameReviewNeeded: false,
    usernameReviewedAt: new Date('2026-07-19T12:00:00Z'),
    usernameChangeAvailableAt: null,
    nativeSessionId: '019b6ce0-d644-7000-8000-000000000002',
    lastSyncedAt: new Date('2026-07-19T12:00:00Z'),
  };
}
