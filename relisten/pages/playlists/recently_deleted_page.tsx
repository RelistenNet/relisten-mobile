import { Stack } from 'expo-router';
import { FlatList, TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { deletedAgo, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import { useDeletedPlaylists } from '@/relisten/playlists/playlist_hooks';
import { RECENTLY_DELETED_DAYS } from '@/relisten/playlists/playlist_repository';
import { usePlaylistLifecycle } from '@/relisten/playlists/ui/playlist_lifecycle';

export default function RecentlyDeletedPage() {
  const { restore } = usePlaylistLifecycle();
  const deleted = useDeletedPlaylists();
  const scrollProps = usePlayerBottomScrollViewProps({});

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: 'Recently Deleted' }} />
      <FlatList
        data={deleted}
        keyExtractor={(p) => p.playlistId}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <RelistenText className="px-4 py-3 text-sm text-gray-400">
            Deleted playlists are kept for {RECENTLY_DELETED_DAYS} days.
          </RelistenText>
        }
        ListEmptyComponent={
          <RelistenText className="px-4 py-8 text-center text-gray-400">
            No deleted playlists.
          </RelistenText>
        }
        renderItem={({ item }) => (
          <View className="min-h-[56px] flex-row items-center px-4 py-3">
            <View className="min-w-0 flex-1">
              <RelistenText className="text-lg font-semibold" numberOfLines={2}>
                {item.name}
              </RelistenText>
              <RelistenText className="text-sm text-gray-400">
                {playlistSizeLine(item.entryCount, 0)} ·{' '}
                {/* Account playlists are archived; their last change is when. */}
                {deletedAgo(item.deletedAt ?? item.updatedAt)}
              </RelistenText>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Restore ${item.name}`}
              className="min-h-[44px] justify-center px-3"
              onPress={() => void restore(item)}
            >
              <RelistenText className="font-semibold text-relisten-blue-400" selectable={false}>
                Restore
              </RelistenText>
            </TouchableOpacity>
          </View>
        )}
        {...scrollProps}
      />
    </View>
  );
}
