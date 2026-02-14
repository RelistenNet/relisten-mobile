import Flex from '@/relisten/components/flex';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Plur from '@/relisten/components/plur';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { useGroupSegment, useRoute } from '@/relisten/util/routes';
import { Link } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useFilters } from '@/relisten/components/filtering/filters';
import { ArtistSortKey } from '@/relisten/components/artist_filters';

type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;

const ArtistPopularitySummary = ({ artist }: { artist: Artist }) => {
  const { filters } = useFilters<ArtistSortKey, Artist>();
  const isTrendingSort = filters.some(
    (filter) => filter.active && filter.persistenceKey === ArtistSortKey.Trending
  );
  return <PopularityIndicator popularity={artist.popularity} isTrendingSort={isTrendingSort} />;
};

const ArtistRowActions = ({ artist }: { artist: Artist }) => {
  const actionLabel = artist.isFavorite
    ? `Remove ${artist.name} from favorites`
    : `Add ${artist.name} to favorites`;

  return (
    <Flex className="items-center">
      <FavoriteObjectButton object={artist} accessibilityLabel={actionLabel} />
    </Flex>
  );
};

export const ArtistListItem = React.forwardRef<TouchableOpacityRef, { artist: Artist }>(
  ({ artist }, ref) => {
    const groupSegment = useGroupSegment();
    const metadata = useArtistMetadata(artist);
    const hasOfflineTracks = artist.hasOfflineTracks;

    return (
      <Flex cn="items-center" full>
        <Link
          href={{
            pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <SectionedListItem ref={ref} cn="flex-1 pr-0">
            <Flex cn="flex-1 flex-col pr-2">
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
          </SectionedListItem>
        </Link>
        <Flex cn="pr-4">
          <ArtistRowActions artist={artist} />
        </Flex>
      </Flex>
    );
  }
);

export const ArtistCompactListItem = React.forwardRef<TouchableOpacityRef, { artist: Artist }>(
  ({ artist }, ref) => {
    const nextRoute = useRoute('[artistUuid]');

    return (
      <Flex cn="items-center" full>
        <Link
          href={{
            pathname: nextRoute,
            params: {
              artistUuid: artist.uuid,
            },
          }}
          asChild
        >
          <SectionedListItem ref={ref} cn="flex-1 pr-0">
            <Flex cn="flex-1 flex-col pr-2">
              <Flex cn="items-center">
                <Flex cn="flex-1 pr-2">
                  <RowTitle>{artist.name}</RowTitle>
                </Flex>
                <Flex cn="flex-shrink-0 items-center">
                  <ArtistPopularitySummary artist={artist} />
                </Flex>
              </Flex>
            </Flex>
          </SectionedListItem>
        </Link>
        <Flex cn="pr-4">
          <ArtistRowActions artist={artist} />
        </Flex>
      </Flex>
    );
  }
);
