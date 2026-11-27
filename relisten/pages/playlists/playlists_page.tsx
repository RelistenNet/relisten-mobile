import { hasPublicPlaylistAudience } from '@/relisten/playlists/playlist_audience';
import { useLibraryPlaylistAudience } from '@/relisten/playlists/ui/playlist_audience';
import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { FilterableList } from '@/relisten/components/filtering/filterable_list';
import {
  type Filter,
  FilteringProvider,
  searchForSubstring,
  SortDirection,
} from '@/relisten/components/filtering/filters';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import { playlistDisplayName } from '@/relisten/playlists/playlist_format';
import {
  type PlaylistSummary,
  useDeletedPlaylists,
  useIsFavoritePlaylist,
  usePlaylistSummaries,
  usePlaylists,
} from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { useGroupSegment } from '@/relisten/util/routes';

/** A row on the page, with what its sorts and filters read. */
interface PlaylistListItem {
  /** The playlist ID, which the shared filtering list keys rows by. */
  uuid: string;
  playlist: Playlist;
  summary: PlaylistSummary;
  favorite: boolean;
}

enum PlaylistFilterKey {
  Modified = 'modified',
  Name = 'name',
  Tracks = 'tracks',
  Duration = 'duration',
  Favorites = 'favorites',
  Search = 'search',
}

const byName = (a: PlaylistListItem, b: PlaylistListItem) =>
  playlistDisplayName(a.playlist).localeCompare(playlistDisplayName(b.playlist));

// Sorts run ascending and the filtering list reverses them for Descending.
// The numeric sorts default to Descending, so they break ties with names
// reversed (`byName(b, a)`): after the reversal, tied playlists read A to Z.
const filters: Filter<PlaylistFilterKey, PlaylistListItem>[] = [
  {
    persistenceKey: PlaylistFilterKey.Favorites,
    title: 'Favorites',
    active: false,
    filter: (item) => item.favorite,
  },
  {
    persistenceKey: PlaylistFilterKey.Modified,
    title: 'Modified',
    sortDirection: SortDirection.Descending,
    active: true,
    sort: (items) =>
      items.sort((a, b) => a.playlist.updatedAt.getTime() - b.playlist.updatedAt.getTime()),
  },
  {
    persistenceKey: PlaylistFilterKey.Name,
    title: 'Name',
    sortDirection: SortDirection.Ascending,
    active: false,
    sort: (items) => items.sort(byName),
  },
  {
    persistenceKey: PlaylistFilterKey.Tracks,
    title: 'Tracks',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (items) =>
      items.sort((a, b) => a.playlist.entryCount - b.playlist.entryCount || byName(b, a)),
  },
  {
    persistenceKey: PlaylistFilterKey.Duration,
    title: 'Duration',
    sortDirection: SortDirection.Descending,
    active: false,
    isNumeric: true,
    sort: (items) =>
      items.sort((a, b) => a.summary.durationSeconds - b.summary.durationSeconds || byName(b, a)),
  },
  {
    persistenceKey: PlaylistFilterKey.Search,
    title: 'Search',
    active: false,
    searchFilter: (item, searchText) => {
      const search = searchText.toLowerCase();
      return (
        searchForSubstring(playlistDisplayName(item.playlist), search) ||
        searchForSubstring(item.playlist.description, search) ||
        searchForSubstring(item.playlist.ownerUsername, search) ||
        searchForSubstring(item.summary.artistNames.join(' '), search)
      );
    },
  },
];

/**
 * Every playlist in the library, the ones the listener made and the ones
 * they follow, with the filter bar's Favorites filter, sorts and search.
 */
export default function PlaylistsPage() {
  const router = useRouter();
  const playlists = usePlaylists();
  const isFavorite = useIsFavoritePlaylist();
  const audience = useLibraryPlaylistAudience(
    playlists.filter(hasPublicPlaylistAudience).map((playlist) => playlist.playlistId)
  );
  const summaryOf = usePlaylistSummaries(playlists);
  const items = useMemo(
    () =>
      playlists.map((playlist) => ({
        uuid: playlist.playlistId,
        playlist,
        summary: summaryOf(playlist.playlistId),
        favorite: isFavorite(playlist),
      })),
    [playlists, summaryOf, isFavorite]
  );

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: 'Playlists' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="New Playlist"
          icon={nativeMenuIcons.add}
          onPress={() => openNewPlaylist(router)}
        />
      </Stack.Toolbar>
      {items.length === 0 ? (
        <View>
          <EmptyPlaylists onCreate={() => openNewPlaylist(router)} />
          <PlaylistsFooter />
        </View>
      ) : (
        <FilteringProvider
          filters={filters}
          options={{ persistence: { key: 'myLibrary/playlists' } }}
        >
          <FilterableList
            data={[{ data: items }]}
            pullToRefresh={false}
            renderItem={({ item }) => (
              <PlaylistListRow
                playlist={item.playlist}
                summary={item.summary}
                favorite={item.favorite}
                audience={
                  hasPublicPlaylistAudience(item.playlist) ? audience?.get(item.uuid) : undefined
                }
              />
            )}
            ListFooterComponent={<PlaylistsFooter />}
          />
        </FilteringProvider>
      )}
    </View>
  );
}

function EmptyPlaylists({ onCreate }: { onCreate: () => void }) {
  return (
    <View className="items-center px-8 pt-16">
      <RelistenText className="text-center text-xl font-bold">
        Make your first playlist
      </RelistenText>
      <RelistenText className="mt-2 text-center text-gray-400">
        Playlists keep songs in the order you choose. Tap ••• on any song or show and choose Add to
        Playlist.
      </RelistenText>
      <RelistenButton className="mt-6" intent="primary" onPress={onCreate}>
        New Playlist
      </RelistenButton>
    </View>
  );
}

function PlaylistsFooter() {
  const groupSegment = useGroupSegment();
  const deleted = useDeletedPlaylists();

  return (
    <View>
      <Link href={`/relisten/tabs/${groupSegment}/playlists/discover` as const} asChild>
        <TouchableOpacity accessibilityRole="button" className="min-h-[52px] justify-center px-4">
          <RelistenText>Discover Playlists ›</RelistenText>
        </TouchableOpacity>
      </Link>
      {deleted.length > 0 && (
        <>
          <ItemSeparator />
          <Link
            href={{
              pathname: `/relisten/tabs/${groupSegment}/playlists/recently-deleted` as const,
            }}
            asChild
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Recently Deleted, ${deleted.length}`}
              className="min-h-[52px] flex-row items-center px-4"
            >
              <Ionicons name="trash-outline" size={16} color="#9ca3af" />
              <RelistenText className="ml-2 flex-1 text-gray-400">Recently Deleted</RelistenText>
              <RelistenText className="text-gray-400">{deleted.length} ›</RelistenText>
            </TouchableOpacity>
          </Link>
        </>
      )}
    </View>
  );
}
