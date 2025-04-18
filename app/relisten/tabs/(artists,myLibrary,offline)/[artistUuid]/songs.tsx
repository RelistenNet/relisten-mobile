import { useArtistSongs } from '@/relisten/realm/models/song_repo';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { Link, useLocalSearchParams } from 'expo-router';
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
import { Song } from '@/relisten/realm/models/song';
import { useGroupSegment } from '@/relisten/util/routes';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistSongs(String(artistUuid));
  const { data } = results;

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={SongList}
        songs={Array.from(data.songs)}
        filterOptions={{ persistence: { key: ['artists', artistUuid, 'songs'].join('/') } }}
      />
    </RefreshContextProvider>
  );
}

interface SongListItemProps {
  song: Song;
}

const SongListItem = ({ song }: SongListItemProps) => {
  const groupSegment = useGroupSegment(true);

  return (
    <Link
      href={{
        pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/song/[songUuid]/` as const,
        params: {
          artistUuid: song.artistUuid,
          songUuid: song.uuid,
        },
      }}
      asChild
    >
      <SectionedListItem>
        <Flex column>
          <RowTitle>{song.name}</RowTitle>
          <SubtitleRow>
            <SubtitleText>
              {'Played at '}
              <Plur word="show" count={song.showsPlayedAt} />
            </SubtitleText>
          </SubtitleRow>
        </Flex>
      </SectionedListItem>
    </Link>
  );
};

interface SongHeaderProps {
  songs: Song[];
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

export enum SongFilterPersistenceKey {
  Library = 'library',
  Name = 'name',
  Plays = 'plays',
  Search = 'search',
}

const SONG_FILTERS: Filter<SongFilterPersistenceKey, Song>[] = [
  {
    persistenceKey: SongFilterPersistenceKey.Library,
    title: 'My Library',
    active: false,
    filter: (y) => y.isFavorite,
  },
  {
    persistenceKey: SongFilterPersistenceKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: true,
    isNumeric: false,
    sort: (songs) => songs.sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    persistenceKey: SongFilterPersistenceKey.Plays,
    title: '# of Plays',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (songs) => songs.sort((a, b) => a.showsPlayedAt - b.showsPlayedAt),
  },
  {
    persistenceKey: SongFilterPersistenceKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (song, searchText) => {
      const search = searchText.toLowerCase();

      return song.name.toLowerCase().indexOf(search) !== -1;
    },
  },
];

interface SongListProps {
  songs: Song[];
  filterOptions: FilteringOptions<SongFilterPersistenceKey>;
}

const SongList = ({
  songs,
  filterOptions,
}: SongListProps & Omit<FilterableListProps<Song>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={SONG_FILTERS} options={filterOptions}>
      <FilterableList
        ListHeaderComponent={<SongHeader songs={songs} />}
        data={[{ data: songs }]}
        renderItem={({ item }: { item: Song; index: number }) => <SongListItem song={item} />}
      />
    </FilteringProvider>
  );
};
