import { useHeaderHeight } from 'expo-router/react-navigation';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import plur from 'plur';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Switch, TextInput, TouchableOpacity, View } from 'react-native';
import Realm from 'realm';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
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
import { openPlaylist, showPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { usePlayerPresentation } from '@/relisten/player/ui/player_presentation';
import { showPlaylistToast, undoAction } from '@/relisten/playlists/ui/playlist_toast';
import { playlistActionEvent, sharedStatsigClient } from '@/relisten/events';

/** "Add 3 tracks to" sheet. With no tracks it only creates a new playlist. */
export default function AddToPlaylistSheet() {
  const realm = useRealm();
  const router = useRouter();
  const params = useLocalSearchParams<{ tracks?: string; linkable?: string }>();
  const trackIds = useMemo(
    () => (params.tracks ? params.tracks.split(',').filter(Boolean) : []),
    [params.tracks]
  );
  const linkable = params.linkable === '1' && trackIds.length > 1;
  const [linkBackToBack, setLinkBackToBack] = useState(true);
  const groups = useMemo(
    () =>
      linkable && linkBackToBack
        ? backToBackRuns(realm, trackIds)
        : trackIds.map((trackId) => [trackId]),
    [linkBackToBack, linkable, realm, trackIds]
  );
  const playlists = usePlaylists();
  const presentation = usePlayerPresentation();
  const fullPlayer = {
    isOpen: presentation.isPresentationActive,
    close: presentation.closePlayer,
  };
  const [naming, setNaming] = useState(trackIds.length === 0);
  // A form sheet lays its content out under the native header, not below it.
  const headerHeight = useHeaderHeight();

  const addToExisting = (playlist: Playlist) => {
    const { playlistId, name } = playlist;
    try {
      addTracks(realm, playlistId, groups);
    } catch (error) {
      // An alert, since the sheet covers the toast.
      Alert.alert(
        error instanceof PlaylistLimitError ? error.message : 'Couldn’t add to playlist.'
      );
      return;
    }
    router.back();
    sharedStatsigClient().logEvent(playlistActionEvent('add', trackIds.length));

    const segueEntry = trackIds.length === 1 ? segueSuggestion(realm, playlistId) : undefined;
    showPlaylistToast(`Added ${addedLabel(realm, groups)} to ${name}`, [
      undoAction(realm, playlistId),
      segueEntry
        ? {
            label: `Link to ${segueEntry.previousTitle}`,
            onPress: () =>
              keepWithAbove(realm, playlistId, segueEntry.entryId, segueEntry.previousEntryId),
          }
        : { label: 'Open', onPress: () => showPlaylist(router, playlistId, fullPlayer) },
    ]);
  };

  const create = (name: string) => {
    let playlist: Playlist;
    try {
      playlist = createPlaylist(realm, name, groups);
    } catch (error) {
      // The form stays open; an alert, since the sheet covers the toast.
      Alert.alert(
        error instanceof PlaylistLimitError ? error.message : 'Couldn’t create the playlist.'
      );
      return;
    }
    const { playlistId } = playlist;
    router.back();
    sharedStatsigClient().logEvent(playlistActionEvent('create', trackIds.length));

    if (trackIds.length === 0) {
      openPlaylist(router, playlistId);
      return;
    }
    showPlaylistToast(`Added ${addedLabel(realm, groups)} to ${playlist.name}`, [
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
      { label: 'Open', onPress: () => showPlaylist(router, playlistId, fullPlayer) },
    ]);
  };

  if (naming) {
    return (
      <NewPlaylistForm
        topInset={headerHeight}
        defaultName={defaultPlaylistName(realm, trackIds)}
        onCancel={() => (trackIds.length === 0 ? router.back() : setNaming(false))}
        onCreate={create}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Add ${countLabel(trackIds.length)} to…` }} />
      <SheetToolbar onCancel={() => router.back()} />
      <FlatList
        style={{ flex: 1, backgroundColor: RelistenBlue[900] }}
        contentContainerStyle={{ paddingTop: headerHeight }}
        data={playlists}
        keyExtractor={(p) => p.playlistId}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={
          <>
            {linkable && (
              <>
                <View className="min-h-[56px] flex-row items-center px-4 py-2">
                  <View className="flex-1 pr-3">
                    <RelistenText className="text-lg">Link back-to-back tracks</RelistenText>
                    <RelistenText className="text-sm text-gray-400">
                      Segues stay together and in order when shuffled.
                    </RelistenText>
                  </View>
                  <Switch
                    accessibilityLabel="Link back-to-back tracks"
                    onValueChange={setLinkBackToBack}
                    value={linkBackToBack}
                  />
                </View>
                <ItemSeparator />
              </>
            )}
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
    </>
  );
}

/** The sheet's native header buttons: close on the left, and Create when naming. */
function SheetToolbar({ onCancel, onCreate }: { onCancel: () => void; onCreate?: () => void }) {
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button accessibilityLabel="Cancel" icon="xmark" onPress={onCancel} />
      </Stack.Toolbar>
      {onCreate && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            accessibilityLabel="Create"
            icon="checkmark"
            variant="done"
            onPress={onCreate}
          />
        </Stack.Toolbar>
      )}
    </>
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
  const summary = usePlaylistSummary(playlist);
  const alreadyAdded = trackIds.length > 0 && trackIds.every((id) => summary.trackIds.has(id));

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
  topInset,
  defaultName,
  onCancel,
  onCreate,
}: {
  topInset: number;
  defaultName: string;
  onCancel: () => void;
  onCreate: (name: string) => void;
}) {
  // The suggested name is a placeholder rather than a prefilled value, so typing
  // replaces it and leaving the field empty still creates a well-named playlist.
  const [name, setName] = useState('');
  const finalName = name.trim() || defaultName;
  const submit = () => finalName.length > 0 && onCreate(finalName);

  return (
    <View className="flex-1 bg-relisten-blue-900 px-4" style={{ paddingTop: topInset + 16 }}>
      <Stack.Screen options={{ title: 'New Playlist' }} />
      <SheetToolbar onCancel={onCancel} onCreate={submit} />
      <TextInput
        accessibilityLabel="Playlist name"
        autoFocus
        className="rounded-lg bg-relisten-blue-800 px-4 py-3 text-lg text-white"
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

/**
 * Splits tracks into runs that play back to back in one recording, such as
 * Scarlet Begonias into Fire on the Mountain. Each run becomes one link.
 */
function backToBackRuns(realm: Realm, trackIds: string[]): string[][] {
  const runs: string[][] = [];
  let previous: SourceTrack | null = null;

  for (const trackId of trackIds) {
    const track = sourceTrackFor(realm, trackId);
    if (track && previous && playsRightAfter(previous, track)) {
      runs[runs.length - 1].push(trackId);
    } else {
      runs.push([trackId]);
    }
    previous = track;
  }

  return runs;
}

/** Whether `next` is the track that follows `previous` in the same recording. */
function playsRightAfter(previous: SourceTrack, next: SourceTrack): boolean {
  return (
    next.sourceUuid === previous.sourceUuid && next.trackPosition === previous.trackPosition + 1
  );
}

/** Names what was added: a title, a linked pair, or a count with its show. */
function addedLabel(realm: Realm, groups: string[][]): string {
  const trackIds = groups.flat();
  const tracks = trackIds.map((trackId) => sourceTrackFor(realm, trackId));
  const titles = tracks.map((track) => track?.title);

  if (trackIds.length === 1 && titles[0]) {
    return `“${titles[0]}”`;
  }
  if (trackIds.length === 2 && titles[0] && titles[1]) {
    return groups.length === 1
      ? `“${titles[0]} → ${titles[1]}”`
      : `“${titles[0]}” and “${titles[1]}”`;
  }

  // Compared by show, since two shows can share a date.
  const shows = new Set(tracks.map((track) => track?.show.uuid));
  const firstShow = tracks[0]?.show;
  return shows.size === 1 && firstShow
    ? `${countLabel(trackIds.length)} from ${firstShow.displayDate}`
    : countLabel(trackIds.length);
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
  if (!addedTrack || !previousTrack || !playsRightAfter(previousTrack, addedTrack)) {
    return undefined;
  }
  return {
    entryId: added.entries[0].entryId,
    previousEntryId: previous.entries[previous.entries.length - 1].entryId,
    previousTitle: previousTrack.title,
  };
}
