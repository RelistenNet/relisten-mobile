import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { playerDisplayTitle, playerQueueDate } from '@/relisten/player/ui/player_display_helpers';
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
  const metadata = [
    sourceTrack.artist.name,
    playerQueueDate(sourceTrack.show.displayDate),
    sourceTrack.show.venue?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={{ alignItems: 'center', flexDirection: 'row', minWidth: 0 }}>
      {leading}
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 8 }}>
        <View style={{ alignItems: 'flex-start', flexDirection: 'row', minWidth: 0 }}>
          <RelistenText
            className="shrink text-base font-semibold"
            selectable={false}
            style={{ flex: 1, flexShrink: 1 }}
          >
            {playerDisplayTitle(sourceTrack.title)}
          </RelistenText>
          <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
        </View>
        <RelistenText
          className="text-sm text-gray-300/70"
          selectable={false}
          style={{ marginTop: 3 }}
        >
          {metadata}
        </RelistenText>
      </View>
      {trailing ? <View style={{ marginLeft: 8 }}>{trailing}</View> : null}
      {action}
    </View>
  );
}
