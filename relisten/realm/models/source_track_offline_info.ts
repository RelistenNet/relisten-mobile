import Realm from 'realm';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

export enum SourceTrackOfflineInfoStatus {
  UNKNOWN,
  Queued,
  Downloading,
  Failed,
  Succeeded,
}

export enum SourceTrackOfflineInfoType {
  UNKNOWN,
  UserInitiated,
  StreamingCache,
}

export class SourceTrackOfflineInfo extends Realm.Object<SourceTrackOfflineInfo> {
  static schema: Realm.ObjectSchema = {
    name: 'SourceTrackOfflineInfo',
    primaryKey: 'sourceTrackUuid',
    properties: {
      sourceTrackUuid: 'string',
      status: 'int',
      type: 'int',

      queuedAt: 'date',
      startedAt: 'date?',
      completedAt: 'date?',

      downloadedBytes: { type: 'double', default: 0 },
      totalBytes: { type: 'double', default: 0 },
      // react-native-background-downloader only provides progress so store that as canonical
      percent: { type: 'double', default: 0 },

      errorInfo: 'string?',

      sourceTracks: {
        type: 'linkingObjects',
        objectType: 'SourceTrack',
        property: 'offlineInfo',
      },
    },
  };

  get uuid() {
    return this.sourceTrackUuid;
  }

  sourceTrackUuid!: string;
  status!: SourceTrackOfflineInfoStatus;
  type!: SourceTrackOfflineInfoType;

  queuedAt!: Date;
  startedAt!: Date;
  completedAt!: Date;

  downloadedBytes!: number;
  totalBytes!: number;
  percent!: number;

  errorInfo?: string;

  sourceTracks!: Realm.List<SourceTrack>;

  get sourceTrack() {
    return this.sourceTracks[0];
  }
}
