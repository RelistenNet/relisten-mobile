import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import Realm from 'realm';
import { FlatList, TextInput, type TextInputInstance, TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { confirmDestructiveAction } from '@/relisten/components/menus/confirm_destructive_action';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import {
  SourceTrackOfflineInfo,
  SourceTrackOfflineInfoStatus,
} from '@/relisten/realm/models/source_track_offline_info';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { clearUndo } from '@/relisten/playlists/playlist_actions';
import { humanDuration, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import {
  usePlaylist,
  usePlaylistGroups,
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
import { PlaylistEditList, type ArrangeMode } from '@/relisten/playlists/ui/playlist_edit_list';
import {
  PlaylistGroupCard,
  PlaylistTrackRow,
  usePlayingEntryId,
} from '@/relisten/playlists/ui/playlist_rows';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { tw } from '@/relisten/util/tw';

export default function PlaylistDetailPage() {
  const { playlistId } = useLocalSearchParams<{ playlistId: string }>();
  const realm = useRealm();
  const router = useRouter();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const playlist = usePlaylist(playlistId);
  const allGroups = usePlaylistGroups(playlistId);
  const playingEntryId = usePlayingEntryId(playlistId);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const [editing, setEditing] = useState(false);
  // Name and description edits are drafts until Done (or leaving the screen) commits them.
  const [draft, setDraft] = useState({ name: '', description: '' });
  const draftRef = useRef<typeof draft | null>(null);
  const [arrange, setArrange] = useState<ArrangeMode>('tracks');
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const nameInput = useRef<TextInputInstance>(null);

  usePlaylistHydration(playlistId, allGroups, online);
  useEffect(
    () => () => {
      // Leaving the screen mid-edit keeps the changes; Undo history lasts for one visit.
      if (draftRef.current) commitDetails(realm, playlistId, draftRef.current);
      clearUndo(playlistId);
    },
    [playlistId, realm]
  );

  const groups = useMemo(
    () => (downloadedOnly ? filterDownloaded(allGroups) : allGroups),
    [allGroups, downloadedOnly]
  );

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
          { label: 'Undo', onPress: () => setPlaylistDeleted(realm, playlistId, false) },
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
    startEditing();
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
          <Stack.Toolbar.MenuAction icon={nativeMenuIcons.download} onPress={download}>
            Download
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
          groups={allGroups}
          mode={arrange}
          header={
            <EditHeader
              draft={draft}
              onChange={updateDraft}
              nameInput={nameInput}
              arrange={arrange}
              onArrange={setArrange}
              showArrange={allGroups.some((g) => g.entries.length > 1)}
            />
          }
        />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.segment.segmentId}
          ListHeaderComponent={
            <ViewHeader
              name={name}
              description={playlist.description}
              entryCount={playlist.entryCount}
              groups={allGroups}
              online={online}
              onPlay={() => play()}
              onShuffle={shuffle}
            />
          }
          ListEmptyComponent={
            <RelistenText className="px-6 py-8 text-center text-gray-400">
              {downloadedOnly
                ? 'No downloaded tracks yet.'
                : "This playlist is empty. Add songs from any show's ••• menu."}
            </RelistenText>
          }
          renderItem={({ item, index }) =>
            item.entries.length > 1 ? (
              <View className="px-3">
                <PlaylistGroupCard
                  playlistId={playlistId}
                  groups={allGroups}
                  group={item}
                  online={online}
                  playingEntryId={playingEntryId}
                  onPlay={play}
                />
              </View>
            ) : (
              <View className="pl-4 pr-2">
                {index > 0 && groups[index - 1].entries.length === 1 && <ItemSeparator />}
                <PlaylistTrackRow
                  playlistId={playlistId}
                  groups={allGroups}
                  row={item.entries[0]}
                  showShowLine
                  online={online}
                  playingEntryId={playingEntryId}
                  onPlay={play}
                />
              </View>
            )
          }
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
}: {
  name: string;
  description?: string;
  entryCount: number;
  groups: PlaylistRowGroup[];
  online: boolean;
  onPlay: () => void;
  onShuffle: () => void;
}) {
  // Subscribing to offline info keeps the download status current while downloads run.
  const offlineInfos = useQuery(SourceTrackOfflineInfo);
  const stats = useMemo(() => playbackStats(groups, online), [groups, online, offlineInfos]);
  const canPlay = stats.queueable > 0;
  const status =
    stats.downloadable > 0 && stats.downloaded === stats.downloadable
      ? 'Downloaded'
      : stats.downloading > 0
        ? `Downloading ${stats.downloaded} of ${stats.downloadable}`
        : '';

  return (
    <View className="px-4 pb-2 pt-2">
      <RelistenText className="text-2xl font-bold">{name}</RelistenText>
      {description ? (
        <RelistenText className="mt-1 text-gray-300">{description}</RelistenText>
      ) : null}
      <RelistenText className="mt-1 text-sm text-gray-400">
        {[
          playlistSizeLine(entryCount, 0),
          stats.durationSeconds > 0 ? humanDuration(stats.durationSeconds) : '',
          status,
        ]
          .filter(Boolean)
          .join(' · ')}
      </RelistenText>

      {entryCount > 0 && (
        <View className="mt-4 flex-row">
          <HeaderButton icon="play" label="Play" primary disabled={!canPlay} onPress={onPlay} />
          <View className="w-3" />
          <HeaderButton icon="shuffle" label="Shuffle" disabled={!canPlay} onPress={onShuffle} />
        </View>
      )}
      {entryCount > 0 && !canPlay && (
        <RelistenText className="mt-2 text-sm text-gray-400">
          {online
            ? 'None of these recordings are available right now.'
            : 'None of these tracks are downloaded.'}
        </RelistenText>
      )}
      {!online && canPlay && stats.queueable < stats.total && (
        <RelistenText className="mt-2 text-sm text-gray-400">
          Playing {stats.queueable} downloaded {stats.queueable === 1 ? 'track' : 'tracks'}. The
          rest need internet.
        </RelistenText>
      )}
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  primary = false,
  disabled,
  onPress,
}: {
  icon: 'play' | 'shuffle';
  label: string;
  primary?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={tw('min-h-[44px] flex-1 flex-row items-center justify-center rounded-lg', {
        'bg-relisten-blue-600': primary,
        'border border-relisten-blue-700': !primary,
        'opacity-40': disabled,
      })}
    >
      <Ionicons name={icon} size={18} color="white" />
      <RelistenText className="ml-2 font-semibold" selectable={false}>
        {label}
      </RelistenText>
    </TouchableOpacity>
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
  arrange,
  onArrange,
  showArrange,
}: {
  draft: { name: string; description: string };
  onChange: (draft: { name: string; description: string }) => void;
  nameInput: React.RefObject<TextInputInstance | null>;
  arrange: ArrangeMode;
  onArrange: (mode: ArrangeMode) => void;
  showArrange: boolean;
}) {
  return (
    <View className="px-4 pb-3 pt-2">
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
      {showArrange && (
        <View
          className="mt-4 flex-row rounded-lg border border-relisten-blue-700 p-1"
          accessibilityRole="tablist"
        >
          {(['tracks', 'groups'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              accessibilityRole="tab"
              accessibilityState={{ selected: arrange === mode }}
              className={tw('min-h-[36px] flex-1 items-center justify-center rounded-md', {
                'bg-relisten-blue-700': arrange === mode,
              })}
              onPress={() => onArrange(mode)}
            >
              <RelistenText className="font-semibold" selectable={false}>
                {mode === 'tracks' ? 'Arrange Tracks' : 'Arrange Groups'}
              </RelistenText>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
  return { total, queueable, durationSeconds, downloadable, downloaded, downloading };
}
