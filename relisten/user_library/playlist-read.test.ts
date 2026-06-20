import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { describe, expect, it, vi } from 'vitest';
import {
  RelistenUserLibraryApiClient,
  UserLibraryApiError,
} from '@/relisten/api/user_library_client';
import {
  UserPlaylist,
  UserPlaylistEntry,
  UserPlaylistVisibility,
} from '@/relisten/realm/models/user_library/playlists';
import {
  applyReadUserLibraryPlaylistSnapshot,
  getUserLibraryPlaylist,
  mobileAccessGrantHeadersForPlaylistRead,
  playlistCatalogHydrationPlan,
  UserLibraryPlaylistReadError,
} from '@/relisten/user_library/playlist_read';
import {
  MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME,
  MOBILE_ACCESS_GRANT_HEADER_NAME,
  MobileAccessGrantSecretStore,
  mobileAccessGrantSecretStorageKey,
} from '@/relisten/user_library/share_token_exchange';
import { UserLibraryPlaylistResponse } from '@/relisten/user_library/playlist_sync';

const BASE_URL = 'http://localhost:5119';

class FakeMobileAccessGrantSecretStore implements MobileAccessGrantSecretStore {
  readonly secrets = new Map<string, string>();

  async getGrantSecret(storageKey: string): Promise<string | null> {
    return this.secrets.get(storageKey) ?? null;
  }

  async setGrantSecret(storageKey: string, secret: string): Promise<void> {
    this.secrets.set(storageKey, secret);
  }

  async clearGrantSecret(storageKey: string): Promise<void> {
    this.secrets.delete(storageKey);
  }
}

function playlistResponse(overrides: Partial<UserLibraryPlaylistResponse> = {}) {
  return {
    playlist_uuid: 'playlist-1',
    short_id: 'abc123',
    owner_user_uuid: 'user-1',
    name: 'Shared Playlist',
    description: null,
    visibility: UserPlaylistVisibility.Unlisted,
    current_revision: 2,
    entries: [],
    ...overrides,
  };
}

function grant(overrides: Record<string, unknown> = {}) {
  return {
    scopeId: 'anonymous:device-1',
    playlistUuid: 'playlist-1',
    updatedAt: new Date('2026-06-20T10:00:00.000Z'),
    expiresAt: new Date('2026-06-21T10:00:00.000Z'),
    revokedAt: null,
    metadataJson: JSON.stringify({
      tokenSelector: 'selector-1',
      deviceId: 'device-1',
      platform: 'ios',
      headerName: MOBILE_ACCESS_GRANT_HEADER_NAME,
      playlistShortId: 'abc123',
      receivedAt: '2026-06-20T10:00:00.000Z',
    }),
    ...overrides,
  } as never;
}

