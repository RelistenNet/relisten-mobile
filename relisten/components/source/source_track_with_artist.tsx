import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import Flex from '@/relisten/components/flex';
import RowTitle from '@/relisten/components/row_title';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { View } from 'react-native';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import { Link } from 'expo-router';
import React, { PropsWithChildren } from 'react';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { useGroupSegment } from '@/relisten/util/routes';

export function TrackWithArtist({
  sourceTrack,
  children,
  offlineIndicator,
  indicatorComponent,
  subtitleColumn,
}: PropsWithChildren<{
  offlineIndicator?: boolean;
  sourceTrack: SourceTrack;
  indicatorComponent?: React.ReactNode;
  subtitleColumn?: boolean;
}>) {
  const groupSegment = useGroupSegment();

  if (offlineIndicator === undefined) {
    offlineIndicator = true;
  }

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,
        params: {
          artistUuid: sourceTrack.artist.uuid,
          showUuid: sourceTrack.show.uuid,
          sourceUuid: sourceTrack.source.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex className="flex items-center justify-between" full>
          <Flex className="flex-1 pr-2" column>
            <Flex className="items-center" style={{ gap: 8 }}>
              <RowTitle>{sourceTrack.title}</RowTitle>
              {sourceTrack.source.isSoundboard && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
              {offlineIndicator && sourceTrack.offlineInfo?.isPlayableOffline() && (
                <SourceTrackSucceededIndicator />
              )}
              <View className="grow" />
            </Flex>
            <SubtitleRow {...{ column: !!subtitleColumn }}>
              <SubtitleText>
                {sourceTrack.artist.name}
                &nbsp;&middot;&nbsp;
                {sourceTrack.show.displayDate}
              </SubtitleText>
              {children}
            </SubtitleRow>
          </Flex>
          <SubtitleText>{sourceTrack.humanizedDuration}</SubtitleText>

          {indicatorComponent}
        </Flex>
      </SectionedListItem>
    </Link>
  );
}
