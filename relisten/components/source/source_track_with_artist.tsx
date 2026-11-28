import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import {
  SectionedListItem,
  type SectionedListItemProps,
  type TouchableOpacityRef,
} from '@/relisten/components/sectioned_list_item';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import type { PopularitySnapshot } from '@/relisten/realm/models/popularity';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { SourceTrack } from '@/relisten/realm/models/source_track';
import { ShowLink } from '@/relisten/util/push_show';
import React, { PropsWithChildren } from 'react';
import { View } from 'react-native';

/**
 * What a track row prints. A file on the device supplies it through
 * `trackWithArtistFields`; a search result builds it from the catalog's response.
 */
export interface TrackWithArtistFields {
  title: string;
  isSoundboard: boolean;
  isPlayableOffline: boolean;
  artistName: string;
  displayDate: string;
  durationLabel?: string;
}

export function trackWithArtistFields(sourceTrack: SourceTrack): TrackWithArtistFields {
  return {
    title: sourceTrack.title,
    isSoundboard: sourceTrack.source.isSoundboard,
    isPlayableOffline: !!sourceTrack.offlineInfo?.isPlayableOffline(),
    artistName: sourceTrack.artist.name,
    displayDate: sourceTrack.show.displayDate,
    durationLabel: sourceTrack.humanizedDuration,
  };
}

/**
 * The track row itself, without its link: `TrackWithArtist` wraps it in a
 * `ShowLink`, and search passes its own `onPress`. `children` add to the
 * subtitle, such as the venue.
 */
export const TrackWithArtistRow = React.forwardRef<
  TouchableOpacityRef,
  SectionedListItemProps & {
    fields: TrackWithArtistFields;
    offlineIndicator?: boolean;
    /**
     * The file's listening activity. When given, it ends the title line with
     * the duration beside it, as show rows pair their activity with the rating.
     */
    popularity?: PopularitySnapshot | null;
    indicatorComponent?: React.ReactNode;
    subtitleColumn?: boolean;
  }
>(
  (
    {
      fields,
      children,
      offlineIndicator = true,
      popularity,
      indicatorComponent,
      subtitleColumn,
      ...pressable
    },
    ref
  ) => {
    return (
      <SectionedListItem ref={ref} {...pressable}>
        <Flex className="flex items-center justify-between" full>
          <Flex className="flex-1 pr-2" column>
            <Flex className="items-center" style={{ gap: 8 }}>
              <RowTitle>{fields.title}</RowTitle>
              {fields.isSoundboard && (
                <RelistenText className="text-xs font-bold text-relisten-blue-600">
                  SBD
                </RelistenText>
              )}
              {offlineIndicator && fields.isPlayableOffline && <SourceTrackSucceededIndicator />}
              <View className="grow" />
              {popularity !== undefined ? (
                <Flex className="items-center" style={{ gap: 8 }}>
                  <PopularityIndicator popularity={popularity} isTrendingSort={false} />
                  <SubtitleText>{fields.durationLabel}</SubtitleText>
                </Flex>
              ) : null}
            </Flex>
            <SubtitleRow {...{ column: !!subtitleColumn }}>
              <SubtitleText>
                {fields.artistName}
                &nbsp;&middot;&nbsp;
                {fields.displayDate}
              </SubtitleText>
              {children}
            </SubtitleRow>
          </Flex>
          {popularity !== undefined ? null : <SubtitleText>{fields.durationLabel}</SubtitleText>}

          {indicatorComponent}
        </Flex>
      </SectionedListItem>
    );
  }
);

TrackWithArtistRow.displayName = 'TrackWithArtistRow';

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
  return (
    <ShowLink
      show={{
        artist: sourceTrack.artist,
        showUuid: sourceTrack.show.uuid,
        sourceUuid: sourceTrack.source.uuid,
      }}
      asChild
    >
      <TrackWithArtistRow
        fields={trackWithArtistFields(sourceTrack)}
        offlineIndicator={offlineIndicator}
        indicatorComponent={indicatorComponent}
        subtitleColumn={subtitleColumn}
      >
        {children}
      </TrackWithArtistRow>
    </ShowLink>
  );
}
