import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';
import { buildSearchListItems } from '../search_list_items';
import type { LocalNarrowing } from '../search_local';
import { presentSearch } from '../search_presentation';
import { localPlaylistHref, localTrackHref, playlistCardHref } from '../search_routes';
import { useLocalSearchResults } from '../use_local_search_results';
import { useOpenSearchResult } from '../use_open_search_result';
import { useSearchSession } from '../use_search_session';
import { SearchChipsHeader } from './search_chips';
import { SearchResultsList, type SearchListHandlers } from './search_results_list';
import { useNativeSearchBar } from './use_native_search_bar';

const RECENT_SHOW_COUNT = 10;

/**
 * The Search tab. Each result opens its screen inside the Search stack, so
 * Back returns to the same query, scope and scroll position.
 */
export function SearchTabScreen() {
  const router = useRouter();
  const tab = useGroupSegment();
  const online = useShouldMakeNetworkRequests();
  const { session, state } = useSearchSession('explore');
  const openResult = useOpenSearchResult();
  const { pushShow } = usePushShowRespectingUserSettings();
  const recentEntries = useHistoryRecentlyPlayedShows(RECENT_SHOW_COUNT);
  const localPlaylists = usePlaylists();
  const scrollProps = usePlayerBottomScrollViewProps();
  const [narrowing, setNarrowing] = useState<LocalNarrowing & { label?: string }>({});

  const localPlaylistIds = useMemo(
    () => new Set(localPlaylists.map((playlist) => playlist.playlistId)),
    [localPlaylists]
  );
  const presentation = presentSearch(state, {
    online,
    mode: 'explore',
    hasLocalPlaylist: (id) => localPlaylistIds.has(id),
  });
  const { query, scope } = state.inputs;

  const isLocal = presentation.catalog.kind === 'local';
  const local = useLocalSearchResults(query, {
    enabled: isLocal,
    narrowing,
    includePlaylists: true,
  });

  const items = useMemo(
    () =>
      buildSearchListItems({
        presentation,
        scope,
        query,
        recentEntries,
        recentEmptyHint: 'Search for artists, songs, venues and shows.',
        local,
      }),
    [local, presentation, query, recentEntries, scope]
  );

  // Every way out of the list dismisses the keyboard, so Back returns to the
  // results rather than to a keyboard covering them.
  const leave = (navigate: () => void) => {
    Keyboard.dismiss();
    navigate();
  };

  const handlers: SearchListHandlers = {
    onPressRow: (row) => leave(() => void openResult(row)),
    onPressPlaylist: (card) => {
      const href = playlistCardHref(card, localPlaylistIds.has(card.id), tab);
      if (href) {
        leave(() => router.push(href));
      }
    },
    onPressScope: (next) => session.setScope(next),
    onRetry: () => session.retry(),
    // On this device, an artist or show narrows the list to its downloads.
    onPressLocalArtist: (artist) => setNarrowing({ artistUuid: artist.uuid, label: artist.name }),
    onPressLocalShow: (show) => setNarrowing({ showUuid: show.uuid, label: show.displayDate }),
    onPressLocalTrack: (track) => leave(() => router.push(localTrackHref(track, tab))),
    onPressLocalPlaylist: (playlist) =>
      leave(() => router.push(localPlaylistHref(playlist.playlistId, tab))),
    // Recently Played reopens the source that was last played.
    onPressRecent: (entry) =>
      leave(() =>
        pushShow({
          artist: entry.artist,
          showUuid: entry.show.uuid,
          sourceUuid: entry.source.uuid,
        })
      ),
  };

  const searchBar = useNativeSearchBar({
    value: query,
    placeholder: 'Artists, songs, venues, shows',
    onChangeText: (text) => {
      setNarrowing({});
      session.setQuery(text);
    },
    onSubmit: () => session.submit(),
  });

  return (
    <View className="flex-1 bg-relisten-blue-900">
      {/* The stack draws the logo header; this screen adds its search bar. */}
      <Stack.Screen options={{ headerSearchBarOptions: searchBar }} />
      <SearchResultsList
        header={
          <SearchChipsHeader
            session={session}
            state={state}
            includePlaylists
            narrowingLabel={isLocal ? narrowing.label : undefined}
            onClearNarrowing={() => setNarrowing({})}
          />
        }
        items={items}
        handlers={handlers}
        contentContainerStyle={scrollProps.contentContainerStyle}
        loadingMore={state.loadingMore}
        onEndReached={scope !== 'all' ? () => void session.loadMore() : undefined}
      />
    </View>
  );
}
