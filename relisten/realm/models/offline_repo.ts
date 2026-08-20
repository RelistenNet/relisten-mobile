import { useQuery } from '@/relisten/realm/schema';
import {
  ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY,
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';

export function useRemainingDownloads() {
  return useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered(
      `${ACTIVE_SOURCE_TRACK_OFFLINE_INFO_QUERY} AND status != $0`,
      SourceTrackOfflineInfoStatus.Succeeded
    )
  );
}
