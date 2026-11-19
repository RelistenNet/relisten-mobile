import { MaterialIcons } from '@expo/vector-icons';
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { FlatList, type FlatListProps, useWindowDimensions, View } from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { humanDuration, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import {
  summarizePlaylist,
  useIdentityReuse,
  usePlaylistLayout,
  type PlaylistRowGroup,
} from '@/relisten/playlists/playlist_hooks';
import {
  isQueueable,
  playEntryAt,
  playPlaylist,
  shufflePlaylist,
} from '@/relisten/playlists/playlist_playback';
import {
  PlaylistIntroRow,
  PlaylistTextRow,
  PlaylistTrackRow,
  type PlaylistViewRow,
  playlistViewRows,
  reuseUnchangedViewRows,
  usePlayingEntryId,
} from '@/relisten/playlists/ui/playlist_rows';
import { trackMenuPlace } from '@/relisten/playlists/ui/playlist_menus';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/**
 * A playlist as a listener reads and plays it: the header, then its rows.
 * Shared by playlists the listener made (outside edit mode), ones they
 * follow, and public ones opened from a link, which can't be edited.
 *
 * `playlistId` is what queued tracks are attributed to, so the playing row
 * lights up; for a public playlist that isn't stored, it's the playlist's ID
 * from its snapshot.
 */
export function PlaylistReadingList({
  playlistId,
  groups,
  editable,
  downloadedOnly = false,
  header,
  emptyText,
}: {
  playlistId: string;
  /** Every group, which is what Play queues. */
  groups: PlaylistRowGroup[];
  editable: boolean;
  /** Shows only downloaded tracks, and drops the guide text around them. */
  downloadedOnly?: boolean;
  header: React.ReactElement;
  emptyText: string;
}) {
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const layout = usePlaylistLayout(groups);
  const playingEntryId = usePlayingEntryId(playlistId);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const keepUnchangedViewRows = useIdentityReuse(reuseUnchangedViewRows, []);
  // The groups update as downloads finish, which keeps Show Downloaded Only current.
  // Menus act on the whole playlist, so their places come from every group.
  const viewRows = useMemo(
    () =>
      keepUnchangedViewRows(
        playlistViewRows(downloadedOnly ? filterDownloaded(groups) : groups, (entryId) =>
          trackMenuPlace(layout, entryId)
        )
      ),
    [groups, layout, downloadedOnly, keepUnchangedViewRows]
  );
  const playingSegmentId = playingEntryId
    ? layout.groups[layout.entryPositions.get(playingEntryId)?.groupIndex ?? -1]?.segment.segmentId
    : undefined;

  // Row callbacks read the playlist when tapped, so they stay the same function
  // as tracks load and every memoized row isn't re-rendered for a new one.
  const latest = useRef({ groups, online });
  useLayoutEffect(() => {
    latest.current = { groups, online };
  });
  const play = useCallback(
    (entryId: string) => {
      const { groups, online } = latest.current;
      if (!playPlaylist(player, playlistId, groups, online, entryId)) {
        showPlaylistToast('This track isn’t downloaded.');
      }
    },
    [player, playlistId]
  );
  const playTimestamp = useCallback(
    (entryId: string, seconds: number) => {
      const { groups, online } = latest.current;
      if (!playEntryAt(player, playlistId, groups, online, entryId, seconds)) {
        showPlaylistToast(
          online ? 'That part isn’t available right now.' : 'That track isn’t downloaded.'
        );
      }
    },
    [player, playlistId]
  );

  return (
    <DisappearingHeaderScreen
      ScrollableComponent={PlaylistTrackList}
      data={viewRows}
      keyExtractor={(r) => r.key}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <RelistenText className="px-6 py-8 text-center text-gray-400">
          {downloadedOnly ? 'No downloaded tracks yet.' : emptyText}
        </RelistenText>
      }
      renderItem={({ item }) => {
        const linkPlaying = item.link !== undefined && item.segmentId === playingSegmentId;
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
            viewRow={item}
            editable={editable}
            linkPlaying={linkPlaying}
            onTimestamp={playTimestamp}
          />
        ) : (
          <PlaylistTrackRow
            playlistId={playlistId}
            viewRow={item}
            editable={editable}
            online={online}
            isCurrent={item.row.entry.entryId === playingEntryId}
            linkPlaying={linkPlaying}
            onPlay={play}
            onTimestamp={playTimestamp}
          />
        );
      }}
      {...scrollProps}
    />
  );
}

/** The playlist's rows; a FlatList typed for DisappearingHeaderScreen. */
const PlaylistTrackList = FlatList as React.ComponentType<FlatListProps<PlaylistViewRow>>;

/**
 * Following someone else's playlist: a heart in the action row, red once the
 * playlist is in the listener's library, the same as favoriting a show.
 */
export interface PlaylistFollowControl {
  following: boolean;
  busy?: boolean;
  onPress: () => void;
}

/**
 * The top of a playlist, laid out like a show's header: centered title, a
 * quiet details line, then one row of equal buttons.
 */
