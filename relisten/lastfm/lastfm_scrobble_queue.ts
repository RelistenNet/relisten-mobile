import Realm from 'realm';
import {
  ACTIVE_LASTFM_SCROBBLE_ENTRY_QUERY,
  LastFmScrobbleEntry,
} from '@/relisten/realm/models/lastfm_scrobble_entry';
import { log } from '@/relisten/util/logging';

const logger = log.extend('lastfm-queue');

const MAX_QUEUE_ENTRIES = 200;
const MAX_ENTRY_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface LastFmScrobblePayload {
  artist: string;
  track: string;
  album?: string;
  duration?: number;
  timestamp: Date;
}

export interface LastFmScrobbleQueueEntry extends LastFmScrobblePayload {
  id: string;
  createdAt: Date;
  failureCount: number;
  lastAttemptAt?: Date;
}

export class LastFmScrobbleQueue {
  private loaded = false;
  private entries = new Map<string, LastFmScrobbleQueueEntry>();

  constructor(private readonly realm: Realm) {}

  loadPersisted() {
    if (this.loaded) {
      this.reconcileEntriesWithRealm();
      return;
    }

    const persisted = this.realm
      .objects(LastFmScrobbleEntry)
      .filtered(ACTIVE_LASTFM_SCROBBLE_ENTRY_QUERY);
    const now = Date.now();
    const staleEntries: LastFmScrobbleEntry[] = [];

    for (const entry of persisted) {
      if (now - entry.createdAt.getTime() > MAX_ENTRY_AGE_MS) {
        staleEntries.push(entry);
        continue;
      }

      this.entries.set(entry.id, {
        id: entry.id,
        createdAt: entry.createdAt,
        artist: entry.artist,
        track: entry.track,
        album: entry.album,
        duration: entry.duration,
        timestamp: entry.timestamp,
        failureCount: entry.failureCount,
        lastAttemptAt: entry.lastAttemptAt,
      });
    }

    if (staleEntries.length > 0) {
      this.realm.write(() => {
        const deletedAt = new Date();
        for (const entry of staleEntries) {
          entry.deletedAt = deletedAt;
        }
      });
    }

    this.loaded = true;
    this.prune();
  }

  enqueue(payload: LastFmScrobblePayload) {
    this.loadPersisted();

    const id = this.buildId(payload);

    if (this.entries.has(id)) {
      return this.entries.get(id);
    }

    const entry: LastFmScrobbleQueueEntry = {
      id,
      createdAt: new Date(),
      failureCount: 0,
      ...payload,
    };

    this.entries.set(id, entry);
    this.persist(entry, true);
    this.prune();

    return entry;
  }

  markAttempt(id: string, success: boolean) {
    this.loadPersisted();

    const entry = this.entries.get(id);

    if (!entry) {
      return;
    }

    if (success) {
      this.entries.delete(id);
      this.deletePersisted(id);
      return;
    }

    entry.failureCount += 1;
    entry.lastAttemptAt = new Date();
    this.persist(entry, false);
  }

  list(): LastFmScrobbleQueueEntry[] {
    this.loadPersisted();

    return [...this.entries.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  clearAll() {
    this.entries.clear();
    this.realm.write(() => {
      const allEntries = this.realm
        .objects(LastFmScrobbleEntry)
        .filtered(ACTIVE_LASTFM_SCROBBLE_ENTRY_QUERY)
        .snapshot();
      const deletedAt = new Date();

      for (const entry of allEntries) {
        entry.deletedAt = deletedAt;
      }
    });
  }

  private persist(entry: LastFmScrobbleQueueEntry, allowResurrection: boolean) {
    this.realm.write(() => {
      const existing = this.realm.objectForPrimaryKey(LastFmScrobbleEntry, entry.id);
      if (!allowResurrection && (!existing || existing.deletedAt)) {
        this.entries.delete(entry.id);
        return;
      }

      const persisted = this.realm.create(
        LastFmScrobbleEntry,
        {
          id: entry.id,
          createdAt: entry.createdAt,
          artist: entry.artist,
          track: entry.track,
          album: entry.album,
          duration: entry.duration,
          timestamp: entry.timestamp,
          failureCount: entry.failureCount,
          lastAttemptAt: entry.lastAttemptAt,
          deletedAt: undefined,
        },
        Realm.UpdateMode.Modified
      );

      // A scrobble can be re-enqueued with the same deterministic id before
      // cold-start cleanup has physically collected its tombstone.
      persisted.deletedAt = undefined;
    });
  }

  private reconcileEntriesWithRealm() {
    const activeIds = new Set(
      this.realm
        .objects(LastFmScrobbleEntry)
        .filtered(ACTIVE_LASTFM_SCROBBLE_ENTRY_QUERY)
        .map((entry) => entry.id)
    );

    for (const id of this.entries.keys()) {
      if (!activeIds.has(id)) {
        this.entries.delete(id);
      }
    }
  }

  private deletePersisted(id: string) {
    this.realm.write(() => {
      const existing = this.realm.objectForPrimaryKey(LastFmScrobbleEntry, id);
      if (existing && !existing.deletedAt) {
        existing.deletedAt = new Date();
      }
    });
  }

  private prune() {
    const now = Date.now();

    for (const entry of this.entries.values()) {
      if (now - entry.createdAt.getTime() > MAX_ENTRY_AGE_MS) {
        this.entries.delete(entry.id);
        this.deletePersisted(entry.id);
      }
    }

    if (this.entries.size <= MAX_QUEUE_ENTRIES) {
      return;
    }

    const sorted = this.list();
    const overflow = sorted.length - MAX_QUEUE_ENTRIES;

    if (overflow <= 0) {
      return;
    }

    logger.warn(`Pruning ${overflow} Last.fm scrobble entries`);

    for (let i = 0; i < overflow; i += 1) {
      const entry = sorted[i];
      this.entries.delete(entry.id);
      this.deletePersisted(entry.id);
    }
  }

  private buildId(payload: LastFmScrobblePayload) {
    const album = payload.album ?? '';
    const timestamp = payload.timestamp.toISOString();

    return `${payload.artist}::${payload.track}::${album}::${timestamp}`;
  }
}
