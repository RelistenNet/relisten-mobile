import { useQuery } from '@/relisten/realm/schema';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';

export function useRemainingDownloads() {
  return useQuery(SourceTrackOfflineInfo, (query) =>
    query.filtered('status != $0', SourceTrackOfflineInfoStatus.Succeeded)
  );
}
