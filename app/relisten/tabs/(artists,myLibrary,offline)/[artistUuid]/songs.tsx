import { ArtistSongBrowseItem, useArtistSongs } from '@/relisten/realm/models/song_repo';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Link, useLocalSearchParams, useNavigation } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import {
  Filter,
  FilteringOptions,
  FilteringProvider,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import { useGroupSegment } from '@/relisten/util/routes';
import { useEffect, useMemo } from 'react';
import { useLibraryMembershipRevision, useRootLibraryIndex } from '@/relisten/realm/root_services';
import { FavoriteObjectButton } from '@/relisten/components/favorite_icon_button';

export default function Page() {
  const navigation = useNavigation();
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistSongs(String(artistUuid));
  const { data } = results;

  useEffect(() => {
    navigation.setOptions({
      title: 'Songs',
    });
  }, [navigation]);

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={SongList}
        isLoading={results.isNetworkLoading}
        songs={data.songs}
        filterOptions={{
          persistence: { key: ['artists', artistUuid, 'songs'].join('/') },
        }}
      />
    </RefreshContextProvider>
  );
}

interface SongListItemProps {
  item: ArtistSongBrowseItem;
}

const songName = (item: ArtistSongBrowseItem) => item.song.name.trim() || 'Unknown song';
const songShowCount = (item: ArtistSongBrowseItem) =>
  item.kind === 'song' ? (item.song.matchedShowCount ?? 0) : item.song.showsPlayedAt;

const SongListItem = ({ item }: SongListItemProps) => {
  const groupSegment = useGroupSegment();

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/song/[songUuid]/` as const,
        params: {
          artistUuid: item.song.artistUuid,
          songUuid: item.routeId,
          songKind: item.kind,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex className="items-center justify-between" full>
          <Flex className="min-w-0 flex-1 pr-3" column>
            <RowTitle>{songName(item)}</RowTitle>
            <SubtitleRow>
              <SubtitleText>
                <Plur word="show" count={songShowCount(item)} />
              </SubtitleText>
            </SubtitleRow>
          </Flex>
          <FavoriteObjectButton object={item.song} />
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

interface SongHeaderProps {
  songs: ArtistSongBrowseItem[];
}

const SongHeader = ({ songs }: SongHeaderProps) => {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        Songs
      </RelistenText>
      <RelistenText className="text-l w-full pb-2 text-center italic text-gray-400">
        <Plur word="Song" count={songs.length} />
      </RelistenText>
    </>
  );
};

enum SongFilterPersistenceKey {
  Library = 'library',
  Name = 'name',
  Plays = 'plays',
  Search = 'search',
}

const songFilters = (
  isFavorite: (item: ArtistSongBrowseItem) => boolean
): Filter<SongFilterPersistenceKey, ArtistSongBrowseItem>[] => [
  {
    persistenceKey: SongFilterPersistenceKey.Library,
    title: 'My Library',
    active: false,
    filter: isFavorite,
  },
  {
    persistenceKey: SongFilterPersistenceKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: false,
    sort: (songs) => songs.sort((a, b) => songName(a).localeCompare(songName(b))),
  },
  {
    persistenceKey: SongFilterPersistenceKey.Plays,
    title: '# of Shows',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (songs) => songs.sort((a, b) => songShowCount(a) - songShowCount(b)),
  },
  {
    persistenceKey: SongFilterPersistenceKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (song, searchText) => {
      const search = searchText.toLowerCase();

      return songName(song).toLowerCase().indexOf(search) !== -1;
    },
  },
];

interface SongListProps {
  songs: ArtistSongBrowseItem[];
  filterOptions: FilteringOptions<SongFilterPersistenceKey>;
}

const SongList = ({
  songs,
  filterOptions,
  ...props
}: SongListProps & Omit<FilterableListProps<ArtistSongBrowseItem>, 'data' | 'renderItem'>) => {
  const libraryIndex = useRootLibraryIndex();
  const libraryMembershipRevision = useLibraryMembershipRevision();
  const filters = useMemo(
    () =>
      songFilters((item) =>
        item.kind === 'song'
          ? libraryIndex.isFavorite('song', item.song.id)
          : libraryIndex.isFavorite('imported_song', item.song.uuid)
      ),
    [libraryIndex, libraryMembershipRevision]
  );

  return (
    <FilteringProvider filters={filters} options={filterOptions}>
      <FilterableList
        {...props}
        ListHeaderComponent={<SongHeader songs={songs} />}
        data={[{ data: songs }]}
        renderItem={({ item }) => <SongListItem item={item} />}
        nonIdealState={{
          noData: {
            title: 'No Songs',
            description: 'No song information is available for this artist.',
          },
        }}
      />
    </FilteringProvider>
  );
};
