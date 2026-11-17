import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import Realm from 'realm';
import {
  FlatList,
  TextInput,
  type TextInputInstance,
  useWindowDimensions,
  View,
} from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { humanDuration, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import {
  usePlaylist,
  usePlaylistGroups,
  usePlaylistLayout,
  type PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import { usePlaylistHydration } from '@/relisten/playlists/playlist_hydration';
import { isQueueable, playPlaylist, shufflePlaylist } from '@/relisten/playlists/playlist_playback';
import {
  PLAYLIST_LIMITS,
  setPlaylistDeleted,
  updatePlaylistDetails,
  RECENTLY_DELETED_DAYS,
} from '@/relisten/playlists/playlist_repository';
import { PlaylistEditList } from '@/relisten/playlists/ui/playlist_edit_list';
import {
  PlaylistTrackRow,
  playlistViewRows,
  usePlayingEntryId,
} from '@/relisten/playlists/ui/playlist_rows';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
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
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const nameInput = useRef<TextInputInstance>(null);

  usePlaylistHydration(playlistId, allGroups, online);
  // Leaving the screen mid-edit keeps the name and description changes. Undo
  // history is kept so a toast's Undo still works after navigating away.
  useEffect(
    () => () => {
      if (draftRef.current) commitDetails(realm, playlistId, draftRef.current);
    },
    [playlistId, realm]
  );
  // Watching offline info keeps Show Downloaded Only current as downloads finish.
  const offlineInfos = useQuery(SourceTrackOfflineInfo);

  const viewRows = useMemo(
    () => playlistViewRows(downloadedOnly ? filterDownloaded(allGroups) : allGroups),
    [allGroups, downloadedOnly, offlineInfos]
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
      showPlaylistToast(
        online ? 'None of these tracks can play right now.' : 'None of these tracks are downloaded.'
      );
    }
  };
  const shuffle = () => {
    if (!shufflePlaylist(player, playlistId, allGroups, online)) {
      showPlaylistToast(
        online ? 'None of these tracks can play right now.' : 'None of these tracks are downloaded.'
      );
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
  const deletePlaylist = () =>
    confirmDestructiveAction({
      title: `Delete ${name}?`,
      message: `You can restore it from Recently Deleted for ${RECENTLY_DELETED_DAYS} days.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        setPlaylistDeleted(realm, playlistId, true);
        router.back();
        showPlaylistToast(`Deleted ${name}`, [
          {
            label: 'Undo',
            onPress: () => setPlaylistDeleted(realm, playlistId, false),
          },
        ]);
      },
    });
  const startEditing = () => {
    const initial = { name, description: playlist.description ?? '' };
    draftRef.current = initial;
    setDraft(initial);
    setEditing(true);
  };
  const finishEditing = () => {
    if (draftRef.current) commitDetails(realm, playlistId, draftRef.current);
    draftRef.current = null;
    setEditing(false);
  };
  const updateDraft = (next: typeof draft) => {
    draftRef.current = next;
    setDraft(next);
  };
  const startRename = () => {
    if (!editing) startEditing();
    setTimeout(() => nameInput.current?.focus(), 300);
  };

  return (
    <View className="flex-1 bg-relisten-blue-900">
      <Stack.Screen options={{ title: editing ? 'Editing' : '' }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={editing ? finishEditing : startEditing}>
          {editing ? 'Done' : 'Edit'}
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Menu accessibilityLabel="Playlist actions" icon={nativeMenuIcons.more}>
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.edit} onPress={startRename}>
            Rename…
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={nativeMenuIcons.download}
            isOn={downloadedOnly}
            onPress={() => setDownloadedOnly(!downloadedOnly)}
          >
            Show Downloaded Only
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            destructive
            icon={nativeMenuIcons.delete}
            onPress={deletePlaylist}
          >
            Delete Playlist…
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>

      {editing ? (
        <PlaylistEditList
          playlistId={playlistId}
          layout={layout}
          header={<EditHeader draft={draft} onChange={updateDraft} nameInput={nameInput} />}
        />
      ) : (
        <FlatList
          data={viewRows}
          keyExtractor={(r) => r.row.entry.entryId}
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
            />
          }
          ListEmptyComponent={
            <RelistenText className="px-6 py-8 text-center text-gray-400">
              {downloadedOnly
                ? 'No downloaded tracks yet.'
                : "This playlist is empty. Add songs from any show's ••• menu."}
            </RelistenText>
          }
          renderItem={({ item, index }) => (
            <PlaylistTrackRow
              playlistId={playlistId}
              layout={layout}
              viewRow={item}
              separator={index < viewRows.length - 1}
              online={online}
              playingEntryId={playingEntryId}
              linkPlaying={
                item.link !== undefined && item.group.segment.segmentId === playingSegmentId
              }
              onPlay={play}
            />
          )}
          {...scrollProps}
        />
      )}
    </View>
  );
}

function ViewHeader({
  name,
  description,
  entryCount,
  groups,
  online,
  onPlay,
  onShuffle,
  onDownload,
}: {
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
  // Subscribing to offline info keeps the download status current while downloads run.
  const offlineInfos = useQuery(SourceTrackOfflineInfo);
  const stats = useMemo(() => playbackStats(groups, online), [groups, online, offlineInfos]);
  const canPlay = stats.queueable > 0;
  const fullyDownloaded = stats.downloadable > 0 && stats.downloaded === stats.downloadable;
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
          {online
            ? 'None of these recordings are available right now.'
            : 'None of these tracks are downloaded.'}
        </RelistenText>
      )}
      {!online && canPlay && stats.queueable < stats.total && (
        <RelistenText className="pb-3 text-center text-sm text-gray-400">
          Playing {stats.queueable} downloaded {stats.queueable === 1 ? 'track' : 'tracks'}. The
          rest need internet.
        </RelistenText>
      )}
      <ItemSeparator />
    </View>
  );
}

function commitDetails(
  realm: Realm,
  playlistId: string,
  draft: { name: string; description: string }
) {
  updatePlaylistDetails(realm, playlistId, {
    // An emptied name keeps the old one rather than leaving the playlist unnamed.
    name: draft.name.trim() ? draft.name : undefined,
    description: draft.description,
  });
}

function EditHeader({
  draft,
  onChange,
  nameInput,
}: {
  draft: { name: string; description: string };
  onChange: (draft: { name: string; description: string }) => void;
  nameInput: React.RefObject<TextInputInstance | null>;
}) {
  return (
    <View className="px-4 pb-4 pt-2">
      <TextInput
        ref={nameInput}
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
    </View>
  );
}

function filterDownloaded(groups: PlaylistRowGroup[]): PlaylistRowGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (row) => row.sourceTrack?.offlineInfo?.isPlayableOffline() === true
      ),
    }))
    .filter((group) => group.entries.length > 0);
}

function playbackStats(groups: PlaylistRowGroup[], online: boolean) {
  let total = 0;
  let queueable = 0;
  let durationSeconds = 0;
  let downloadable = 0;
  let downloaded = 0;
  let downloading = 0;
  for (const group of groups) {
    for (const row of group.entries) {
      total++;
      if (isQueueable(row, online)) queueable++;
      const track = row.sourceTrack;
      if (!track) continue;
      durationSeconds += track.duration ?? 0;
      if (!track.supportsOfflineDownload()) continue;
      downloadable++;
      const info = track.offlineInfo;
      if (info?.isPlayableOffline()) downloaded++;
      else if (
        info?.status === SourceTrackOfflineInfoStatus.Queued ||
        info?.status === SourceTrackOfflineInfoStatus.Downloading
      )
        downloading++;
    }
  }
  return {
    total,
    queueable,
    durationSeconds,
    downloadable,
    downloaded,
    downloading,
  };
}
