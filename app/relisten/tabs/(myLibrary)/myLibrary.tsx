import { useQuery } from '@/relisten/realm/schema';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import React, { useMemo } from 'react';
import { Results } from 'realm';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { clsx } from 'clsx';
import { Link } from 'expo-router';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { ShowListContainer, ShowListItem } from '@/relisten/components/shows_list';
import { Show } from '@/relisten/realm/models/show';
import { ListRenderItem } from '@shopify/flash-list';
import { RecentShowTabs } from '@/relisten/realm/models/shows/recent_shows_repo';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import dayjs from 'dayjs';
import { useArtists } from '@/relisten/realm/models/artist_repo';
import { Artist } from '@/relisten/realm/models/artist';
import * as R from 'remeda';

function MyLibrarySectionHeader({ children }: { children: string | string[] }) {
  return (
    <View className="flex px-4 py-2">
      <RelistenText className="text-m font-bold">{children}</RelistenText>
    </View>
  );
}

function RecentlyPlayedShows() {
  const recentlyPlayed = useQuery(
    {
      type: PlaybackHistoryEntry,
      query: (query) => query.sorted('playbackStartedAt', /* reverse= */ true),
    },
    []
  );

  const recentlyPlayedShows = useMemo(() => {
    const recentlyPlayedShowUuids: string[] = [];
    const entryByShowUuid: { [uuid: string]: PlaybackHistoryEntry } = {};

    for (const entry of recentlyPlayed) {
      if (recentlyPlayedShowUuids.indexOf(entry.show.uuid) === -1) {
        recentlyPlayedShowUuids.push(entry.show.uuid);
        entryByShowUuid[entry.show.uuid] = entry;
      }

      if (recentlyPlayedShowUuids.length >= 6) {
        break;
      }
    }

    return recentlyPlayedShowUuids.map((uuid) => entryByShowUuid[uuid]);
  }, [recentlyPlayed]);

  return (
    <View>
      <MyLibrarySectionHeader>Recently Played Shows&nbsp;›</MyLibrarySectionHeader>
      <View className="w-full flex-row flex-wrap gap-y-2 px-2">
        {recentlyPlayedShows.map((show, idx) => (
          <View
            className={clsx('shrink basis-1/2', {
              'pr-1': idx % 2 == 0,
              'pl-1': idx % 2 != 0,
            })}
            key={show.show.uuid}
          >
            <Link
              href={{
                pathname:
                  '/relisten/tabs/(artists)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
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

  const showListRenderItem: ListRenderItem<Show> = ({ item: show }) => {
    return (
      <ShowListItem show={show}>
        <SubtitleText>{show.artist.name}</SubtitleText>
      </ShowListItem>
    );
  };

  // TODO(alecgorge): if the user has a favorited source within that show, take them directly there

  return (
    <View className="pt-4">
      <RefreshContextProvider>
        <MyLibrarySectionHeader>
          {`${favoriteShows.length} Shows in My Library`}&nbsp;›
        </MyLibrarySectionHeader>
        <ShowListContainer
          data={[{ data: favoriteShows }]}
          renderItem={showListRenderItem}
          filterOptions={{ persistence: { key: ['myLibrary', 'shows'].join('/') } }}
        />
      </RefreshContextProvider>
    </View>
  );
}

export default function Page() {
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
