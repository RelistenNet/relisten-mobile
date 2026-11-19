/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FAVORITE_REALM_MODELS } from '@/relisten/realm/models/library';
import {
  Playlist,
  PlaylistCommand,
  PlaylistEntry,
  PLAYLIST_REALM_MODELS,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import { GUIDE_MARKDOWN_VERSION } from '@/relisten/playlists/guide/guide_markdown';
import {
  appendOperation,
  applySnapshot,
  issueCreateCommand,
  rebuildDisplayed,
} from './playlist_sync_state';
import type { CreatePlaylistRequest, PlaylistSnapshotResponse } from './playlist_wire';

vi.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => globalThis.crypto.getRandomValues(bytes),
}));

const owner = 'user_01890a5dac96774bbcceb302099a8051';
const playlistId = 'playlist_01890a5dac96774bbcceb302099a8052';
const segmentId = 'playlist_segment_01890a5dac96774bbcceb302099a8053';
const trackEntryId = 'playlist_entry_01890a5dac96774bbcceb302099a8054';
const textEntryId = 'playlist_entry_01890a5dac96774bbcceb302099a8055';

const snapshot: PlaylistSnapshotResponse = {
  contract_version: 1,
  playlist_id: playlistId,
  revision: 3,
  archived: false,
  metadata: { name: 'Guide', description: null },
  segments: [
    {
      segment_id: segmentId,
      rank: 'a0',
      description: '## Set two ![x](https://tracker.example/p.gif)',
      entries: [
        {
          entry_id: trackEntryId,
          track_id: 'track_01890a5dac96774bbcceb302099a8056',
          rank: 'a0',
          description: 'Listen at 2:00.',
        },
        { entry_id: textEntryId, track_id: null, rank: 'a1', description: 'Then the jam.' },
      ],
    },
  ],
  created_at: '2026-11-18T00:00:00Z',
  updated_at: '2026-11-18T00:00:00Z',
  history_generation: 'generation-a',
};

describe('guide content sync', () => {
  let directory: string;
  let realm: Realm;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-guide-sync-'));
    realm = await Realm.open({
      path: join(directory, 'playlists.realm'),
      schemaVersion: 1,
      schema: [...PLAYLIST_REALM_MODELS, ...FAVORITE_REALM_MODELS],
    });
    realm.write(() => {
      const now = new Date();
      const playlist = realm.create(Playlist, {
        playlistId,
        name: 'Guide',
        createdAt: now,
        updatedAt: now,
        ownerUserId: owner,
        libraryUserId: owner,
        serverState: 'synced',
      });
      applySnapshot(realm, playlist, snapshot);
    });
  });

  afterEach(() => {
    realm.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('stores descriptions as confirmed and displayed, with a sanitized copy', () => {
    const segment = realm.objectForPrimaryKey(PlaylistSegment, segmentId)!;
    const text = realm.objectForPrimaryKey(PlaylistEntry, textEntryId)!;

    expect(segment.canonicalDescription).toBe(snapshot.segments[0].description);
    expect(segment.description).toBe(snapshot.segments[0].description);
    expect(segment.descriptionMarkdown).toBe('## Set two x');
    expect(segment.descriptionMarkdownKey).toBe(`${GUIDE_MARKDOWN_VERSION}:segment`);
    expect(text.trackId).toBeNull();
    expect(text.descriptionMarkdown).toBe('Then the jam.');
    // A text block isn't a track.
    expect(realm.objectForPrimaryKey(Playlist, playlistId)!.entryCount).toBe(1);
  });

  it('replays a pending description edit over the confirmed text', () => {
    realm.write(() => {
      const playlist = realm.objectForPrimaryKey(Playlist, playlistId)!;
      appendOperation(realm, playlist, {
        type: 'update_entry',
        entryId: trackEntryId,
        description: null,
      });
      rebuildDisplayed(realm, playlistId);
    });

    const entry = realm.objectForPrimaryKey(PlaylistEntry, trackEntryId)!;
    expect(entry.canonicalDescription).toBe('Listen at 2:00.');
    expect(entry.description).toBeNull();
    expect(entry.descriptionMarkdown).toBeNull();
  });

  it('includes descriptions and text blocks when creating the playlist on an account', () => {
    realm.write(() => {
      issueCreateCommand(realm, realm.objectForPrimaryKey(Playlist, playlistId)!);
    });

    const command = realm.objects(PlaylistCommand).filtered('playlistId == $0', playlistId)[0];
    const request = JSON.parse(command.requestJson) as CreatePlaylistRequest;
    expect(request.segments).toEqual([
      {
        segment_id: segmentId,
        description: snapshot.segments[0].description,
        entries: [
          {
            entry_id: trackEntryId,
            track_id: 'track_01890a5dac96774bbcceb302099a8056',
            description: 'Listen at 2:00.',
          },
          { entry_id: textEntryId, description: 'Then the jam.' },
        ],
      },
    ]);
  });
});
