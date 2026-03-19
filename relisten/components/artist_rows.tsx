import Flex from '@/relisten/components/flex';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Plur from '@/relisten/components/plur';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { PopularityIndicator } from '@/relisten/components/popularity_indicator';
import { Artist } from '@/relisten/realm/models/artist';
import {
  ArtistMetadataSummary,
  useOfflineArtistMetadata,
} from '@/relisten/realm/models/artist_repo';
import { useArtistHasOfflineTracks } from '@/relisten/realm/root_services';
import { useGroupSegment, useIsOfflineTab } from '@/relisten/util/routes';
import { Link } from 'expo-router';
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useFilters } from '@/relisten/components/filtering/filters';
import { ArtistSortKey } from '@/relisten/components/artist_filters';

type TouchableOpacityRef = React.ElementRef<typeof TouchableOpacity>;
type ArtistListItemProps = {
  artist: Artist;
  metadata?: ArtistMetadataSummary;
  isTrendingSort?: boolean;
};

const ArtistPopularitySummary = ({
  artist,
  isTrendingSort,
}: {
  artist: Artist;
  isTrendingSort: boolean;
}) => {
  return (
    <PopularityIndicator
      popularity={artist.popularity?.snapshot()}
      isTrendingSort={isTrendingSort}
    />
  );
};

const ArtistRowActions = ({ artist }: { artist: Artist }) => {
  return (
    <Flex className="items-center gap-2">
      <FavoriteObjectButton object={artist} />
    </Flex>
  );
};

const ArtistListItemLayout = React.forwardRef<
  TouchableOpacityRef,
  { artist: Artist; metadata: ArtistMetadataSummary; isTrendingSort: boolean }
>(({ artist, metadata, isTrendingSort }, ref) => {
  const groupSegment = useGroupSegment();
  const hasOfflineTracks = useArtistHasOfflineTracks(artist.uuid);

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
                <ArtistPopularitySummary artist={artist} isTrendingSort={isTrendingSort} />
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

export const ArtistListItem = React.forwardRef<TouchableOpacityRef, ArtistListItemProps>(
  ({ artist, metadata: providedOfflineMetadata, isTrendingSort = false }, ref) => {
    const isOfflineTab = useIsOfflineTab();
    if (isOfflineTab) {
      return (
        <OfflineArtistListItem
          artist={artist}
          metadata={providedOfflineMetadata}
          isTrendingSort={isTrendingSort}
          ref={ref}
        />
      );
    }

    return <OnlineArtistListItem artist={artist} ref={ref} />;
  }
);

const OnlineArtistListItem = React.forwardRef<TouchableOpacityRef, { artist: Artist }>(
  ({ artist }, ref) => {
    const { filters } = useFilters<ArtistSortKey, Artist>();
    const isTrendingSort = filters.some(
      (filter) => filter.active && filter.persistenceKey === ArtistSortKey.Trending
    );
    const metadata: ArtistMetadataSummary = {
      shows: artist.showCount,
      sources: artist.sourceCount,
    };

    return (
      <ArtistListItemLayout
        artist={artist}
        metadata={metadata}
        isTrendingSort={isTrendingSort}
        ref={ref}
      />
    );
  }
);

const OfflineArtistListItem = React.forwardRef<TouchableOpacityRef, ArtistListItemProps>(
  ({ artist, metadata: providedMetadata, isTrendingSort = false }, ref) => {
    const queriedMetadata = useOfflineArtistMetadata(artist);
    const metadata = providedMetadata ?? queriedMetadata;

    return (
      <ArtistListItemLayout
        artist={artist}
        metadata={metadata}
        isTrendingSort={isTrendingSort}
        ref={ref}
      />
    );
  }
);
