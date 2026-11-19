import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Realm from 'realm';
import {
  FlatList,
  type FlatListProps,
  TextInput,
  type TextInputInstance,
  useWindowDimensions,
  View,
} from 'react-native';
import { AndroidBackHandler, textToolbarButtonProps } from '@/relisten/components/header_buttons';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { useRealm } from '@/relisten/realm/schema';
import { humanDuration, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import {
  usePlaylist,
  usePlaylistGroups,
  summarizePlaylist,
  usePlaylistLayout,
  type PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import { usePlaylistHydration } from '@/relisten/playlists/playlist_hydration';
import {
  isQueueable,
  playEntryAt,
  playPlaylist,
  shufflePlaylist,
} from '@/relisten/playlists/playlist_playback';
import { PLAYLIST_LIMITS, updatePlaylistDetails } from '@/relisten/playlists/playlist_repository';
import { PlaylistEditList } from '@/relisten/playlists/ui/playlist_edit_list';
import {
  PlaylistIntroRow,
  PlaylistTextRow,
  PlaylistTrackRow,
  type PlaylistViewRow,
  playlistViewRows,
  usePlayingEntryId,
} from '@/relisten/playlists/ui/playlist_rows';
import { openGuideTextEditor } from '@/relisten/playlists/guide/guide_text_navigation';
import { usePlaylistLifecycle } from '@/relisten/playlists/ui/playlist_lifecycle';
import { PlaylistSyncNotice } from '@/relisten/playlists/ui/playlist_sync_notice';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export default function PlaylistDetailPage() {
  const { playlistId } = useLocalSearchParams<{ playlistId: string }>();
  const realm = useRealm();
  const router = useRouter();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const playlist = usePlaylist(playlistId);
  const allGroups = usePlaylistGroups(playlistId);
  const layout = usePlaylistLayout(allGroups);
  const playingEntryId = usePlayingEntryId(playlistId);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const [editing, setEditing] = useState(false);
  // Name and description edits are drafts until Done (or leaving the screen) commits them.
  const [draft, setDraft] = useState({ name: '', description: '' });
  const draftRef = useRef<typeof draft | null>(null);
  // What the fields held when editing began. Only fields the listener changed
  // are saved, so an untouched field never undoes another device's edit.
  const initialDraftRef = useRef<typeof draft>({ name: '', description: '' });
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const nameInput = useRef<TextInputInstance>(null);
  const [focusName, setFocusName] = useState(false);
  const lifecycle = usePlaylistLifecycle();
  const syncService = usePlaylistSyncService();

  usePlaylistHydration(playlistId, allGroups, online);
  // Opening the playlist (or coming back to it) checks for other devices' changes.
  useFocusEffect(
    useCallback(() => {
      syncService.checkForChanges(playlistId);
    }, [playlistId, syncService])
  );
  // Leaving the screen mid-edit keeps the name and description changes. Undo
  // history is kept so a toast's Undo still works after navigating away.
  // Leaving also sends this playlist's pending edits rather than waiting.
  useEffect(
    () => () => {
      if (draftRef.current) {
        commitDetails(realm, playlistId, draftRef.current, initialDraftRef.current);
      }
      syncService.flush();
    },
    [playlistId, realm, syncService]
  );
  // The groups update as downloads finish, which keeps Show Downloaded Only current.
  const viewRows = useMemo(
    () => playlistViewRows(downloadedOnly ? filterDownloaded(allGroups) : allGroups),
    [allGroups, downloadedOnly]
  );
  const playingSegmentId = playingEntryId
    ? layout.groups[layout.entryPositions.get(playingEntryId)?.groupIndex ?? -1]?.segment.segmentId
    : undefined;

  if (!playlist || playlist.deletedAt) {
    return (
      <View className="flex-1 items-center bg-relisten-blue-900 px-8 pt-16">
        <Stack.Screen options={{ title: '' }} />
        <RelistenText className="text-center text-gray-400">
          This playlist was deleted.
        </RelistenText>
      </View>
    );
  }

  const name = playlist.name;
  const play = (entryId?: string) => {
    if (!playPlaylist(player, playlistId, allGroups, online, entryId)) {
      showPlaylistToast(entryId ? 'This track isn’t downloaded.' : nothingPlayableMessage(online));
    }
  };
  const playTimestamp = (entryId: string, seconds: number) => {
    if (!playEntryAt(player, playlistId, allGroups, online, entryId, seconds)) {
      showPlaylistToast(
        online ? 'That part isn’t available right now.' : 'That track isn’t downloaded.'
      );
    }
  };
  const addTextSection = () =>
    openGuideTextEditor(router, {
      kind: 'section',
      playlistId,
      afterSegmentId: allGroups[allGroups.length - 1]?.segment.segmentId,
    });
  const shuffle = () => {
    if (!shufflePlaylist(player, playlistId, allGroups, online)) {
      showPlaylistToast(nothingPlayableMessage(online));
    }
  };
  const download = () => {
    for (const group of allGroups) {
      for (const row of group.entries) {
        if (row.sourceTrack?.supportsOfflineDownload()) {
          void DownloadManager.SHARED_INSTANCE.downloadTrack(row.sourceTrack);
        }
      }
    }
  };
  const deletePlaylist = () => lifecycle.remove(playlist);
  const startEditing = () => {
    const initial = { name, description: playlist.description ?? '' };
    draftRef.current = initial;
    initialDraftRef.current = initial;
    setDraft(initial);
    setEditing(true);
  };
  const finishEditing = () => {
    if (draftRef.current) {
      commitDetails(realm, playlistId, draftRef.current, initialDraftRef.current);
    }
    draftRef.current = null;
    setEditing(false);
    setFocusName(false);
    syncService.flush();
  };
  const updateDraft = (next: typeof draft) => {
    draftRef.current = next;
    setDraft(next);
  };
  // Rename opens edit mode with the name field focused as it appears.
  const startRename = () => {
    if (editing) {
      nameInput.current?.focus();
      return;
    }
    setFocusName(true);
    startEditing();
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      {/* Viewing, the name fades into the header as you scroll (DisappearingHeaderScreen
          sets that title view). Editing shows a plain "Editing" instead. */}
      <Stack.Screen
        options={
          editing
            ? {
                title: 'Editing',
                headerTitle: ({ children }) => (
                  <RelistenText className="text-xl font-semibold">{children}</RelistenText>
                ),
              }
            : { title: name }
        }
      />
      {/* Back while editing finishes editing, like Done; edits apply as they're made. */}
      {editing && <AndroidBackHandler onBack={finishEditing} />}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          {...(editing
            ? textToolbarButtonProps('Done', nativeMenuIcons.done)
            : textToolbarButtonProps('Edit', nativeMenuIcons.edit))}
          onPress={editing ? finishEditing : startEditing}
        />
        <Stack.Toolbar.Menu accessibilityLabel="Playlist actions" icon={nativeMenuIcons.more}>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction icon={nativeMenuIcons.edit} onPress={startRename}>
              Rename…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon={nativeMenuIcons.add} onPress={addTextSection}>
              Add Text at End…
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon={nativeMenuIcons.download}
              isOn={downloadedOnly}
              onPress={() => setDownloadedOnly(!downloadedOnly)}
            >
              Show Downloaded Only
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu inline>
            <Stack.Toolbar.MenuAction
              destructive
              icon={nativeMenuIcons.delete}
              onPress={deletePlaylist}
            >
              Delete Playlist…
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      {editing ? (
        <PlaylistEditList
          playlistId={playlistId}
          layout={layout}
          header={
            <EditHeader
              draft={draft}
              onChange={updateDraft}
              nameInput={nameInput}
              focusName={focusName}
              onAddText={addTextSection}
            />
          }
        />
      ) : (
        <DisappearingHeaderScreen
          ScrollableComponent={PlaylistTrackList}
          data={viewRows}
          keyExtractor={(r) => r.key}
          ListHeaderComponent={
            <ViewHeader
              name={name}
              description={playlist.description}
              entryCount={playlist.entryCount}
              groups={allGroups}
              online={online}
              onPlay={() => play()}
              onShuffle={shuffle}
              onDownload={download}
              notice={<PlaylistSyncNotice playlist={playlist} />}
            />
          }
          ListEmptyComponent={
            <RelistenText className="px-6 py-8 text-center text-gray-400">
              {downloadedOnly
                ? 'No downloaded tracks yet.'
                : "This playlist is empty. Add songs from any show's ••• menu."}
            </RelistenText>
          }
          renderItem={({ item }) => {
            const linkPlaying =
              item.link !== undefined && item.group.segment.segmentId === playingSegmentId;
            if (item.kind === 'intro') {
              return (
                <PlaylistIntroRow
                  viewRow={item}
                  linkPlaying={linkPlaying}
                  onTimestamp={playTimestamp}
                />
              );
            }
            return item.row.status === 'text' ? (
              <PlaylistTextRow
                playlistId={playlistId}
                layout={layout}
                viewRow={item}
                linkPlaying={linkPlaying}
                onTimestamp={playTimestamp}
              />
            ) : (
              <PlaylistTrackRow
                playlistId={playlistId}
                layout={layout}
                viewRow={item}
                online={online}
                playingEntryId={playingEntryId}
                linkPlaying={linkPlaying}
                onPlay={play}
                onTimestamp={playTimestamp}
              />
            );
          }}
          {...scrollProps}
        />
      )}
    </View>
  );
}

/** The playlist's rows; a FlatList typed for DisappearingHeaderScreen. */
const PlaylistTrackList = FlatList as React.ComponentType<FlatListProps<PlaylistViewRow>>;

function ViewHeader({
  name,
  description,
  entryCount,
  groups,
  online,
  onPlay,
  onShuffle,
  onDownload,
  notice,
}: {
  notice: React.ReactNode;
  name: string;
  description?: string;
  entryCount: number;
  groups: PlaylistRowGroup[];
  online: boolean;
  onPlay: () => void;
  onShuffle: () => void;
  onDownload: () => void;
}) {
  const { fontScale } = useWindowDimensions();
  const stats = useMemo(() => summarizePlaylist(groups), [groups]);
  const queueable = useMemo(
    () =>
      groups.reduce((n, g) => n + g.entries.filter((row) => isQueueable(row, online)).length, 0),
    [groups, online]
  );
  const canPlay = queueable > 0;
  const fullyDownloaded = stats.allDownloaded;
  const status = fullyDownloaded
    ? 'Downloaded'
    : stats.downloading > 0
      ? `Downloading ${stats.downloaded} of ${stats.downloadable}`
      : '';
  const iconSize = 20 * fontScale;

  // Laid out like a show's header: centered title, a quiet details line, then
  // one row of equal buttons.
  return (
    <View className="w-full items-center px-4">
      <RelistenText className="w-full py-2 text-center text-3xl font-bold" selectable={false}>
        {name}
      </RelistenText>
      {description ? (
        <RelistenText className="w-full pb-2 text-center text-gray-300">{description}</RelistenText>
      ) : null}
      <RelistenText className="w-full pb-4 text-center italic text-gray-400" selectable={false}>
        {[
          playlistSizeLine(entryCount, 0),
          stats.durationSeconds > 0 ? humanDuration(stats.durationSeconds) : '',
          status,
        ]
          .filter(Boolean)
          .join('\u00A0•\u00A0')}
      </RelistenText>

      {notice}
      {entryCount > 0 && (
        <View className="w-full flex-row pb-4" style={{ gap: 16 }}>
          <RelistenButton
            className="flex-1"
            textClassName="text-l"
            icon={<MaterialIcons name="play-arrow" size={iconSize} color="white" />}
            disabled={!canPlay}
            onPress={onPlay}
          >
            Play
          </RelistenButton>
          <RelistenButton
            className="flex-1"
            textClassName="text-l"
            icon={<MaterialIcons name="shuffle" size={iconSize} color="white" />}
            disabled={!canPlay}
            onPress={onShuffle}
          >
            Shuffle
          </RelistenButton>
          <RelistenButton
            accessibilityLabel="Download"
            className="basis-1/5"
            disabled={fullyDownloaded || stats.downloadable === 0}
            disabledPopoverText={
              fullyDownloaded
                ? 'Every track is downloaded'
                : 'None of these tracks can be downloaded'
            }
            onPress={onDownload}
          >
            <MaterialIcons name="file-download" size={iconSize} color="white" />
          </RelistenButton>
        </View>
      )}
      {entryCount > 0 && !canPlay && (
        <RelistenText className="pb-3 text-center text-sm text-gray-400">
          {nothingPlayableMessage(online)}
        </RelistenText>
      )}
      {!online && canPlay && queueable < entryCount && (
        <RelistenText className="pb-3 text-center text-sm text-gray-400">
          Playing {queueable} downloaded {queueable === 1 ? 'track' : 'tracks'}. The rest need
          internet.
        </RelistenText>
      )}
      <ItemSeparator />
    </View>
  );
}

function commitDetails(
  realm: Realm,
  playlistId: string,
  draft: { name: string; description: string },
  initial: { name: string; description: string }
) {
  const nameChanged = draft.name !== initial.name;
  updatePlaylistDetails(realm, playlistId, {
    // An emptied name keeps the old one rather than leaving the playlist unnamed.
    name: nameChanged && draft.name.trim() ? draft.name : undefined,
    description: draft.description !== initial.description ? draft.description : undefined,
  });
}

function EditHeader({
  draft,
  onChange,
  nameInput,
  focusName,
  onAddText,
}: {
  focusName: boolean;
  onAddText: () => void;
  draft: { name: string; description: string };
  onChange: (draft: { name: string; description: string }) => void;
  nameInput: React.RefObject<TextInputInstance | null>;
}) {
  return (
    <View className="px-4 pb-4 pt-2">
      <TextInput
        ref={nameInput}
        autoFocus={focusName}
        accessibilityLabel="Playlist name"
        className="rounded-lg bg-relisten-blue-800 px-3 py-3 text-xl font-bold text-white"
        maxLength={PLAYLIST_LIMITS.nameLength}
        value={draft.name}
        onChangeText={(name) => onChange({ ...draft, name })}
        returnKeyType="done"
      />
      <TextInput
        accessibilityLabel="Description"
        className="mt-2 rounded-lg bg-relisten-blue-800 px-3 py-3 text-white"
        maxLength={PLAYLIST_LIMITS.descriptionLength}
        multiline
        placeholder="Add a description"
        placeholderTextColor="#9ca3af"
        value={draft.description}
        onChangeText={(description) => onChange({ ...draft, description })}
      />
      {/* One way in, instead of a control in every gap: new text goes at the end,
          and its handle drags it into place like a track. */}
      <View className="mt-3 flex-row items-center" style={{ gap: 12 }}>
        <RelistenButton
          icon={<MaterialIcons name="notes" size={18} color="white" />}
          onPress={onAddText}
        >
          Add Text
        </RelistenButton>
        <RelistenText className="flex-1 text-sm text-gray-400" selectable={false}>
          Adds text at the end. Drag it into place.
        </RelistenText>
      </View>
    </View>
  );
}

function filterDownloaded(groups: PlaylistRowGroup[]): PlaylistRowGroup[] {
  return groups
    .map((group) => ({
      ...group,
      // Downloaded tracks only; the guide's text around them is dropped too.
      entries: group.entries.filter(
        (row) => row.sourceTrack?.offlineInfo?.isPlayableOffline() === true
      ),
      descriptionMarkdown: undefined,
    }))
    .filter((group) => group.entries.length > 0);
}

function nothingPlayableMessage(online: boolean) {
  return online
    ? 'None of these recordings are available right now.'
    : 'None of these tracks are downloaded.';
}
