import Flex from '@/relisten/components/flex';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';
import Plur from '@/relisten/components/plur';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { SourceTrackSucceededIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import { Tag } from '@/relisten/components/tag';
import { Artist } from '@/relisten/realm/models/artist';
import { useArtistMetadata } from '@/relisten/realm/models/artist_repo';
import { useRoute } from '@/relisten/util/routes';
import { Link } from 'expo-router';
import React from 'react';

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

const PopularityBucketTag = ({ artist }: { artist: Artist }) => {
  const bucket = getMomentumBucket(artist.popularity?.momentumScore);

  if (!bucket) {
    return null;
  }

  return <Tag className="px-2 py-1 text-xs text-gray-200">Momentum {bucket}</Tag>;
};

const ArtistRowActions = ({ artist }: { artist: Artist }) => {
  return (
    <Flex className="items-center gap-2">
      <PopularityBucketTag artist={artist} />
      <FavoriteObjectButton object={artist} />
    </Flex>
  );
};

export const ArtistListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
  const nextRoute = useRoute('[artistUuid]');
  const metadata = useArtistMetadata(artist);
  const hasOfflineTracks = artist.hasOfflineTracks;

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
            <RowTitle>{artist.name}</RowTitle>
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

export const ArtistCompactListItem = React.forwardRef(({ artist }: { artist: Artist }, ref) => {
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
            <RowTitle>{artist.name}</RowTitle>
          </Flex>
          <ArtistRowActions artist={artist} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
});
