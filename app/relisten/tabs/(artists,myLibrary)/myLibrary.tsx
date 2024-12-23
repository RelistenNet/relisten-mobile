import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { ShowCard } from '@/relisten/components/show_card';
import { SHOW_FILTERS, ShowFilterKey, ShowListContainer } from '@/relisten/components/shows_list';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { useRemainingDownloads } from '@/relisten/realm/models/offline_repo';
import { Show } from '@/relisten/realm/models/show';
import { useQuery } from '@/relisten/realm/schema';
import { aggregateBy } from '@/relisten/util/group_by';
import { useGroupSegment } from '@/relisten/util/routes';
import { tw } from '@/relisten/util/tw';
import { Link } from 'expo-router';
import { PropsWithChildren, default as React, useMemo } from 'react';
import { ScrollView, TouchableOpacity, View, ViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { filterForUser } from '@/relisten/realm/realm_filters';

function MyLibrarySectionHeader({ children, className, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <View className={tw('flex px-4 py-2', className)} {...props}>
      <RelistenText className="text-m font-bold">{children}</RelistenText>
    </View>
  );
}

function RecentlyPlayedShows() {
  const recentlyPlayedShows = useHistoryRecentlyPlayedShows();

  if (recentlyPlayedShows.length === 0) {
    return <></>;
  }

  return (
    <View>
      <Link
        href={{
          pathname: '/relisten/tabs/(myLibrary)/history/tracks',
        }}
        asChild
      >
        <TouchableOpacity>
          <MyLibrarySectionHeader>Recently Played Shows&nbsp;›</MyLibrarySectionHeader>
        </TouchableOpacity>
      </Link>

      <View className="w-full flex-row flex-wrap px-2">
        {recentlyPlayedShows.map((show) => (
          <ShowCard
            show={show.show}
            key={show.show.uuid}
            sourceUuid={show.source.uuid}
            cn="shrink basis-1/2 my-1"
          />
        ))}
      </View>
    </View>
  );
}

function MyLibraryHeader() {
  return (
    <>
      <RelistenText
        className="w-full py-4 pt-8 text-center text-4xl font-bold text-white"
        selectable={false}
      >
        My Library
      </RelistenText>
    </>
  );
}

function FavoriteShows() {
  const favoriteShowsQuery = useQuery(
    {
      type: Show,
      query: (query) =>
        filterForUser(query, { isFavorite: true, isPlayableOffline: true, operator: 'OR' }),
    },
    []
  );

  const favoriteShowsByArtist: RelistenSectionData<Show> = useMemo(() => {
    const showsByArtistUuid = aggregateBy([...favoriteShowsQuery], (s) => s.artistUuid);

    return Object.keys(showsByArtistUuid)
      .sort((a, b) => {
        const artistA = showsByArtistUuid[a][0].artist;
        const artistB = showsByArtistUuid[b][0].artist;

        return artistA.name.localeCompare(artistB.name);
      })
      .map((artistUuid) => {
        const shows = showsByArtistUuid[artistUuid];
        return {
          sectionTitle: shows[0].artist.name,
          data: shows,
        };
      });
  }, [favoriteShowsQuery]);

  // TODO(alecgorge): if the user has a favorited source within that show, take them directly there

  return (
    <View className="pt-4">
      <RefreshContextProvider>
        <MyLibrarySectionHeader>
          <Plur word="Show" count={favoriteShowsQuery.length} /> in My Library
        </MyLibrarySectionHeader>
        <ShowListContainer
          data={favoriteShowsByArtist}
          filterOptions={{ persistence: { key: ['myLibrary', 'shows'].join('/') } }}
          // hide "My Library" filter since it's enabled by default here
          filters={SHOW_FILTERS.filter((sf) => sf.persistenceKey !== ShowFilterKey.Library)}
        />
      </RefreshContextProvider>
    </View>
  );
}

function ActiveDownloads() {
  const groupSegment = useGroupSegment();
  const downloads = useRemainingDownloads();

  return (
    downloads.length > 0 && (
      <Link
        href={{
          pathname: `/relisten/tabs/${groupSegment}/downloading`,
        }}
        asChild
      >
        <TouchableOpacity className="mb-4 bg-relisten-blue-700 px-4 py-4">
          <RelistenText className="text-center font-bold">
            <Plur count={downloads.length} word="track" /> downloading&nbsp;›
          </RelistenText>
        </TouchableOpacity>
      </Link>
    )
  );
}

export default function MyLibraryPage() {
  // TODO: listening history that shows all tracks
  return (
    <ScrollScreen>
      <ScrollView className="flex-1">
        <ActiveDownloads />
        <RecentlyPlayedShows />
        <FavoriteShows />
      </ScrollView>
    </ScrollScreen>
  );
}
