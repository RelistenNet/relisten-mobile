import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Realm from 'realm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlaylistQueueV2Item } from '@/relisten/player/queue_v2';
import { ActiveUserDataScope, UserAuthSessionMetadata } from '@/relisten/realm/models/user_library';
import { ScopedPlaybackHistoryEntry } from '@/relisten/realm/models/user_library/history';
import { UserDataSyncStatus } from '@/relisten/realm/models/user_library/sync';
import { setActiveUserDataScope } from '@/relisten/user_library/active_user_data_scope_service';
import { userLibrarySessionMetadataScopedId } from '@/relisten/user_library/auth_session_realm_service';
import { recordAuthenticatedPlaybackHistoryEvent } from '@/relisten/user_library/playback_history_recording';
import { UserDataScopeKind } from '@/relisten/user_library/user_data_scope';

const schema = [ActiveUserDataScope, UserAuthSessionMetadata, ScopedPlaybackHistoryEntry];

const USER_UUID = '33333333-3333-4333-8333-333333333333';
const SCOPE_ID = `user:${USER_UUID}`;
const EVENT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TRACK_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOURCE_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SHOW_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ARTIST_UUID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PLAYLIST_UUID = '99999999-9999-4999-8999-999999999999';
const PLAYLIST_ENTRY_UUID = '88888888-8888-4888-8888-888888888888';
const BLOCK_UUID = '77777777-7777-4777-8777-777777777777';

describe('recordAuthenticatedPlaybackHistoryEvent', () => {
  let realm: Realm;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'relisten-history-recording-'));
    realm = new Realm({
      path: join(tempDir, 'test.realm'),
      schema,
      schemaVersion: 1,
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not write scoped rows while signed out', () => {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Anonymous,
      deviceId: 'device-1',
    });

    expect(recordAuthenticatedPlaybackHistoryEvent(realm, playbackInput())).toBeUndefined();
    expect(realm.objects(ScopedPlaybackHistoryEntry).length).toBe(0);
  });

  it('requires non-secret authenticated session metadata for the device id', () => {
    setAuthenticatedScope();

    expect(recordAuthenticatedPlaybackHistoryEvent(realm, playbackInput())).toBeUndefined();
    expect(realm.objects(ScopedPlaybackHistoryEntry).length).toBe(0);
  });

  it('records authenticated playback with playlist and block attribution', () => {
    setAuthenticatedScope();
    createSessionMetadata('session-1', ' device-1 ');

    const entry = recordAuthenticatedPlaybackHistoryEvent(
      realm,
      playbackInput({
        queueV2Item: createPlaylistQueueV2Item({
          playlistUuid: PLAYLIST_UUID,
          playlistEntryUuid: PLAYLIST_ENTRY_UUID,
          sourceTrackUuid: TRACK_UUID,
          blockUuid: BLOCK_UUID,
          blockPosition: 4,
        }),
      })
    );

    expect(entry).toEqual(
      expect.objectContaining({
        scopeId: SCOPE_ID,
        clientEventUuid: EVENT_UUID,
        deviceId: 'device-1',
        sourceTrackUuid: TRACK_UUID,
        sourceUuid: SOURCE_UUID,
        showUuid: SHOW_UUID,
        artistUuid: ARTIST_UUID,
        playlistUuid: PLAYLIST_UUID,
        playlistEntryUuid: PLAYLIST_ENTRY_UUID,
        blockUuid: BLOCK_UUID,
        blockPosition: 4,
        syncStatus: UserDataSyncStatus.Pending,
      })
    );
  });

  function setAuthenticatedScope() {
    setActiveUserDataScope(realm, {
      kind: UserDataScopeKind.Authenticated,
      userUuid: USER_UUID,
    });
  }

  function createSessionMetadata(sessionUuid: string, deviceId: string) {
    realm.write(() => {
      realm.create(UserAuthSessionMetadata, {
        scopedId: userLibrarySessionMetadataScopedId(SCOPE_ID, sessionUuid),
        scopeId: SCOPE_ID,
        userUuid: USER_UUID,
        sessionUuid,
        deviceId,
        username: 'ios_simulator',
        lastAuthenticatedAt: new Date('2026-06-20T05:50:00.000Z'),
      });
    });
  }
});

function playbackInput(
  overrides: Partial<Parameters<typeof recordAuthenticatedPlaybackHistoryEvent>[1]> = {}
): Parameters<typeof recordAuthenticatedPlaybackHistoryEvent>[1] {
  return {
    clientEventUuid: EVENT_UUID,
    sourceTrackUuid: TRACK_UUID,
    sourceUuid: SOURCE_UUID,
    showUuid: SHOW_UUID,
    artistUuid: ARTIST_UUID,
    playedAt: new Date('2026-06-20T05:55:00.000Z'),
    playbackFlags: 5,
    platform: 'ios',
    appVersion: '4.2.1',
    ...overrides,
  };
}
