import { useArtistSongs } from '@/relisten/realm/models/song_repo';
import Flex from '@/relisten/components/flex';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { SubtitleRow, SubtitleText } from '@/relisten/components/row_subtitle';
import RowTitle from '@/relisten/components/row_title';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { SectionedListItem } from '@/relisten/components/sectioned_list_item';
import { useLocalSearchParams } from 'expo-router';
import {
  FilterableList,
  FilterableListProps,
} from '@/relisten/components/filtering/filterable_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import Plur from '@/relisten/components/plur';
import { Filter, FilteringProvider, SortDirection } from '@/relisten/components/filtering/filters';
import { Song } from '@/relisten/realm/models/song';

export default function Page() {
  const { artistUuid } = useLocalSearchParams();
  const results = useArtistSongs(String(artistUuid));
  const { data } = results;

  return (
    <RefreshContextProvider networkBackedResults={results}>
      <DisappearingHeaderScreen
        ScrollableComponent={SongList}
        songs={Array.from(data.songs)}
        filterPersistenceKey={['artists', artistUuid, 'songs'].join('/')}
      />
    </RefreshContextProvider>
  );
}

interface SongListItemProps {
  song: Song;
}

const SongListItem = ({ song }: SongListItemProps) => {
  return (
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

const SONG_FILTERS: Filter<Song>[] = [
  { persistenceKey: 'library', title: 'My Library', active: false, filter: (y) => y.isFavorite },
  {
    persistenceKey: 'name',
    title: 'Name',
    sortDirection: SortDirection.Descending,
    active: true,
    isNumeric: false,
    sort: (songs) => songs.sort((a, b) => a.name.localeCompare(b.name)),
  },
  {
    persistenceKey: 'plays',
    title: '# of Plays',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (songs) => songs.sort((a, b) => a.showsPlayedAt - b.showsPlayedAt),
  },
];

interface SongListProps {
  songs: Song[];
  filterPersistenceKey: string;
}

const SongList = ({
  songs,
  filterPersistenceKey,
}: SongListProps & Omit<FilterableListProps<Song>, 'data' | 'renderItem'>) => {
  return (
    <FilteringProvider filters={SONG_FILTERS} filterPersistenceKey={filterPersistenceKey}>
      <FilterableList
        ListHeaderComponent={<SongHeader songs={songs} />}
        className="w-full flex-1"
        data={songs}
        renderItem={({ item }: { item: Song; index: number }) => <SongListItem song={item} />}
      />
    </FilteringProvider>
  );
};
