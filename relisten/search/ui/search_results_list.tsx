import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { ListRow } from '@/relisten/components/list_row';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import type { Artist } from '@/relisten/realm/models/artist';
import type { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { showVenueName } from '@/relisten/util/venue_route';
import type { SearchListItem } from '../search_list_items';
import { describePlaylistCard, describeSearchRow, type SearchArtistNames } from '../search_rows';
import { useSearchArtistNames } from '../use_search_artist_names';
import type { SearchCatalogRow, SearchPlaylistCard, SearchScope } from '../search_types';
import { SearchResultRow } from './search_result_row';

/**
 * What a surface does with each kind of item. The Search tab opens screens;
 * Add Tracks narrows in place, opens its own small screens, and puts **+** on
 * rows that name a file.
 */
export interface SearchListHandlers {
  onPressRow: (row: SearchCatalogRow) => void;
  onLongPressRow?: (row: SearchCatalogRow) => void;
  trailingForRow?: (row: SearchCatalogRow) => ReactNode;
  onPressPlaylist?: (card: SearchPlaylistCard) => void;
  onPressScope: (scope: SearchScope) => void;
  onRetry: () => void;
  onPressLocalArtist: (artist: Artist) => void;
  onPressLocalShow: (show: Show) => void;
  onPressLocalTrack: (track: SourceTrack) => void;
  trailingForLocalTrack?: (track: SourceTrack) => ReactNode;
  onPressLocalPlaylist?: (playlist: Playlist) => void;
  onPressRecent: (entry: PlaybackHistoryEntry) => void;
}

/**
 * One scrolling list for every state of a search: Recently Played, remote
 * results, On this device, or a mix of the last two. The field and chips sit
 * above it, so the keyboard keeps its focus while results change.
 */
export function SearchResultsList({
  items,
  handlers,
  onEndReached,
  loadingMore = false,
  contentContainerStyle,
}: {
  items: SearchListItem[];
  handlers: SearchListHandlers;
  onEndReached?: () => void;
  loadingMore?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const artistNames = useSearchArtistNames();

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <SearchListItemView item={item} handlers={handlers} artistNames={artistNames} />
      )}
      ItemSeparatorComponent={ItemSeparator}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={contentContainerStyle}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator className="py-4" color="white" /> : undefined
      }
    />
  );
}

/** `handler` bound to `arg`, or nothing when the surface has no handler for it. */
function bound<T>(handler: ((arg: T) => void) | undefined, arg: T) {
  return handler ? () => handler(arg) : undefined;
}

function SearchListItemView({
  item,
  handlers,
  artistNames,
}: {
  item: SearchListItem;
  handlers: SearchListHandlers;
  artistNames: SearchArtistNames;
}) {
  switch (item.type) {
    case 'header':
      return (
        <SearchSectionHeader
          title={item.title}
          scope={item.scope}
          onPressScope={handlers.onPressScope}
        />
      );
    case 'loading':
      return <ActivityIndicator className="py-6" color="white" />;
    case 'message':
      return <SearchMessage text={item.text} onRetry={item.retry ? handlers.onRetry : undefined} />;
    case 'row':
      return (
        <SearchResultRow
          text={describeSearchRow(item.row, artistNames)}
          onPress={() => handlers.onPressRow(item.row)}
          onLongPress={bound(handlers.onLongPressRow, item.row)}
          trailing={handlers.trailingForRow?.(item.row)}
        />
      );
    case 'playlist':
      return (
        <SearchResultRow
          text={describePlaylistCard(item.card)}
          onPress={bound(handlers.onPressPlaylist, item.card)}
        />
      );
    case 'local-artist':
      return (
        <ListRow
          title={item.artist.name}
          subtitle="Artist"
          onPress={() => handlers.onPressLocalArtist(item.artist)}
        />
      );
    case 'local-show':
      return (
        <ListRow
          title={[item.show.displayDate, showVenueName(item.show)].filter(Boolean).join(' · ')}
          subtitle={item.show.artist?.name}
          onPress={() => handlers.onPressLocalShow(item.show)}
        />
      );
    case 'local-track':
      return <LocalTrackRow track={item.track} handlers={handlers} />;
    case 'local-playlist':
      return (
        <ListRow
          title={item.playlist.name}
          subtitle={`${item.playlist.entryCount} tracks`}
          onPress={bound(handlers.onPressLocalPlaylist, item.playlist)}
        />
      );
    case 'recent':
      return (
        <ListRow
          title={item.entry.show.displayDate}
          subtitle={[item.entry.artist.name, showVenueName(item.entry.show)]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => handlers.onPressRecent(item.entry)}
        />
      );
  }
}

/** A downloaded file, labeled with its artist, show and recording. */
function LocalTrackRow({ track, handlers }: { track: SourceTrack; handlers: SearchListHandlers }) {
  const subtitle = [track.artist?.name, track.show?.displayDate, track.source?.upstreamIdentifier]
    .filter(Boolean)
    .join(' · ');

  return (
    <SearchResultRow
      text={{ title: track.title, subtitle, badges: [] }}
      onPress={() => handlers.onPressLocalTrack(track)}
      trailing={handlers.trailingForLocalTrack?.(track)}
    />
  );
}

/** A section title; a section with its own scope links to it ("See All"). */
function SearchSectionHeader({
  title,
  scope,
  onPressScope,
}: {
  title: string;
  scope?: SearchScope;
  onPressScope: (scope: SearchScope) => void;
}) {
  if (!scope) {
    return <SectionHeader title={title} />;
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityHint={`Shows only ${title.toLowerCase()}`}
      onPress={() => onPressScope(scope)}
    >
      <SectionHeader className="flex-row items-center justify-between">
        <RelistenText className="text-m font-bold">{title}</RelistenText>
        <RelistenText className="text-sm text-gray-300">See All ›</RelistenText>
      </SectionHeader>
    </TouchableOpacity>
  );
}

function SearchMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View className="flex-row items-center px-4 py-4">
      <RelistenText className="flex-1 text-gray-300">{text}</RelistenText>
      {onRetry && (
        <TouchableOpacity
          accessibilityRole="button"
          className="ml-3 rounded-full bg-relisten-blue-700 px-3 py-1.5"
          onPress={onRetry}
        >
          <RelistenText className="text-sm font-semibold">Try Again</RelistenText>
        </TouchableOpacity>
      )}
    </View>
  );
}