describe('getUserLibraryPlaylist', () => {
  it('reads a playlist with no-store user-library request semantics', async () => {
    const fetchFn = vi.fn(async () => Response.json(playlistResponse()));
    const client = new RelistenUserLibraryApiClient({
      baseUrl: BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(
      getUserLibraryPlaylist(client, 'abc 123', {
        accessToken: 'access-1',
        headers: { [MOBILE_ACCESS_GRANT_HEADER_NAME]: 'selector.secret' },
      })
    ).resolves.toEqual(playlistResponse());

    const [[url, request]] = fetchFn.mock.calls as unknown as [string, RequestInit][];
    const headers = request.headers as Headers;
    expect(url).toBe(`${BASE_URL}/api/v3/library/playlists/abc%20123`);
    expect(request.method).toBe('GET');
    expect(headers.get('Authorization')).toBe('Bearer access-1');
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Pragma')).toBe('no-cache');
    expect(headers.get(MOBILE_ACCESS_GRANT_HEADER_NAME)).toBe('selector.secret');
  });

  it('keeps server error bodies out of thrown messages', async () => {
    const fetchFn = vi.fn(async () =>
      Response.json({ error: 'secret diagnostic' }, { status: 404 })
    );
    const client = new RelistenUserLibraryApiClient({
      baseUrl: BASE_URL,
      fetchFn: fetchFn as typeof fetch,
    });

    await expect(getUserLibraryPlaylist(client, 'missing-playlist')).rejects.toMatchObject({
      status: 404,
      message: 'User-library API request failed with status 404',
    } satisfies Partial<UserLibraryApiError>);
  });

  it('rejects blank playlist identifiers before creating the request', async () => {
    const client = { getJson: vi.fn() } as unknown as RelistenUserLibraryApiClient;

    expect(() => getUserLibraryPlaylist(client, '   ')).toThrow(
      new UserLibraryPlaylistReadError('playlist_uuid_or_short_id_required')
    );
    expect(client.getJson).not.toHaveBeenCalled();
  });
});

describe('mobileAccessGrantHeadersForPlaylistRead', () => {
  it('selects the newest active grant matching playlist uuid or short id', async () => {
    const secretStore = new FakeMobileAccessGrantSecretStore();
    await secretStore.setGrantSecret(
      mobileAccessGrantSecretStorageKey('anonymous:device-1', 'selector-1'),
      'secret-1'
    );
    await secretStore.setGrantSecret(
      mobileAccessGrantSecretStorageKey('anonymous:device-1', 'selector-2'),
      'secret-2'
    );

    const headers = await mobileAccessGrantHeadersForPlaylistRead(
      secretStore,
      [
        grant(),
        grant({
          updatedAt: new Date('2026-06-20T11:00:00.000Z'),
          metadataJson: JSON.stringify({
            tokenSelector: 'selector-2',
            deviceId: 'device-2',
            platform: 'ios',
            headerName: MOBILE_ACCESS_GRANT_HEADER_NAME,
            playlistShortId: 'abc123',
            receivedAt: '2026-06-20T11:00:00.000Z',
          }),
        }),
      ],
      'anonymous:device-1',
      'abc123',
      { now: new Date('2026-06-20T12:00:00.000Z') }
    );

    expect(headers).toEqual({
      [MOBILE_ACCESS_GRANT_HEADER_NAME]: 'selector-2.secret-2',
      [MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME]: 'device-2',
    });
  });

  it('does not send a newer matching grant from another scope', async () => {
    const secretStore = new FakeMobileAccessGrantSecretStore();
    await secretStore.setGrantSecret(
      mobileAccessGrantSecretStorageKey('anonymous:device-1', 'selector-1'),
      'secret-1'
    );
    await secretStore.setGrantSecret(
      mobileAccessGrantSecretStorageKey('user:other', 'selector-2'),
      'secret-2'
    );

    const headers = await mobileAccessGrantHeadersForPlaylistRead(
      secretStore,
      [
        grant(),
        grant({
          scopeId: 'user:other',
          updatedAt: new Date('2026-06-20T11:00:00.000Z'),
          metadataJson: JSON.stringify({
            tokenSelector: 'selector-2',
            deviceId: 'device-2',
            platform: 'ios',
            headerName: MOBILE_ACCESS_GRANT_HEADER_NAME,
            playlistShortId: 'abc123',
            receivedAt: '2026-06-20T11:00:00.000Z',
          }),
        }),
      ],
      'anonymous:device-1',
      'abc123',
      { now: new Date('2026-06-20T12:00:00.000Z') }
    );

    expect(headers).toEqual({
      [MOBILE_ACCESS_GRANT_HEADER_NAME]: 'selector-1.secret-1',
      [MOBILE_ACCESS_GRANT_DEVICE_ID_HEADER_NAME]: 'device-1',
    });
  });

  it('ignores expired, revoked, and secretless grants', async () => {
    const secretStore = new FakeMobileAccessGrantSecretStore();

    await expect(
      mobileAccessGrantHeadersForPlaylistRead(
        secretStore,
        [
          grant({ expiresAt: new Date('2026-06-19T10:00:00.000Z') }),
          grant({ revokedAt: new Date('2026-06-20T10:00:00.000Z') }),
          grant({ playlistUuid: 'other-playlist' }),
        ],
        'anonymous:device-1',
        'playlist-1',
        { now: new Date('2026-06-20T12:00:00.000Z') }
      )
    ).resolves.toBeUndefined();
  });
});

describe('applyReadUserLibraryPlaylistSnapshot', () => {
  it('owns the Realm write transaction for direct read snapshots', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'relisten-playlist-read-'));
    const realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema: [UserPlaylist, UserPlaylistEntry],
      schemaVersion: 1,
    });

    try {
      applyReadUserLibraryPlaylistSnapshot(
        realm,
        'user:user-1',
        playlistResponse({
          entries: [
            {
              playlist_entry_uuid: 'entry-1',
              source_track_uuid: 'track-1',
              block_uuid: null,
              block_position: null,
              position: 'a',
              added_by_user_uuid: 'user-1',
            },
          ],
        }),
        { fetchedAt: new Date('2026-06-20T10:00:00.000Z') }
      );

      expect(realm.objects(UserPlaylist).length).toBe(1);
      expect(realm.objects(UserPlaylistEntry).length).toBe(1);
    } finally {
      realm.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('playlistCatalogHydrationPlan', () => {
  it('separates playable, missing, unavailable, and deleted playlist entries', () => {
    const plan = playlistCatalogHydrationPlan(
      [
        playlistEntry({ uuid: 'deleted-entry', sourceTrackUuid: 'track-4', deletedAt: new Date() }),
        playlistEntry({ uuid: 'missing-2', sourceTrackUuid: 'track-2', position: 'c' }),
        playlistEntry({ uuid: 'playable-1', sourceTrackUuid: 'track-1', position: 'a' }),
        playlistEntry({ uuid: 'missing-1', sourceTrackUuid: 'track-2', position: 'b' }),
        playlistEntry({
          uuid: 'unavailable-1',
          sourceTrackUuid: 'track-3',
          position: 'd',
          unavailableReason: 'removed',
        }),
      ],
      (sourceTrackUuid) => sourceTrackUuid === 'track-1'
    );

    expect(plan.playableEntries.map((entry) => entry.uuid)).toEqual(['playable-1']);
    expect(plan.missingEntries.map((entry) => entry.uuid)).toEqual(['missing-1', 'missing-2']);
    expect(plan.missingSourceTrackUuids).toEqual(['track-2']);
    expect(plan.unavailableEntries.map((entry) => entry.uuid)).toEqual(['unavailable-1']);
  });
});

function playlistEntry(
  overrides: Partial<{
    uuid: string;
    playlistUuid: string;
    sourceTrackUuid: string;
    position: string;
    blockUuid: string | null;
    blockPosition: number | null;
    title: string | null;
    unavailableReason: string | null;
    deletedAt: Date | null;
  }> = {}
) {
  return {
    uuid: 'entry-1',
    playlistUuid: 'playlist-1',
    sourceTrackUuid: 'track-1',
    position: 'a',
    blockUuid: null,
    blockPosition: null,
    title: null,
    unavailableReason: null,
    deletedAt: null,
    ...overrides,
  };
}
