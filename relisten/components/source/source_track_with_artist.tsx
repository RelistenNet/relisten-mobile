import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { readRetainedCatalogObject } from '@/relisten/realm/catalog_retirement';
import { ShowLink } from '@/relisten/util/push_show';
import React, { PropsWithChildren } from 'react';
import { View } from 'react-native';

export function TrackWithArtist({
  sourceTrack,
  children,
  offlineIndicator,
  indicatorComponent,
  subtitleColumn,
  retainedAccessSite = 'history.track-row',
}: PropsWithChildren<{
  offlineIndicator?: boolean;
  sourceTrack: SourceTrack;
  indicatorComponent?: React.ReactNode;
  subtitleColumn?: boolean;
  retainedAccessSite?: string;
}>) {
  if (offlineIndicator === undefined) {
    offlineIndicator = true;
  }

  const retainedSourceTrack = readRetainedCatalogObject(
    sourceTrack,
    `${retainedAccessSite}.source-track`
  );
  const artist = readRetainedCatalogObject(
    retainedSourceTrack?.artist,
    `${retainedAccessSite}.artist`
  );
  const show = readRetainedCatalogObject(retainedSourceTrack?.show, `${retainedAccessSite}.show`);
  const source = readRetainedCatalogObject(
    retainedSourceTrack?.source,
    `${retainedAccessSite}.source`
  );

  if (!retainedSourceTrack || !artist || !show || !source) {
    return null;
  }

  return (
    <ShowLink
      show={{
        artist,
        showUuid: show.uuid,
        sourceUuid: source.uuid,
      }}
      asChild
    >
      <SectionedListItem>
        <Flex className="flex items-center justify-between" full>
          <Flex className="flex-1 pr-2" column>
            <Flex className="items-center" style={{ gap: 8 }}>
              <RowTitle>{retainedSourceTrack.title}</RowTitle>
              {source.isSoundboard && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
              {offlineIndicator && retainedSourceTrack.offlineInfo?.isPlayableOffline() && (
                <SourceTrackSucceededIndicator />
              )}
              <View className="grow" />
            </Flex>
            <SubtitleRow {...{ column: !!subtitleColumn }}>
              <SubtitleText>
                {artist.name}
                &nbsp;&middot;&nbsp;
                {show.displayDate}
              </SubtitleText>
              {children}
            </SubtitleRow>
          </Flex>
          <SubtitleText>{retainedSourceTrack.humanizedDuration}</SubtitleText>

          {indicatorComponent}
        </Flex>
      </SectionedListItem>
    </ShowLink>
  );
}
