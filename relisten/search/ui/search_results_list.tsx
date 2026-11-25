import type { ReactElement, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SectionHeader } from '@/relisten/components/section_header';
import type { Artist } from '@/relisten/realm/models/artist';
import type { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import type { Playlist } from '@/relisten/realm/models/playlists/playlist';
import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import type { SearchListItem } from '../search_list_items';
import type { SearchCatalogRow, SearchPlaylistCard, SearchScope } from '../search_types';
import { ArtistRow } from '@/relisten/components/artist_rows';
import { ListRow } from '@/relisten/components/list_row';
import { ShowRow, showRowFields } from '@/relisten/components/shows_list';
import {
  TrackWithArtistRow,
  trackWithArtistFields,
} from '@/relisten/components/source/source_track_with_artist';
import { showVenueLabel } from '@/relisten/util/venue_route';
import { SearchCatalogResult, SearchPlaylistResult, VenueLine } from './search_result_row';

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
 * results, On this device, or a mix of the last two. The search bar is in the
 * screen's header; the chips are the list's header, so they scroll with the
 * results.
 */
export function SearchResultsList({
  items,
  handlers,
  onEndReached,
  loadingMore = false,
  contentContainerStyle,
  header,
}: {
  items: SearchListItem[];
  handlers: SearchListHandlers;
  onEndReached?: () => void;
  loadingMore?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** The chips, which scroll with the results. */
  header?: ReactElement;
}) {
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => <SearchListItemView item={item} handlers={handlers} />}
      ItemSeparatorComponent={ItemSeparator}
      keyboardShouldPersistTaps="handled"
      // Dragging the list closes the keyboard, which uncovers its last rows.
      // Insetting for the keyboard instead (`automaticallyAdjustKeyboardInsets`)
      // shifted the list when the keyboard closed on Search, hiding the chips;
      // in the sheet it scrolled past the end, since the sheet resizes itself.
      keyboardDismissMode="on-drag"
      // Not pinned: a sticky header remounts whenever the rows change.
      ListHeaderComponent={header}
      // The header and its search bar overlap the content, in a tab and in a
      // form sheet alike; the automatic inset clears them.
      contentInsetAdjustmentBehavior="automatic"
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
}: {
  item: SearchListItem;
  handlers: SearchListHandlers;
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
        <SearchCatalogResult
          row={item.row}
          onPress={() => handlers.onPressRow(item.row)}
          onLongPress={bound(handlers.onLongPressRow, item.row)}
          trailing={handlers.trailingForRow?.(item.row)}
        />
      );
    case 'playlist':
      return (
        <SearchPlaylistResult
          card={item.card}
          onPress={bound(handlers.onPressPlaylist, item.card)}
        />
      );
    case 'local-artist':
      return (
        <ArtistRow
          artist={item.artist}
          metadata={{ shows: item.artist.showCount, sources: item.artist.sourceCount }}
          accessibilityRole="button"
          onPress={() => handlers.onPressLocalArtist(item.artist)}
        />
      );
    case 'local-show':
      return (
        <ShowRow
          fields={showRowFields(item.show)}
          popularity={item.show.popularity?.snapshot()}
          byline={item.show.artist?.name}
          accessibilityRole="button"
          onPress={() => handlers.onPressLocalShow(item.show)}
        />
      );
    case 'local-track':
      return (
        <TrackWithArtistRow
          fields={trackWithArtistFields(item.track)}
          subtitleColumn
          indicatorComponent={handlers.trailingForLocalTrack?.(item.track)}
          accessibilityRole="button"
          onPress={() => handlers.onPressLocalTrack(item.track)}
        >
          <VenueLine place={item.track.show ? showVenueLabel(item.track.show) : undefined} />
        </TrackWithArtistRow>
      );
    case 'local-playlist':
      return (
        <ListRow
          title={item.playlist.name}
          subtitle={`${item.playlist.entryCount} ${item.playlist.entryCount === 1 ? 'track' : 'tracks'}`}
          disabled={!handlers.onPressLocalPlaylist}
          onPress={bound(handlers.onPressLocalPlaylist, item.playlist)}
        />
      );
    case 'recent':
      return (
        <ShowRow
          fields={{
            ...showRowFields(item.entry.show),
            hasSoundboardSource: item.entry.source.isSoundboard,
          }}
          popularity={item.entry.show.popularity?.snapshot()}
          byline={item.entry.show.artist?.name}
          accessibilityRole="button"
          onPress={() => handlers.onPressRecent(item.entry)}
        />
      );
  }
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
