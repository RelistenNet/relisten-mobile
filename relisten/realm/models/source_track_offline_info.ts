import Realm from 'realm';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

export const ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY = 'deletedAt == nil';

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
      deletedAt: { type: 'date', optional: true, indexed: true },

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
  startedAt?: Date;
  completedAt?: Date;

  downloadedBytes!: number;
  totalBytes!: number;
  percent!: number;

  errorInfo?: string;
  deletedAt?: Date;

  sourceTracks!: Realm.List<SourceTrack>;

  get sourceTrack() {
    return this.sourceTracks[0];
  }

  isPlayableOffline() {
    return !this.deletedAt && this.status == SourceTrackOfflineInfoStatus.Succeeded;
  }
}