export function PlaylistViewHeader({
  playlistId,
  name,
  byline,
  description,
  trackCount,
  groups,
  notice,
  follow,
}: {
  playlistId: string;
  name: string;
  /** "by @username", for a playlist someone else made. */
  byline?: string;
  description?: string;
  trackCount: number;
  groups: PlaylistRowGroup[];
  notice?: React.ReactNode;
  /** For someone else's playlist: the follow heart, filled once followed. */
  follow?: PlaylistFollowControl;
}) {
  const { fontScale } = useWindowDimensions();
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
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

  const play = () => {
    if (!playPlaylist(player, playlistId, groups, online)) {
      showPlaylistToast(nothingPlayableMessage(online));
    }
  };
  const shuffle = () => {
    if (!shufflePlaylist(player, playlistId, groups, online)) {
      showPlaylistToast(nothingPlayableMessage(online));
    }
  };
  const download = () => {
    for (const group of groups) {
      for (const row of group.entries) {
        if (row.sourceTrack?.supportsOfflineDownload()) {
          void DownloadManager.SHARED_INSTANCE.downloadTrack(row.sourceTrack);
        }
      }
    }
  };

  return (
    <View className="w-full items-center px-4">
      <RelistenText className="w-full pt-2 text-center text-3xl font-bold" selectable={false}>
        {name}
      </RelistenText>
      {byline ? (
        <RelistenText className="w-full text-center text-gray-300" selectable={false}>
          {byline}
        </RelistenText>
      ) : null}
      <View className="h-2" />
      {description ? (
        <RelistenText className="w-full pb-2 text-center text-gray-300">{description}</RelistenText>
      ) : null}
      <RelistenText className="w-full pb-4 text-center italic text-gray-400" selectable={false}>
        {[
          playlistSizeLine(trackCount, 0),
          stats.durationSeconds > 0 ? humanDuration(stats.durationSeconds) : '',
          status,
        ]
          .filter(Boolean)
          .join(' • ')}
      </RelistenText>

      {notice}
      {(trackCount > 0 || follow) && (
        <View className="w-full flex-row pb-4" style={{ gap: 16 }}>
          <RelistenButton
            className="flex-1"
            textClassName="text-l"
            icon={<MaterialIcons name="play-arrow" size={iconSize} color="white" />}
            disabled={!canPlay}
            onPress={play}
          >
            Play
          </RelistenButton>
          {/* The heart takes the room Shuffle's label would. */}
          {follow ? (
            <RelistenButton
              accessibilityLabel="Shuffle"
              className="basis-1/5"
              disabled={!canPlay}
              onPress={shuffle}
            >
              <MaterialIcons name="shuffle" size={iconSize} color="white" />
            </RelistenButton>
          ) : (
            <RelistenButton
              className="flex-1"
              textClassName="text-l"
              icon={<MaterialIcons name="shuffle" size={iconSize} color="white" />}
              disabled={!canPlay}
              onPress={shuffle}
            >
              Shuffle
            </RelistenButton>
          )}
          <RelistenButton
            accessibilityLabel="Download"
            className="basis-1/5"
            disabled={fullyDownloaded || stats.downloadable === 0}
            disabledPopoverText={
              fullyDownloaded
                ? 'Every track is downloaded'
                : 'None of these tracks can be downloaded'
            }
            onPress={download}
          >
            <MaterialIcons name="file-download" size={iconSize} color="white" />
          </RelistenButton>
          {follow ? <FollowButton {...follow} iconSize={iconSize} /> : null}
        </View>
      )}
      {trackCount > 0 && !canPlay && (
        <RelistenText className="pb-3 text-center text-sm text-gray-400">
          {nothingPlayableMessage(online)}
        </RelistenText>
      )}
      {!online && canPlay && queueable < trackCount && (
        <RelistenText className="pb-3 text-center text-sm text-gray-400">
          Playing {queueable} downloaded {queueable === 1 ? 'track' : 'tracks'}. The rest need
          internet.
        </RelistenText>
      )}
      <ItemSeparator />
    </View>
  );
}

function FollowButton({
  following,
  busy = false,
  onPress,
  iconSize,
}: PlaylistFollowControl & { iconSize: number }) {
  return (
    <RelistenButton
      accessibilityLabel="Follow"
      accessibilityState={{ selected: following, busy }}
      className="basis-1/5"
      disabled={busy}
      onPress={onPress}
    >
      <MaterialIcons
        name={following ? 'favorite' : 'favorite-outline'}
        size={iconSize}
        color={following ? 'red' : 'white'}
      />
    </RelistenButton>
  );
}

/**
 * A message in place of a playlist's rows, such as an unavailable or
 * not-yet-loaded playlist, set below the transparent header.
 */
export function PlaylistScreenNotice({ children }: { children: React.ReactNode }) {
  const headerHeight = useHeaderHeight();
  return (
    <View
      className="flex-1 items-center bg-relisten-blue-900 px-8"
      style={{ gap: 16, paddingTop: headerHeight + 24 }}
    >
      {children}
    </View>
  );
}

/** The empty-list text for a playlist whose rows haven't arrived yet. */
export function notLoadedText(online: boolean) {
  return online ? 'Loading…' : 'Connect to the internet to load this playlist.';
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
