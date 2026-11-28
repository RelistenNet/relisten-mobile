import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, useRouter } from 'expo-router';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { useDeletedPlaylists, usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { PlaylistListRow } from '@/relisten/playlists/ui/playlist_list_row';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { useGroupSegment } from '@/relisten/util/routes';

export default function PlaylistsPage() {
  const router = useRouter();
  const playlists = usePlaylists();
  const scrollProps = usePlayerBottomScrollViewProps({});

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
      <FlatList
        data={playlists}
        keyExtractor={(p) => p.playlistId}
        renderItem={({ item }) => <PlaylistListRow playlist={item} />}
        ItemSeparatorComponent={ItemSeparator}
        ListEmptyComponent={<EmptyPlaylists onCreate={() => openNewPlaylist(router)} />}
        ListFooterComponent={<PlaylistsFooter />}
        {...scrollProps}
      />
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
              <RelistenText className="ml-2 flex-1 text-gray-400" selectable={false}>
                Recently Deleted
              </RelistenText>
              <RelistenText className="text-gray-400" selectable={false}>
                {deleted.length} ›
              </RelistenText>
            </TouchableOpacity>
          </Link>
        </>
      )}
    </View>
  );
}
