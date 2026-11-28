import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { ListRow } from '@/relisten/components/list_row';
import { useFullShowWithSelectedSource } from '@/relisten/realm/models/show_repo';
import type { Source } from '@/relisten/realm/models/source';
import { addTracksSourceHref } from '../add_tracks_routes';
import { useAddTracks } from './add_tracks_context';
import { OpenFullPageButton, SheetScrollAnchor } from './add_tracks_controls';

/**
 * Other recordings of a show, with the credits and upstream IDs that tell
 * transfers apart. Choosing one opens its setlist focused on the same song.
 */
export function AddTracksRecordingsScreen() {
  const { showUuid, focusSongId } = useLocalSearchParams<{
    showUuid: string;
    focusSongId?: string;
  }>();
  const router = useRouter();
  const { playlistId, tab } = useAddTracks();
  const { show, sources } = useFullShowWithSelectedSource(showUuid, 'initial');

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen
        options={{
          title: show ? `${show.displayDate} Recordings` : 'Recordings',
          headerRight: () =>
            show ? (
              <OpenFullPageButton
                href={{
                  pathname: `/relisten/tabs/${tab}/[artistUuid]/show/[showUuid]/sources/` as const,
                  params: { artistUuid: show.artistUuid, showUuid: show.uuid },
                }}
              />
            ) : null,
        }}
      />
      <SheetScrollAnchor />
      {sources.length === 0 ? (
        <ActivityIndicator className="flex-1" color="white" />
      ) : (
        <FlatList
          data={sources}
          keyExtractor={(source) => source.uuid}
          ItemSeparatorComponent={ItemSeparator}
          contentContainerStyle={{ paddingBottom: 96 }}
          // Content starts under the sheet's header; the inset clears it.
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item: source, index }) => (
            <ListRow
              title={`Source #${index + 1}${source.isSoundboard ? ' · SBD' : ''}`}
              subtitle={recordingCredits(source)}
              onPress={() =>
                router.push(
                  addTracksSourceHref(playlistId, {
                    showUuid,
                    sourceUuid: source.uuid,
                    focusSongId,
                  })
                )
              }
            />
          )}
        />
      )}
    </View>
  );
}

/** Taper, transferrer and the upstream ID, which is what tells transfers apart. */
function recordingCredits(source: Source): string {
  return [
    source.taper && `Taper: ${source.taper}`,
    source.transferrer && `Transfer: ${source.transferrer}`,
    source.upstreamIdentifier,
  ]
    .filter(Boolean)
    .join(' · ');
}
