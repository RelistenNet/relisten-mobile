/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLAYLIST_REALM_MODELS, PlaylistEntry } from '@/relisten/realm/models/playlists/playlist';
import { migratePlaylistRows } from './playlist_migration';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migratePlaylistRows', () => {
  it('keeps existing tracks visible when schema 26 adds live', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relisten-playlist-migration-'));
    dirs.push(dir);
    const path = join(dir, 'test.realm');

    const v25 = new Realm({
      path,
      schemaVersion: 25,
      schema: [
        {
          name: 'PlaylistEntry',
          primaryKey: 'entryId',
          properties: {
            entryId: 'string',
            playlistId: 'string',
            segmentId: 'string',
            trackId: 'string',
            rank: 'string',
          },
        },
      ],
    });
    v25.write(() => {
      v25.create('PlaylistEntry', {
        entryId: 'e',
        playlistId: 'p',
        segmentId: 's',
        trackId: 't',
        rank: 'a0',
      });
    });
    v25.close();

    const v26 = new Realm({
      path,
      schemaVersion: 26,
      schema: PLAYLIST_REALM_MODELS,
      onMigration: migratePlaylistRows,
    });
    expect(v26.objectForPrimaryKey(PlaylistEntry, 'e')?.live).toBe(true);
    v26.close();
  });
});
