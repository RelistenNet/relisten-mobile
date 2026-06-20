import Realm from 'realm';

export class ScopedPlaybackHistoryEntry extends Realm.Object<ScopedPlaybackHistoryEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'ScopedPlaybackHistoryEntry',
    primaryKey: 'scopedId',
    properties: {
      scopedId: 'string',
      scopeId: { type: 'string', indexed: true },
      clientEventUuid: { type: 'string', indexed: true },
      deviceId: 'string',
      sourceTrackUuid: { type: 'string', indexed: true },
      sourceUuid: { type: 'string', indexed: true },
      showUuid: { type: 'string', indexed: true, optional: true },
      artistUuid: { type: 'string', indexed: true, optional: true },
      playlistUuid: { type: 'string', indexed: true, optional: true },
      playlistEntryUuid: { type: 'string', indexed: true, optional: true },
      blockUuid: { type: 'string', indexed: true, optional: true },
      blockPosition: 'int?',
      playedAt: 'date',
      playbackFlags: 'int',
      platform: 'string?',
      appVersion: 'string?',
      syncStatus: 'string',
      syncedAt: 'date?',
      lastError: 'string?',
    },
  };

  scopedId!: string;
  scopeId!: string;
  clientEventUuid!: string;
  deviceId!: string;
  sourceTrackUuid!: string;
  sourceUuid!: string;
  showUuid?: string;
  artistUuid?: string;
  playlistUuid?: string;
  playlistEntryUuid?: string;
  blockUuid?: string;
  blockPosition?: number;
  playedAt!: Date;
  playbackFlags!: number;
  platform?: string;
  appVersion?: string;
  syncStatus!: string;
  syncedAt?: Date;
  lastError?: string;
}
