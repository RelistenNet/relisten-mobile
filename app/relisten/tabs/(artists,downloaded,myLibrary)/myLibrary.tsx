import { useQuery } from '@/relisten/realm/schema';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { PropsWithChildren, useMemo } from 'react';
import { ScrollView, TouchableOpacity, View, ViewProps } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { Link } from 'expo-router';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { ShowListContainer } from '@/relisten/components/shows_list';
import { Show } from '@/relisten/realm/models/show';
import { tw } from '@/relisten/util/tw';
import { aggregateBy } from '@/relisten/util/group_by';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import Plur from '@/relisten/components/plur';

function MyLibrarySectionHeader({ children, className, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <Link
      href={{
        pathname: '/relisten/tabs/(myLibrary)/history/tracks',
      }}
      asChild
    >
      <TouchableOpacity>
        <View className={tw('flex px-4 py-2', className)} {...props}>
          <RelistenText className="text-m font-bold">{children}</RelistenText>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

function RecentlyPlayedShows() {
  const recentlyPlayedShows = useHistoryRecentlyPlayedShows();

  if (recentlyPlayedShows.length === 0) {
    return <></>;
  }

  return (
    <View>
      <MyLibrarySectionHeader>Recently Played Shows&nbsp;›</MyLibrarySectionHeader>
      <View className="w-full flex-row flex-wrap gap-y-2 px-2">
        {recentlyPlayedShows.map((show, idx) => (
          <View
            className={tw('shrink basis-1/2', {
              'pr-1': idx % 2 == 0,
              'pl-1': idx % 2 != 0,
            })}
            key={show.show.uuid}
          >
            <Link
              href={{
                pathname:
                  '/relisten/tabs/(myLibrary)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
                params: {
                  artistUuid: show.show.artistUuid,
                  showUuid: show.show.uuid,
                  sourceUuid: show.source.uuid,
                },
              }}
              asChild
            >
              <TouchableOpacity>
                <View className="rounded-lg bg-gray-600 p-2">
                  <RelistenText selectable={false} className="text-md font-bold">
                    {show.show.displayDate}
                  </RelistenText>
                  <RelistenText selectable={false} className="pt-1">
                    {show.artist.name}
                  </RelistenText>
                  {show.show.venue && (
                    <RelistenText numberOfLines={1} selectable={false} className="pt-1 text-xs">
                      {show.show.venue?.name?.trim()}, {show.show.venue?.location?.trim()}
                    </RelistenText>
                  )}
                </View>
              </TouchableOpacity>
            </Link>
          </View>
        ))}
      </View>
    </View>
  );
}

function MyLibraryHeader() {
  return (
    <>
      <RelistenText
        className="w-full py-2 text-center text-4xl font-bold text-white"
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
      query: (query) => query.filtered('isFavorite == true'),
    },
    []
  );

  const favoriteShows = useMemo(() => {
    return [...favoriteShowsQuery];
  }, [favoriteShowsQuery]);

  const favoriteShowsByArtist: RelistenSectionData<Show> = useMemo(() => {
    const showsByArtistUuid = aggregateBy(favoriteShows, (s) => s.artistUuid);

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
  }, [favoriteShows]);

  // TODO(alecgorge): if the user has a favorited source within that show, take them directly there

  return (
    <View className="pt-4">
      <RefreshContextProvider>
        <MyLibrarySectionHeader>
          <Plur word="Show" count={favoriteShows.length} /> in My Library&nbsp;›
        </MyLibrarySectionHeader>
        <ShowListContainer
          data={favoriteShowsByArtist}
          filterOptions={{ persistence: { key: ['myLibrary', 'shows'].join('/') } }}
        />
      </RefreshContextProvider>
    </View>
  );
}

export default function MyLibraryPage() {
  // TODO: listening history that shows all tracks
  return (
    <SafeAreaView className="w-full flex-1 flex-col">
      <ScrollScreen>
        <ScrollView className="flex-1">
          <MyLibraryHeader />
          <RecentlyPlayedShows />
          <FavoriteShows />
        </ScrollView>
      </ScrollScreen>
    </SafeAreaView>
  );
}
