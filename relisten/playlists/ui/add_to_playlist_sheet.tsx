import { useLocalSearchParams, useRouter } from 'expo-router';
import plur from 'plur';
import { useMemo, useState } from 'react';
import { FlatList, TextInput, TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Playlist, PlaylistEntry } from '@/relisten/realm/models/playlists/playlist';
import { useRealm } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { addTracks, keepWithAbove } from '@/relisten/playlists/playlist_actions';
import { orderedGroups } from '@/relisten/playlists/playlist_operations';
import { artistLine, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import {
  sourceTrackFor,
  usePlaylists,
  usePlaylistSummary,
} from '@/relisten/playlists/playlist_hooks';
import {
  createPlaylist,
  PLAYLIST_LIMITS,
  PlaylistLimitError,
  deletePlaylistPermanently,
  readPlaylistSnapshot,
} from '@/relisten/playlists/playlist_repository';
import { openPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { undoAction } from '@/relisten/playlists/ui/playlist_lifecycle';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { playlistActionEvent, sharedStatsigClient } from '@/relisten/events';

/** "Add 3 tracks to" sheet. With no tracks it only creates a new playlist. */
export default function AddToPlaylistSheet() {
  const realm = useRealm();
  const router = useRouter();
  const params = useLocalSearchParams<{ tracks?: string; together?: string }>();
  const trackIds = useMemo(
    () => (params.tracks ? params.tracks.split(',').filter(Boolean) : []),
    [params.tracks]
  );
  const together = params.together === '1' && trackIds.length > 1;
  const playlists = usePlaylists();
  const [naming, setNaming] = useState(trackIds.length === 0);

  const addToExisting = (playlist: Playlist) => {
    const { playlistId, name } = playlist;
    try {
      addTracks(realm, playlistId, trackIds, together);
    } catch (error) {
      showPlaylistToast(
        error instanceof PlaylistLimitError ? error.message : "Couldn't add to playlist."
      );
      return;
    }
    router.back();
    sharedStatsigClient().logEvent(playlistActionEvent('add', trackIds.length));

    const segueEntry = trackIds.length === 1 ? segueSuggestion(realm, playlistId) : undefined;
    showPlaylistToast(`Added ${countLabel(trackIds.length)} to ${name}`, [
      undoAction(realm, playlistId),
      segueEntry
        ? {
            label: `Link to ${segueEntry.previousTitle}`,
            onPress: () => keepWithAbove(realm, playlistId, segueEntry.entryId),
          }
        : { label: 'Open', onPress: () => openPlaylist(router, playlistId) },
    ]);
  };

  const create = (name: string) => {
    const groups = trackIds.length === 0 ? [] : together ? [trackIds] : trackIds.map((id) => [id]);
    const playlist = createPlaylist(realm, name, groups);
    const { playlistId } = playlist;
    router.back();
    sharedStatsigClient().logEvent(playlistActionEvent('create', trackIds.length));

    if (trackIds.length === 0) {
      openPlaylist(router, playlistId);
      return;
    }
    showPlaylistToast(`Added ${countLabel(trackIds.length)} to ${playlist.name}`, [
      {
        label: 'Undo',
        onPress: () => {
          if (!deletePlaylistPermanently(realm, playlistId)) {
            showPlaylistToast(
              'It’s already saved to your account. Delete it from the playlist’s menu.'
            );
          }
        },
      },
      { label: 'Open', onPress: () => openPlaylist(router, playlistId) },
    ]);
  };

  if (naming) {
    return (
      <NewPlaylistForm
        defaultName={defaultPlaylistName(realm, trackIds)}
        onCancel={() => (trackIds.length === 0 ? router.back() : setNaming(false))}
        onCreate={create}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: RelistenBlue[900] }}
      data={[...playlists]}
      keyExtractor={(p) => p.playlistId}
      ItemSeparatorComponent={ItemSeparator}
      ListHeaderComponent={
        <>
          <View className="px-4 pb-2 pt-5">
            <RelistenText className="text-xl font-bold">
              Add {countLabel(trackIds.length)} to
            </RelistenText>
            {together && (
              <RelistenText className="mt-1 text-gray-400">
                {"They'll stay linked, so shuffle keeps them in order."}
              </RelistenText>
            )}
          </View>
          <ItemSeparator />
          <TouchableOpacity
            accessibilityRole="button"
            className="min-h-[52px] flex-row items-center px-4"
            onPress={() => setNaming(true)}
          >
            <RelistenText
              className="text-lg font-semibold text-relisten-blue-400"
              selectable={false}
            >
              + New Playlist
            </RelistenText>
          </TouchableOpacity>
          <ItemSeparator />
        </>
      }
      renderItem={({ item }) => (
        <PickerRow playlist={item} trackIds={trackIds} onPress={() => addToExisting(item)} />
      )}
    />
  );
}

function PickerRow({
  playlist,
  trackIds,
  onPress,
}: {
  playlist: Playlist;
  trackIds: string[];
  onPress: () => void;
}) {
  const realm = useRealm();
  const summary = usePlaylistSummary(playlist);
  const alreadyAdded = useMemo(() => {
    const present = new Set(
      realm
        .objects(PlaylistEntry)
        .filtered('playlistId == $0 AND live == true', playlist.playlistId)
        .map((e) => e.trackId)
    );
    return trackIds.length > 0 && trackIds.every((id) => present.has(id));
  }, [realm, playlist.playlistId, trackIds]);

  const detail = [
    playlistSizeLine(playlist.entryCount, summary.durationSeconds),
    alreadyAdded ? 'Already added' : artistLine(summary.artistNames),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, ${detail}`}
      className="min-h-[56px] justify-center px-4 py-3"
      onPress={onPress}
    >
      <RelistenText className="text-lg font-semibold" numberOfLines={2} selectable={false}>
        {playlist.name}
      </RelistenText>
      <RelistenText className="text-sm text-gray-400" numberOfLines={2} selectable={false}>
        {detail}
      </RelistenText>
    </TouchableOpacity>
  );
}

function NewPlaylistForm({
  defaultName,
  onCancel,
  onCreate,
}: {
  defaultName: string;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  // The suggested name is a placeholder rather than a prefilled value, so typing
  // replaces it and leaving the field empty still creates a well-named playlist.
  const [name, setName] = useState('');
  const finalName = name.trim() || defaultName;
  const canCreate = finalName.length > 0;
  const submit = () => canCreate && onCreate(finalName);

  return (
    <View className="flex-1 bg-relisten-blue-900 px-4 pt-4">
      <View className="flex-row items-center justify-between">
        <TouchableOpacity
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
          onPress={onCancel}
        >
          <RelistenText className="text-relisten-blue-400" selectable={false}>
            Cancel
          </RelistenText>
        </TouchableOpacity>
        <RelistenText className="text-lg font-bold">New Playlist</RelistenText>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate }}
          className="min-h-[44px] justify-center"
          onPress={submit}
        >
          <RelistenText
            className={canCreate ? 'font-bold text-relisten-blue-400' : 'font-bold text-gray-500'}
            selectable={false}
          >
            Create
          </RelistenText>
        </TouchableOpacity>
      </View>
      <TextInput
        accessibilityLabel="Playlist name"
        autoFocus
        className="mt-6 rounded-lg bg-relisten-blue-800 px-4 py-3 text-lg text-white"
        maxLength={PLAYLIST_LIMITS.nameLength}
        onChangeText={setName}
        onSubmitEditing={submit}
        placeholder={defaultName || 'Road trip jams'}
        placeholderTextColor="#9ca3af"
        returnKeyType="done"
        value={name}
      />
    </View>
  );
}

function countLabel(count: number) {
  return `${count} ${plur('track', count)}`;
}

/** Names a new playlist after the show its first track came from, e.g. "Grateful Dead 1977-05-08". */
function defaultPlaylistName(realm: Realm, trackIds: string[]): string {
  const track = trackIds[0] ? sourceTrackFor(realm, trackIds[0]) : null;
  return track ? `${track.artist.name} ${track.show.displayDate}` : '';
}

/**
 * When a single added track directly follows the playlist's previous last track
 * in the same recording (Fire on the Mountain after Scarlet Begonias), offer to
 * link them. That saves a segue without needing Select Tracks.
 */
function segueSuggestion(realm: Realm, playlistId: string) {
  const groups = orderedGroups(readPlaylistSnapshot(realm, playlistId));
  const added = groups[groups.length - 1];
  const previous = groups[groups.length - 2];
  if (!added || !previous || added.entries.length !== 1) {
    return undefined;
  }

  const addedTrack = sourceTrackFor(realm, added.entries[0].trackId);
  const previousTrack = sourceTrackFor(
    realm,
    previous.entries[previous.entries.length - 1].trackId
  );
  if (
    !addedTrack ||
    !previousTrack ||
    addedTrack.sourceUuid !== previousTrack.sourceUuid ||
    addedTrack.trackPosition !== previousTrack.trackPosition + 1
  ) {
    return undefined;
  }
  return {
    entryId: added.entries[0].entryId,
    previousTitle: previousTrack.title,
  };
}
