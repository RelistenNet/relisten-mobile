import Realm from 'realm';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { Artist } from '@/relisten/realm/models/artist';
import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import dayjs from 'dayjs';

export enum PlaybackFlags {
  None = 0,
  Online = 1 << 0,
  Offline = 1 << 1,
  NetworkAvailable = 1 << 2,
  NetworkUnavailable = 1 << 3,
  // TODO: add info on CarPlay, Casting, etc
}

/**
 * One play that crossed the listening threshold. Each row is bound when it is
 * created to where it reports: the account signed in at that moment
 * (`destinationUserId`, with a `play_` ID the account deduplicates by), or no
 * account, which reports anonymously to `/live/play`. A row never changes
 * destination, so a retry goes where the first attempt went. `publishedAt` is
 * set once the destination has the play.
 */
export class PlaybackHistoryEntry extends Realm.Object<PlaybackHistoryEntry> {
  static schema: Realm.ObjectSchema = {
    name: 'PlaybackHistoryEntry',
    primaryKey: 'uuid',
    properties: {
      uuid: 'string',
      playbackFlags: 'int',
      publishedAt: { type: 'date', optional: true, indexed: true },
      destinationUserId: { type: 'string', optional: true, indexed: true },
      playId: 'string?',
      // Where the play came from, when it was queued from a playlist.
      playlistId: 'string?',
      playlistEntryId: 'string?',
      // The catalog's duration for the track when it was played.
      catalogDurationMs: 'int?',

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
  destinationUserId?: string;
  playId?: string;
  playlistId?: string;
  playlistEntryId?: string;
  catalogDurationMs?: number;

  createdAt!: Date;
  playbackStartedAt!: Date;

  private _humanizedPlaybackStartedAt?: string;
  humanizedPlaybackStartedAt() {
    if (!this._humanizedPlaybackStartedAt) {
      this._humanizedPlaybackStartedAt = dayjs(this.playbackStartedAt).format('LT');
    }

    return this._humanizedPlaybackStartedAt;
  }

  sourceTrack!: SourceTrack;
  artist!: Artist;
  show!: Show;
  source!: Source;
}
