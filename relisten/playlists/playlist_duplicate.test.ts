/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import {
  PLAYLIST_DEVICE_STATE_ID,
  PLAYLIST_REALM_MODELS,
  PlaylistCommand,
  PlaylistDeviceState,
  PlaylistOperation,
} from '@/relisten/realm/models/playlists/playlist';
import { orderedGroups } from '@/relisten/playlists/playlist_operations';
import {
  applyOperations,
  createPlaylist,
  duplicatePlaylist,
  insertProseSegment,
  insertTextBlock,
  entryDescriptionEdit,
  readPlaylistSnapshot,
  updatePlaylistDetails,
} from '@/relisten/playlists/playlist_repository';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

describe('duplicatePlaylist', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-playlist-duplicate-'));
    realm = await Realm.open({
      path: join(directory, 'playlists.realm'),
      schemaVersion: 1,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  /** "[intro] track text" per group, so expectations read like the screen. */
  const layout = (playlistId: string) =>
    orderedGroups(readPlaylistSnapshot(realm, playlistId)).map((group) => [
      group.segment.description,
      ...group.entries.map((e) => [e.trackId, e.description]),
    ]);

  /** A guide with an intro, a track note, a linked group, a text block and a text section. */
  function makeGuide() {
    const { playlistId } = createPlaylist(realm, 'Cornell', [['track_a'], ['track_b', 'track_c']]);
    updatePlaylistDetails(realm, playlistId, { description: 'The best show' });
    const [first, second] = orderedGroups(readPlaylistSnapshot(realm, playlistId));
    const linkedTrack = second.entries[1].entryId;
    applyOperations(realm, playlistId, [
      { type: 'update_segment', segmentId: first.segment.segmentId, description: 'Opener' },
      entryDescriptionEdit(first.entries[0].entryId, 'Listen for the jam'),
      insertTextBlock(second.segment.segmentId, `[Here](#entry=${linkedTrack}&t=1:00)`, {
        afterEntryId: linkedTrack,
      }),
      insertProseSegment('Encore thoughts', {}),
    ]);
    return playlistId;
  }

  it('copies every group, track, text block and note in order, under new IDs', () => {
    const playlistId = makeGuide();

    const copy = duplicatePlaylist(realm, playlistId);

    expect(copy.playlistId).not.toBe(playlistId);
    expect(copy.name).toBe('Cornell copy');
    expect(copy.description).toBe('The best show');
    expect(copy.entryCount).toBe(3);

    const [, linked] = orderedGroups(readPlaylistSnapshot(realm, copy.playlistId));
    const copiedTrack = linked.entries[1].entryId;
    expect(layout(copy.playlistId)).toEqual([
      ['Opener', ['track_a', 'Listen for the jam']],
      [
        undefined,
        ['track_b', undefined],
        ['track_c', undefined],
        [undefined, `[Here](#entry=${copiedTrack}&t=1:00)`],
      ],
      ['Encore thoughts'],
    ]);

    const originalIds = new Set(readPlaylistSnapshot(realm, playlistId).entries.keys());
    for (const entryId of readPlaylistSnapshot(realm, copy.playlistId).entries.keys()) {
      expect(originalIds.has(entryId)).toBe(false);
    }
  });

  it('saves an account copy with one create command holding its whole structure', () => {
    realm.write(() => {
      realm.create(PlaylistDeviceState, {
        id: PLAYLIST_DEVICE_STATE_ID,
        lastSignedInUserId: 'user_01k8000000e008000000000001',
      });
    });
    const playlistId = makeGuide();
    const operationsBefore = realm.objects(PlaylistOperation).length;

    const copy = duplicatePlaylist(realm, playlistId);

    expect(copy.libraryUserId).toBe('user_01k8000000e008000000000001');
    expect(copy.serverState).toBe('creating');
    expect(realm.objects(PlaylistOperation)).toHaveLength(operationsBefore);
    const [command] = realm.objects(PlaylistCommand).filtered('playlistId == $0', copy.playlistId);
    const request = JSON.parse(command.requestJson);
    expect(request.metadata).toEqual({ name: 'Cornell copy', description: 'The best show' });
    expect(request.segments.map((s: { description?: string }) => s.description)).toEqual([
      'Opener',
      undefined,
      'Encore thoughts',
    ]);
  });

  it('shortens a long name so the copy suffix still fits', () => {
    const { playlistId } = createPlaylist(realm, 'x'.repeat(100));

    expect(duplicatePlaylist(realm, playlistId).name).toBe(`${'x'.repeat(95)} copy`);
  });
});
