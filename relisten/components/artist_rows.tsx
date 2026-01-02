import Flex from '@/relisten/components/flex';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Plur from '@/relisten/components/plur';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { useGroupSegment, useRoute } from '@/relisten/util/routes';
import { MaterialIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { ComponentProps } from 'react';
import { TouchableOpacity } from 'react-native';

type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;

const getMomentumBucket = (momentumScore?: number) => {
  if (momentumScore === undefined || momentumScore === null) {
    return undefined;
  }

  if (momentumScore < 0.25) {
    return 1;
  }

  if (momentumScore < 0.5) {
    return 2;
  }

  if (momentumScore < 0.75) {
    return 3;
  }

  return 4;
};

const formatPlays30d = (plays?: number) => {
  if (!plays || plays <= 0) {
    return undefined;
  }

  if (plays >= 1_000_000) {
    const value = (plays / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${value}M`;
  }

  if (plays >= 1_000) {
    const value = (plays / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${value}k`;
  }

  if (plays >= 100) {
    const value = (plays / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${value}k`;
  }

  return plays.toFixed(0);
};

const ArtistPopularitySummary = ({ artist }: { artist: Artist }) => {
  const bucket = getMomentumBucket(artist.popularity?.momentumScore);
  const plays30dText = formatPlays30d(artist.popularity?.windows?.days30d?.plays);

  if (!bucket && !plays30dText) {
    return null;
  }

  const icon =
    bucket &&
    {
      1: 'trending-down' as ComponentProps<typeof MaterialIcons>['name'],
      2: undefined,
      3: undefined,
      4: 'trending-up' as ComponentProps<typeof MaterialIcons>['name'],
    }[bucket];

  return (
    <Flex className="items-center gap-1">
      {icon ? <MaterialIcons name={icon} color="white" size={16} /> : null}
      {plays30dText ? (
        <RelistenText className="text-xs text-gray-400">{plays30dText} 30d</RelistenText>
      ) : null}
    </Flex>
  );
};

const ArtistRowActions = ({ artist }: { artist: Artist }) => {
  return (
    <Flex className="items-center gap-2">
      <FavoriteObjectButton object={artist} />
    </Flex>
  );
};

export const ArtistListItem = React.forwardRef<TouchableOpacityRef, { artist: Artist }>(
  ({ artist }, ref) => {
  const groupSegment = useGroupSegment();
  const metadata = useArtistMetadata(artist);
  const hasOfflineTracks = artist.hasOfflineTracks;

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem ref={ref}>
        <Flex cn="items-center justify-between" full>
          <Flex cn="flex-1 flex-col pr-3">
            <Flex cn="items-center">
              <Flex cn="flex-1 pr-2">
                <RowTitle>{artist.name}</RowTitle>
              </Flex>
              <Flex cn="flex-shrink-0 items-center">
                <ArtistPopularitySummary artist={artist} />
              </Flex>
            </Flex>
            <SubtitleRow cn="flex flex-row justify-between">
              <SubtitleText>
                <Plur word="show" count={metadata.shows} />
                {hasOfflineTracks && (
                  <>
                    &nbsp;
                    <SourceTrackSucceededIndicator />
                  </>
                )}
              </SubtitleText>
              <SubtitleText>
                <Plur word="tape" count={metadata.sources} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <ArtistRowActions artist={artist} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
});

export const ArtistCompactListItem = React.forwardRef<TouchableOpacityRef, { artist: Artist }>(
  ({ artist }, ref) => {
  const nextRoute = useRoute('[artistUuid]');

  return (
    <Link
      href={{
        pathname: nextRoute,
        params: {
          artistUuid: artist.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem ref={ref}>
        <Flex cn="items-center justify-between" full>
          <Flex cn="flex-1 flex-col pr-3">
            <Flex cn="items-center">
              <Flex cn="flex-1 pr-2">
                <RowTitle>{artist.name}</RowTitle>
              </Flex>
              <Flex cn="flex-shrink-0 items-center">
                <ArtistPopularitySummary artist={artist} />
              </Flex>
            </Flex>
          </Flex>
          <ArtistRowActions artist={artist} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
});
