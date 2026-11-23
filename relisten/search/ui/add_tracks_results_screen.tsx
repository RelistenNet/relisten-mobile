import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Keyboard, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { useObject } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { addableTrack, addTracksTapTarget } from '../add_tracks_routes';
import {
  buildLocalListItems,
  buildRecentListItems,
  buildRemoteListItems,
  type SearchListItem,
} from '../search_list_items';
import type { LocalNarrowing } from '../search_local';
import { presentSearch, visibleChips } from '../search_presentation';
import type { SearchCatalogRow } from '../search_types';
import { useLocalSearchResults } from '../use_local_search_results';
import { useOpenSearchResult } from '../use_open_search_result';
import { useSearchSession } from '../use_search_session';
import { useAddTracks } from './add_tracks_context';
import { AddTrackButton, SheetScrollAnchor, useCloseAddTracks } from './add_tracks_controls';
import { SearchInterpretationChips, SearchScopeChips } from './search_chips';
import { SearchField } from './search_field';
import { SearchResultsList, type SearchListHandlers } from './search_results_list';

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

  const items = useMemo((): SearchListItem[] => {
    if (presentation.catalog.kind === 'recent') {
      return buildRecentListItems(recentEntries, 'Search for a song, show or venue to add.');
    }

    const remote = buildRemoteListItems(presentation, scope, query);
    if (presentation.catalog.kind !== 'local') {
      return remote;
    }

    return [
      ...buildLocalListItems(local, { retryable: presentation.catalog.retryable, query }),
      ...remote,
    ];
  }, [local, presentation, query, recentEntries, scope]);

  const pushInSheet = (href: Parameters<typeof router.push>[0]) => {
    Keyboard.dismiss();
    router.push(href);
  };

  const followRow = (row: SearchCatalogRow) => {
    const target = addTracksTapTarget(row, playlistId);
    switch (target.kind) {
      case 'narrow-artist':
        session.setArtistFilter({ artistId: target.artistId, label: target.label });
        return;
      case 'narrow-tour':
        // A tour narrows to its shows, under its artist when the row names one.
        if (target.artistId) {
          session.setArtistFilter({ artistId: target.artistId, label: target.artistLabel });
        }
        session.setQuery(target.label);
        session.setScope('shows');
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
      pushInSheet({
        pathname: '/relisten/add-tracks/source',
        params: {
          playlistId,
          showUuid: track.showUuid,
          sourceUuid: track.sourceUuid,
          focusTrackUuid: track.uuid,
        },
      }),
    trailingForLocalTrack: (track) => (
      <AddTrackButton
        trackId={trackIdForSourceTrack(track)}
        title={track.title}
        onAdd={() => void addDownloaded(track)}
      />
    ),
    // Recently Played opens the source that was last played.
    onPressRecent: (entry) =>
      pushInSheet({
        pathname: '/relisten/add-tracks/source',
        params: { playlistId, showUuid: entry.show.uuid, sourceUuid: entry.source.uuid },
      }),
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen
        options={{
          title: playlist ? `Add to ${playlist.name}` : 'Add Tracks',
          headerRight: () => <DoneButton onPress={closeSheet} />,
        }}
      />
      <SheetScrollAnchor />
      <SearchResultsList
        inSheet
        header={
          <>
            <SearchField
              value={query}
              placeholder="Songs, shows, venues…"
              autoFocus
              onChangeText={(text) => {
                setNarrowing({});
                session.setQuery(text);
              }}
              onSubmit={() => session.submit()}
            />
            {query.trim() !== '' && (
              <SearchScopeChips
                scope={scope}
                counts={state.response?.catalog?.counts}
                includePlaylists={false}
                onSelect={(next) => session.setScope(next)}
              />
            )}
            <SearchInterpretationChips
              chips={visibleChips(state)}
              onRemove={(key) => session.removeChip(key)}
            />
            {isLocal && narrowing.label && (
              <TouchableOpacity
                accessibilityRole="button"
                className="mx-4 my-1 self-start flex-row items-center rounded-full bg-relisten-blue-700 py-1 pl-3 pr-2"
                onPress={() => setNarrowing({})}
              >
                <RelistenText className="text-sm">Downloads: {narrowing.label}</RelistenText>
                <MaterialIcons
                  name="close"
                  size={14}
                  color="rgba(255,255,255,0.7)"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            )}
          </>
        }
        items={items}
        handlers={handlers}
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
