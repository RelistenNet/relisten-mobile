import Realm from 'realm';

export interface LastFmScrobbleEntryProps {
  id: string;
  createdAt: Date;
  artist: string;
  track: string;
  album?: string;
  duration?: number;
  timestamp: Date;
  failureCount: number;
  lastAttemptAt?: Date;
}

export class LastFmScrobbleEntry
  extends Realm.Object<LastFmScrobbleEntry>
  implements LastFmScrobbleEntryProps
{
  static schema: Realm.ObjectSchema = {
    name: 'LastFmScrobbleEntry',
    primaryKey: 'id',
    properties: {
      id: 'string',
      createdAt: 'date',
      artist: 'string',
      track: 'string',
      album: 'string?',
      duration: 'double?',
      timestamp: 'date',
      failureCount: { type: 'int', default: 0 },
      lastAttemptAt: 'date?',
    },
  };

  id!: string;
  createdAt!: Date;
  artist!: string;
  track!: string;
  album?: string;
  duration?: number;
  timestamp!: Date;
  failureCount!: number;
  lastAttemptAt?: Date;
}
