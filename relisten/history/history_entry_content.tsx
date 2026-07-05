import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import {
  playerDisplayTitle,
  playerTrackMetadata,
} from '@/relisten/player/ui/player_display_helpers';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { type ReactNode } from 'react';
import { View } from 'react-native';

type HistoryEntryContentProps = {
  action?: ReactNode;
  leading?: ReactNode;
  sourceTrack: SourceTrack;
  trailing?: ReactNode;
};

export function HistoryEntryContent({
  action,
  leading,
  sourceTrack,
  trailing,
}: HistoryEntryContentProps) {
  const metadata = playerTrackMetadata(sourceTrack);

  return (
    <View className="min-w-0 flex-row items-center">
      {leading}
      <View className="min-w-0 flex-1 py-2">
        <View className="min-w-0 flex-row items-start">
          <RelistenText className="flex-1 shrink text-base font-semibold" selectable={false}>
            {playerDisplayTitle(sourceTrack.title)}
          </RelistenText>
          <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
        </View>
        <RelistenText className="mt-[3px] text-sm text-gray-300/70" selectable={false}>
          {metadata}
        </RelistenText>
      </View>
      {trailing ? <View className="ml-2">{trailing}</View> : null}
      {action}
    </View>
  );
}
