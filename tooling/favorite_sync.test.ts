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
} from '../relisten/library/catalog_availability_refresh_policy.ts';
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

test('a named unavailable mutation does not reject its valid batch neighbors', async () => {
  const first = mutation('first', '11111111-1111-4111-8111-111111111111');
  const unavailable = mutation('unavailable', '22222222-2222-4222-8222-222222222222');
  const last = mutation('last', '33333333-3333-4333-8333-333333333333');
  const sent: string[][] = [];
  const applied: string[][] = [];
  const rejected: string[] = [];

  await sendFavoriteMutationBatchWithIsolation({
    request: { contract_version: 1, mutations: [first, unavailable, last] },
    send: async (request) => {
      sent.push(request.mutations.map((item) => item.mutation_uuid));
      if (sent.length === 1) {
        throw accountError('catalog_unavailable', {
          unavailable_references: [
            {
              catalog_type: unavailable.catalog_type,
              catalog_uuid: unavailable.catalog_uuid,
            },
          ],
        });
      }
      return { contract_version: 1, library_revision: 1, results: [] };
    },
    apply: (request) => applied.push(request.mutations.map((item) => item.mutation_uuid)),
    reject: (mutationUuids) => rejected.push(...mutationUuids),
  });

  assert.deepEqual(sent, [
    ['first', 'unavailable', 'last'],
    ['first', 'last'],
  ]);
  assert.deepEqual(applied, [['first', 'last']]);
  assert.deepEqual(rejected, ['unavailable']);
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
