/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import { PLAYLIST_REALM_MODELS } from '@/relisten/realm/models/playlists/playlist';
import { orderedGroups } from '@/relisten/playlists/playlist_operations';
import {
  addAgain,
  moveEntryStep,
  removeEntry,
  setSegmentDescription,
} from '@/relisten/playlists/playlist_actions';
import {
  applyOperations,
  createPlaylist,
  insertProseSegment,
  readPlaylistSnapshot,
} from '@/relisten/playlists/playlist_repository';
import { GuideLimitError, MAX_PROSE_ONLY_SEGMENTS } from './guide_text';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const OLD_ENTRY = 'playlist_entry_01k8000000e008000000000004';

describe('guide edits', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-guide-actions-'));
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

  /** "[intro] track" per group, so expectations read like the screen. */
  const layout = (playlistId: string) =>
    orderedGroups(readPlaylistSnapshot(realm, playlistId)).map((group) =>
      [
        group.segment.description ? `[${group.segment.description}]` : '',
        ...group.entries.map((e) => e.trackId ?? e.description),
      ]
        .filter(Boolean)
        .join(' ')
    );

  it('moves a lone track and its intro together from the menu', () => {
    const { playlistId } = createPlaylist(realm, 'Guide', [['track_a'], ['track_b']]);
    const [, second] = orderedGroups(readPlaylistSnapshot(realm, playlistId));
    setSegmentDescription(realm, playlistId, second.segment.segmentId, 'Opener');

    moveEntryStep(realm, playlistId, second.entries[0].entryId, 'up');

    expect(layout(playlistId)).toEqual(['[Opener] track_b', 'track_a']);
  });

  it('adds back a refused group with its intro, and a text-only section', () => {
    const { playlistId } = createPlaylist(realm, 'Guide', [['track_a']]);

    addAgain(realm, playlistId, [
      {
        description: 'Night two',
        entries: [
          { entryId: OLD_ENTRY, trackId: 'track_b' },
          {
            entryId: 'playlist_entry_01k8000000e008000000000005',
            description: `[Later](#entry=${OLD_ENTRY}&t=1:00)`,
          },
        ],
      },
      { description: 'Encore', entries: [] },
    ]);

    const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
    expect(groups.map((group) => group.segment.description)).toEqual([
      undefined,
      'Night two',
      'Encore',
    ]);
    const [restoredTrack, restoredText] = groups[1].entries;
    expect(restoredTrack.entryId).not.toBe(OLD_ENTRY);
    expect(restoredText.description).toBe(`[Later](#entry=${restoredTrack.entryId}&t=1:00)`);
  });

  it('refuses removing the last track of a described group when that leaves too many text-only groups', () => {
    const { playlistId } = createPlaylist(realm, 'Guide', [['track_a']]);
    const [group] = orderedGroups(readPlaylistSnapshot(realm, playlistId));
    setSegmentDescription(realm, playlistId, group.segment.segmentId, 'Opener');
    applyOperations(
      realm,
      playlistId,
      Array.from({ length: MAX_PROSE_ONLY_SEGMENTS }, (_, i) =>
        insertProseSegment(`Section ${i}`, {})
      )
    );
    const before = layout(playlistId);

    expect(() => removeEntry(realm, playlistId, group.entries[0].entryId)).toThrow(GuideLimitError);
    expect(layout(playlistId)).toEqual(before);
  });

  it('checks a batch against the state it leaves, applying all of it or none', () => {
    const { playlistId } = createPlaylist(realm, 'Guide', [['track_a']]);
    const [group] = orderedGroups(readPlaylistSnapshot(realm, playlistId));
    setSegmentDescription(realm, playlistId, group.segment.segmentId, 'Opener');
    const sections = (count: number) =>
      Array.from({ length: count }, (_, i) => insertProseSegment(`Section ${i}`, {}));
    const before = layout(playlistId);

    expect(() => applyOperations(realm, playlistId, sections(MAX_PROSE_ONLY_SEGMENTS + 1))).toThrow(
      GuideLimitError
    );
    expect(layout(playlistId)).toEqual(before);

    // Emptying the described group makes one text section too many, until
    // the same batch deletes the group.
    applyOperations(realm, playlistId, [
      ...sections(MAX_PROSE_ONLY_SEGMENTS),
      { type: 'delete_entry', entryId: group.entries[0].entryId },
      { type: 'delete_segment', segmentId: group.segment.segmentId },
    ]);
    expect(layout(playlistId)).toHaveLength(MAX_PROSE_ONLY_SEGMENTS);
  });
});
