import Realm from 'realm';
import { LastFmScrobbleEntry } from '@/relisten/realm/models/lastfm_scrobble_entry';
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
      return;
    }

    const persisted = this.realm.objects(LastFmScrobbleEntry);
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
        this.realm.delete(staleEntries);
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
    this.persist(entry);
    this.prune();

    return entry;
  }

  markAttempt(id: string, success: boolean) {
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
    this.persist(entry);
  }

  list(): LastFmScrobbleQueueEntry[] {
    this.loadPersisted();

    return [...this.entries.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  clearAll() {
    this.entries.clear();
    this.realm.write(() => {
      const allEntries = this.realm.objects(LastFmScrobbleEntry);
      this.realm.delete(allEntries);
    });
  }

  private persist(entry: LastFmScrobbleQueueEntry) {
    this.realm.write(() => {
      this.realm.create(
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
        },
        Realm.UpdateMode.Modified
      );
    });
  }

  private deletePersisted(id: string) {
    this.realm.write(() => {
      const existing = this.realm.objectForPrimaryKey(LastFmScrobbleEntry, id);
      if (existing) {
        this.realm.delete(existing);
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
