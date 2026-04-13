import Plur from '@/relisten/components/plur';
import { RefreshContextProvider } from '@/relisten/components/refresh_context';
import { RelistenSectionData } from '@/relisten/components/relisten_section_list';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ScrollScreen } from '@/relisten/components/screens/ScrollScreen';
import { ShowCard } from '@/relisten/components/show_card';
import { ShowFilterKey, ShowListContainer, useShowFilters } from '@/relisten/components/shows_list';
import {
  useHistoryRecentlyPlayedShows,
  useTotalListeningTime,
} from '@/relisten/realm/models/history/playback_history_entry_repo';
import { Show } from '@/relisten/realm/models/show';
import { useQuery } from '@/relisten/realm/schema';
import { aggregateBy } from '@/relisten/util/group_by';
import { useGroupSegment } from '@/relisten/util/routes';
import { tw } from '@/relisten/util/tw';
import { Link, useFocusEffect } from 'expo-router';
import { PropsWithChildren, ReactNode, useCallback, useEffect, useMemo } from 'react';
import { TouchableOpacity, View, ViewProps } from 'react-native';
import {
  SourceTrackOfflineInfoStatus,
  SourceTrackOfflineInfoType,
} from '@/relisten/realm/models/source_track_offline_info';
import { useRemainingDownloadsCount } from '@/relisten/realm/root_services';
import { logTabRootDebug } from '@/relisten/util/profile_logging';

function MyLibrarySectionHeader({ children, className, ...props }: PropsWithChildren<ViewProps>) {
  return (
    <View className={tw('flex px-4 py-2', className)} {...props}>
      <RelistenText className="text-m font-bold">{children}</RelistenText>
    </View>
  );
}

function RecentlyPlayedShows() {
  const recentlyPlayedShows = useHistoryRecentlyPlayedShows();

  useEffect(() => {
    logTabRootDebug('myLibrary.recentlyPlayed mount');

    return () => {
      logTabRootDebug('myLibrary.recentlyPlayed unmount');
    };
  }, []);

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
          <MyLibrarySectionHeader>My Listening History&nbsp;›</MyLibrarySectionHeader>
        </TouchableOpacity>
      </Link>

      <View className="w-full flex-row flex-wrap px-2">
        {recentlyPlayedShows.map((show) => (
          <ShowCard
            show={show.show}
            key={show.show.uuid}
            sourceUuid={show.source.uuid}
            className="my-1 shrink basis-1/2"
          />
        ))}
      </View>
    </View>
  );
}

function FavoriteShows({ topContent }: { topContent?: ReactNode }) {
  const showFilters = useShowFilters();
  const favoriteShowsQuery = useQuery(
    {
      type: Show,
      query: (query) =>
        query.filtered(
          'isFavorite == true OR SUBQUERY(sourceTracks, $item, $item.offlineInfo.status == $0 AND $item.offlineInfo.type == $1).@count > 0',
          SourceTrackOfflineInfoStatus.Succeeded,
          SourceTrackOfflineInfoType.UserInitiated
        ),
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

  const nonIdealState = {
    noData: {
      title: 'No Shows in Library',
      description:
        'After you tap the heart icon to add shows to your library, they will show up here.',
    },
  };
  // TODO(alecgorge): if the user has a favorited source within that show, take them directly there

  useEffect(() => {
    logTabRootDebug('myLibrary.favoriteShows mount');

    return () => {
      logTabRootDebug('myLibrary.favoriteShows unmount');
    };
  }, []);

  return (
    <RefreshContextProvider>
      <ShowListContainer
        data={favoriteShowsByArtist}
        ListHeaderComponent={
          <View className="pt-4">
            {topContent}
            <MyLibrarySectionHeader>
              <Plur word="Show" count={favoriteShowsQuery.length} /> in My Library
            </MyLibrarySectionHeader>
          </View>
        }
        filterOptions={{ persistence: { key: ['myLibrary', 'shows'].join('/') } }}
        // hide "My Library" filter since it's enabled by default here
        filters={showFilters.filter((sf) => sf.persistenceKey !== ShowFilterKey.Library)}
        nonIdealState={nonIdealState}
      />
    </RefreshContextProvider>
  );
}

function ActiveDownloads() {
  const groupSegment = useGroupSegment();
  const downloadsCount = useRemainingDownloadsCount();

  useEffect(() => {
    logTabRootDebug('myLibrary.activeDownloads mount');

    return () => {
      logTabRootDebug('myLibrary.activeDownloads unmount');
    };
  }, []);

  return (
    downloadsCount > 0 && (
      <Link
        href={{
          pathname: `/relisten/tabs/${groupSegment}/downloading`,
        }}
        asChild
      >
        <TouchableOpacity className="mb-4 bg-relisten-blue-700 px-4 py-4">
          <RelistenText className="text-center font-bold">
            <Plur count={downloadsCount} word="track" /> downloading&nbsp;›
          </RelistenText>
        </TouchableOpacity>
      </Link>
    )
  );
}

export default function MyLibraryTabRootPage() {
  // TODO: listening history that shows all tracks
  useEffect(() => {
    logTabRootDebug('myLibrary.page mount');

    return () => {
      logTabRootDebug('myLibrary.page unmount');
    };
  }, []);

  const totalListeningTimeSeconds = useTotalListeningTime();

  useFocusEffect(
    useCallback(() => {
      logTabRootDebug('myLibrary.page focus');
      console.log(
        '[Stats] Total listening time:',
        totalListeningTimeSeconds,
        'seconds',
        `(${(totalListeningTimeSeconds / 3600).toFixed(2)} hours)`
      );

      return () => {
        logTabRootDebug('myLibrary.page blur');
      };
    }, [totalListeningTimeSeconds])
  );

  return (
    <ScrollScreen>
      <FavoriteShows
        topContent={
          <>
            <ActiveDownloads />
            <RecentlyPlayedShows />
          </>
        }
      />
    </ScrollScreen>
  );
}
