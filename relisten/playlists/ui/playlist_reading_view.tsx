import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  type FlatListProps,
  type TextInputInstance,
  useWindowDimensions,
  View,
} from 'react-native';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { SearchFilterBar } from '@/relisten/components/filtering/filter_bar';
import { DisappearingHeaderScreen } from '@/relisten/components/screens/disappearing_title_screen';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { DownloadManager } from '@/relisten/offline/download_manager';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { humanDuration, playlistSizeLine } from '@/relisten/playlists/playlist_format';
import { downloadedGroups, searchedGroups } from '@/relisten/playlists/playlist_group_filters';
import {
  summarizePlaylist,
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
  usePlayingEntryId,
} from '@/relisten/playlists/ui/playlist_rows';
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
  search,
  header,
  emptyText,
}: {
  playlistId: string;
  /** Every group, which is what Play queues. */
  groups: PlaylistRowGroup[];
  editable: boolean;
  /** Shows only downloaded tracks, and drops the guide text around them. */
  downloadedOnly?: boolean;
  search: PlaylistSearch;
  header: React.ReactElement;
  emptyText: string;
}) {
  const player = useRelistenPlayer();
  const online = useShouldMakeNetworkRequests();
  const layout = usePlaylistLayout(groups);
  const playingEntryId = usePlayingEntryId(playlistId);
  const scrollProps = usePlayerBottomScrollViewProps({});
  const listRef = useRef<FlatList<PlaylistViewRow>>(null);
  const searchInputRef = useRef<TextInputInstance>(null);
  const { query } = search;

  // The field sits under the header, so opening search scrolls up to it.
  useEffect(() => {
    if (search.isOpen) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      searchInputRef.current?.focus();
    }
  }, [search.isOpen]);
  // The groups update as downloads finish, which keeps Show Downloaded Only current.
  const viewRows = useMemo(
    () =>
      playlistViewRows(searchedGroups(downloadedOnly ? downloadedGroups(groups) : groups, query)),
    [groups, downloadedOnly, query]
  );
  const searching = query.trim() !== '';
  const playingSegmentId = playingEntryId
    ? layout.groups[layout.entryPositions.get(playingEntryId)?.groupIndex ?? -1]?.segment.segmentId
    : undefined;

  // Playback queues every group, even when only downloaded tracks show.
  const play = (entryId: string) => {
    if (!playPlaylist(player, playlistId, groups, online, entryId)) {
      showPlaylistToast('This track isn’t downloaded.');
    }
  };
  const playTimestamp = (entryId: string, seconds: number) => {
    if (!playEntryAt(player, playlistId, groups, online, entryId, seconds)) {
      showPlaylistToast(
        online ? 'That part isn’t available right now.' : 'That track isn’t downloaded.'
      );
    }
  };

  return (
    <DisappearingHeaderScreen
      ScrollableComponent={PlaylistTrackList}
      ref={listRef}
      data={viewRows}
      keyExtractor={(r) => r.key}
      ListHeaderComponent={
        <>
          {header}
          {/* Search narrows the rows like Show Downloaded Only; Play still queues everything. */}
          {search.isOpen && (
            <SearchFilterBar
              search={search.setQuery}
              exitSearch={search.close}
              searchText={query}
              innerRef={searchInputRef}
              placeholder="Search this playlist"
            />
          )}
        </>
      }
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListEmptyComponent={
        <RelistenText className="px-6 py-8 text-center text-gray-400">
          {searching
            ? `Nothing in this playlist matches “${query.trim()}”.`
            : downloadedOnly
              ? 'No downloaded tracks yet.'
              : emptyText}
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
            layout={layout}
            viewRow={item}
            editable={editable}
            linkPlaying={linkPlaying}
            onTimestamp={playTimestamp}
          />
        ) : (
          <PlaylistTrackRow
            playlistId={playlistId}
            layout={layout}
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

/**
 * Search inside a playlist. The screen's toolbar opens it, which shows a
 * field above the rows; cancelling clears the query and hides the field.
 */
export interface PlaylistSearch {
  isOpen: boolean;
  query: string;
  setQuery: (query: string) => void;
  open: () => void;
  close: () => void;
}

export function usePlaylistSearch(): PlaylistSearch {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  return {
    isOpen,
    query,
    setQuery,
    open: () => setIsOpen(true),
    close: () => {
      setQuery('');
      setIsOpen(false);
    },
  };
}

/**
 * The playlist's rows; a FlatList typed for DisappearingHeaderScreen, which
 * passes `ref` through to it so opening search can scroll to the top.
 */
const PlaylistTrackList = FlatList as React.ComponentType<
  FlatListProps<PlaylistViewRow> & { ref?: React.Ref<FlatList<PlaylistViewRow>> }
>;

/**
 * The header's heart, Share and Make a Copy, which every playlist shows in
 * the same places. What they do depends on whose playlist it is, so each
 * screen supplies them.
 */
export interface PlaylistHeaderActions {
  heart: PlaylistHeart;
  share: () => void;
  copy: () => void;
  /** An account action is in flight; the heart and Make a Copy wait for it. */
  busy?: boolean;
}

/** A heart in the action row: outlined, or filled red once it is on. */
export interface PlaylistHeart {
  /** What the heart does, for VoiceOver: "Favorite" or "Follow". */
  label: string;
  isOn: boolean;
  onPress: () => void;
}

/**
 * The top of a playlist, laid out like a show's header: centered title, a
 * quiet details line, then two rows of buttons. Play, Download, the heart and
 * Share are equal in the first; Shuffle and Make a Copy share the second.
 */
export function PlaylistViewHeader({
  playlistId,
  name,
  byline,
  description,
  trackCount,
  groups,
  notice,
  actions,
}: {
  playlistId: string;
  name: string;
  /** "by @username", for a playlist someone else made. */
  byline?: string;
  description?: string;
  trackCount: number;
  groups: PlaylistRowGroup[];
  notice?: React.ReactNode;
  actions: PlaylistHeaderActions;
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
  const busy = actions.busy ?? false;

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
          .join(' • ')}
      </RelistenText>

      {notice}
      <View className="w-full flex-row pb-4" style={{ gap: 16 }}>
        <RelistenButton
          className="shrink basis-1/4"
          textClassName="text-l"
          icon={<MaterialIcons name="play-arrow" size={iconSize} color="white" />}
          disabled={!canPlay}
          onPress={play}
        >
          Play
        </RelistenButton>
        <RelistenButton
          accessibilityLabel="Download"
          className="shrink basis-1/4"
          disabled={fullyDownloaded || stats.downloadable === 0}
          disabledPopoverText={
            fullyDownloaded ? 'Every track is downloaded' : 'None of these tracks can be downloaded'
          }
          onPress={download}
        >
          <MaterialIcons name="file-download" size={iconSize} color="white" />
        </RelistenButton>
        <HeartButton {...actions.heart} busy={busy} iconSize={iconSize} />
        <RelistenButton
          accessibilityLabel="Share"
          className="shrink basis-1/4"
          onPress={actions.share}
        >
          <MaterialIcons name="ios-share" size={iconSize} color="white" />
        </RelistenButton>
      </View>
      <View className="w-full flex-row pb-4" style={{ gap: 16 }}>
        <RelistenButton
          className="flex-1"
          textClassName="text-l"
          icon={<MaterialIcons name="shuffle" size={iconSize} color="white" />}
          disabled={!canPlay}
          onPress={shuffle}
        >
          Shuffle
        </RelistenButton>
        <RelistenButton
          className="flex-1"
          textClassName="text-l"
          icon={<MaterialIcons name="content-copy" size={iconSize} color="white" />}
          disabled={busy}
          onPress={actions.copy}
        >
          Make a Copy
        </RelistenButton>
      </View>
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

function HeartButton({
  label,
  isOn,
  onPress,
  busy,
  iconSize,
}: PlaylistHeart & { busy: boolean; iconSize: number }) {
  return (
    <RelistenButton
      accessibilityLabel={label}
      accessibilityState={{ selected: isOn, busy }}
      className="shrink basis-1/4"
      disabled={busy}
      onPress={onPress}
    >
      <MaterialIcons
        name={isOn ? 'favorite' : 'favorite-outline'}
        size={iconSize}
        color={isOn ? 'red' : 'white'}
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

function nothingPlayableMessage(online: boolean) {
  return online
    ? 'None of these recordings are available right now.'
    : 'None of these tracks are downloaded.';
}
