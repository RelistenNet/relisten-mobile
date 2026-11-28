import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Keyboard, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useObject } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { addableTrack, addTracksSourceHref, addTracksTapTarget } from '../add_tracks_routes';
import { buildSearchListItems } from '../search_list_items';
import type { LocalNarrowing } from '../search_local';
import { presentSearch } from '../search_presentation';
import type { SearchCatalogRow } from '../search_types';
import { useLocalSearchResults } from '../use_local_search_results';
import { useOpenSearchResult } from '../use_open_search_result';
import { useSearchSession } from '../use_search_session';
import { useAddTracks } from './add_tracks_context';
import { AddTrackButton, SheetScrollAnchor, useCloseAddTracks } from './add_tracks_controls';
import { SearchChipsHeader } from './search_chips';
import { SearchResultsList, type SearchListHandlers } from './search_results_list';
import { useNativeSearchBar } from './use_native_search_bar';

const RECENT_SHOW_COUNT = 10;
const NO_PLAYLISTS = () => false;

/**
 * Add Tracks' first screen: a search for files to add, with playlists left
 * out (`mode=add_tracks`). Artists and tours narrow the search in place;
 * everything else opens the sheet's own shows and setlist screens.
 */
export function AddTracksResultsScreen() {
  const router = useRouter();
  const online = useShouldMakeNetworkRequests();
  const closeSheet = useCloseAddTracks();
  const { playlistId, tab, playlistArtistUuids, addTrack, addDownloaded } = useAddTracks();
  const playlist = useObject(Playlist, playlistId);
  const { session, state } = useSearchSession('add_tracks', playlistArtistUuids);
  const openResultInTab = useOpenSearchResult(tab);
  const recentEntries = useHistoryRecentlyPlayedShows(RECENT_SHOW_COUNT);
  const [narrowing, setNarrowing] = useState<LocalNarrowing & { label?: string }>({});

  const presentation = presentSearch(state, {
    online,
    mode: 'add_tracks',
    hasLocalPlaylist: NO_PLAYLISTS,
  });
  const { query, scope } = state.inputs;
  const isLocal = presentation.catalog.kind === 'local';
  const local = useLocalSearchResults(query, {
    enabled: isLocal,
    narrowing,
    includePlaylists: false,
  });

  const items = useMemo(
    () =>
      buildSearchListItems({
        presentation,
        scope,
        query,
        recentEntries,
        recentEmptyHint: 'Search for a song, show or venue to add.',
        local,
      }),
    [local, presentation, query, recentEntries, scope]
  );

  const pushInSheet = (href: Parameters<typeof router.push>[0]) => {
    Keyboard.dismiss();
    router.push(href);
  };

  const followRow = (row: SearchCatalogRow) => {
    const target = addTracksTapTarget(row, playlistId);
    switch (target.kind) {
      case 'narrow-artist':
        session.setArtistFilter({
          artistId: target.artistId,
          label: target.label,
        });
        return;
      case 'narrow-tour':
        session.narrowToTour(
          { artistId: target.artistId, label: target.artistLabel },
          target.label
        );
        return;
      case 'push':
        pushInSheet(target.href);
    }
  };

  // Long-press offers the full screen in the playlist's tab, which has no **+**.
  const offerFullPage = (row: SearchCatalogRow) => {
    Alert.alert(
      'Open the full page?',
      'Add Tracks closes. Reopen it from the playlist to keep adding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Full Page',
          onPress: () => {
            closeSheet();
            void openResultInTab(row);
          },
        },
      ]
    );
  };

  const handlers: SearchListHandlers = {
    onPressRow: followRow,
    onLongPressRow: offerFullPage,
    trailingForRow: (row) => {
      const file = addableTrack(row);
      return file ? (
        <AddTrackButton
          trackId={file.trackId}
          title={file.title}
          onAdd={() => void addTrack(file.trackId, file.title)}
        />
      ) : undefined;
    },
    onPressScope: (next) => session.setScope(next),
    onRetry: () => session.retry(),
    onPressLocalArtist: (artist) => setNarrowing({ artistUuid: artist.uuid, label: artist.name }),
    onPressLocalShow: (show) => setNarrowing({ showUuid: show.uuid, label: show.displayDate }),
    onPressLocalTrack: (track) =>
      pushInSheet(
        addTracksSourceHref(playlistId, {
          showUuid: track.showUuid,
          sourceUuid: track.sourceUuid,
          focusTrackUuid: track.uuid,
        })
      ),
    trailingForLocalTrack: (track) => (
      <AddTrackButton
        trackId={trackIdForSourceTrack(track)}
        title={track.title}
        onAdd={() => void addDownloaded(track)}
      />
    ),
    // Recently Played opens the source that was last played.
    onPressRecent: (entry) =>
      pushInSheet(
        addTracksSourceHref(playlistId, {
          showUuid: entry.show.uuid,
          sourceUuid: entry.source.uuid,
        })
      ),
  };

  const searchBar = useNativeSearchBar({
    value: query,
    placeholder: 'Songs, shows, venues',
    focusOnMount: true,
    // Under the title, as in other add-to sheets; integrated placements would
    // put it in a toolbar the sheet doesn't have.
    placement: 'stacked',
    onChangeText: (text) => {
      setNarrowing({});
      session.setQuery(text);
    },
    onSubmit: () => session.submit(),
  });

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen
        options={{
          title: playlist ? `Add to ${playlist.name}` : 'Add Tracks',
          headerRight: () => <DoneButton onPress={closeSheet} />,
          headerSearchBarOptions: searchBar,
        }}
      />
      <SheetScrollAnchor />
      <SearchResultsList
        header={
          <SearchChipsHeader
            session={session}
            state={state}
            includePlaylists={false}
            narrowingLabel={isLocal ? narrowing.label : undefined}
            onClearNarrowing={() => setNarrowing({})}
          />
        }
        items={items}
        handlers={handlers}
        loadingMore={state.loadingMore}
        onEndReached={scope !== 'all' ? () => void session.loadMore() : undefined}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
    </View>
  );
}

export function DoneButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" className="px-2 py-1" onPress={onPress}>
      <RelistenText className="text-lg font-semibold">Done</RelistenText>
    </TouchableOpacity>
  );
}
