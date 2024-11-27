import Realm from 'realm';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';

export enum PlaybackFlags {
  None = 0,
  Online = 1 << 0,
  Offline = 1 << 1,
  NetworkAvailable = 1 << 2,
  NetworkUnavailable = 1 << 3,
  // TODO: add info on CarPlay, Casting, etc
}

export class PlaybackHistoryEntry extends Realm.Object<PlaybackHistoryEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaybackHistoryEntry',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      playbackFlags: 'int',
      publishedAt: 'date?',

      createdAt: 'date',
      playbackStartedAt: 'date',

      sourceTrack: 'SourceTrack',
      artist: 'Artist',
      show: 'Show',
      source: 'Source',
    },
  };

  uuid!: string;
  playbackFlags!: number;
  publishedAt?: Date;

  createdAt!: Date;
  playbackStartedAt!: Date;

  sourceTrack!: SourceTrack;
  artist!: Artist;
  show!: Show;
  source!: Source;
}
