import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { usePushShowRespectingUserSettings } from '@/relisten/util/push_show';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useGroupSegment } from '@/relisten/util/routes';
import {
  buildLocalListItems,
  buildRecentListItems,
  buildRemoteListItems,
  type SearchListItem,
} from '../search_list_items';
import type { LocalNarrowing } from '../search_local';
import { presentSearch, visibleChips } from '../search_presentation';
import { localPlaylistHref, localTrackHref, playlistCardHref } from '../search_routes';
import { useLocalSearchResults } from '../use_local_search_results';
import { useOpenSearchResult } from '../use_open_search_result';
import { useSearchSession } from '../use_search_session';
import { SearchInterpretationChips, SearchScopeChips } from './search_chips';
import { SearchField } from './search_field';
import { SearchResultsList, type SearchListHandlers } from './search_results_list';

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

  const items = useMemo((): SearchListItem[] => {
    if (presentation.catalog.kind === 'recent') {
      return buildRecentListItems(recentEntries, 'Search for artists, songs, venues and shows.');
    }

    const remote = buildRemoteListItems(presentation, scope, query);
    if (presentation.catalog.kind !== 'local') {
      return remote;
    }

    // A playlist on this device is listed once, as the local row.
    const localIds = new Set(local.playlists.map((playlist) => playlist.playlistId));
    return [
      ...buildLocalListItems(local, { retryable: presentation.catalog.retryable, query }),
      ...remote.filter((item) => item.type !== 'playlist' || !localIds.has(item.card.id)),
    ];
  }, [local, presentation, query, recentEntries, scope]);

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
        pushShow({ artist: entry.artist, showUuid: entry.show.uuid, sourceUuid: entry.source.uuid })
      ),
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <SearchField
        value={query}
        placeholder="Artists, songs, venues, shows…"
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
          includePlaylists
          onSelect={(next) => session.setScope(next)}
        />
      )}
      <SearchInterpretationChips
        chips={visibleChips(state)}
        onRemove={(key) => session.removeChip(key)}
      />
      {isLocal && narrowing.label && (
        <NarrowingChip label={narrowing.label} onClear={() => setNarrowing({})} />
      )}
      <SearchResultsList
        items={items}
        handlers={handlers}
        contentContainerStyle={scrollProps.contentContainerStyle}
        loadingMore={state.loadingMorePlaylists}
        onEndReached={scope === 'playlists' ? () => void session.loadMorePlaylists() : undefined}
      />
    </View>
  );
}

/** The On this device list is narrowed to one artist's or show's downloads. */
function NarrowingChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <View className="flex-row px-4 py-1">
      <TouchableOpacity
        accessibilityLabel={`Show all downloads, not only ${label}`}
        accessibilityRole="button"
        className="flex-row items-center rounded-full bg-relisten-blue-700 py-1 pl-3 pr-2"
        onPress={onClear}
      >
        <RelistenText className="text-sm">Downloads: {label}</RelistenText>
        <MaterialIcons
          name="close"
          size={14}
          color="rgba(255,255,255,0.7)"
          style={{ marginLeft: 4 }}
        />
      </TouchableOpacity>
    </View>
  );
}
