import { RelistenText } from '@/relisten/components/relisten_text';
import { useIsFavoritePlaylist, usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { playlistDisplayName } from '@/relisten/playlists/playlist_format';
import { Artist } from '@/relisten/realm/models/artist';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { useQuery } from '@/relisten/realm/schema';
import { useFavoriteCatalogUuids } from '@/relisten/realm/root_services';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { type ReactNode } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setLibrarySidebarOpen, useLibrarySidebarOpen } from './library_sidebar_state';

const RECENT_SHOW_COUNT = 8;
const PLAYLIST_COUNT = 6;
const FAVORITE_ARTIST_COUNT = 10;

export const LIBRARY_SIDEBAR_WIDTH = 260;
const COLLAPSED_SIDEBAR_WIDTH = 56;

/**
 * Quick ways back into the listener's own music in a wide window: shows they
 * played recently, their playlists, and their favorite artists. Each opens in
 * the My Library tab, which is where the full lists live. Collapsing leaves a
 * narrow strip with the button that brings it back.
 */
export function LibrarySidebar() {
  const open = useLibrarySidebarOpen();

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      className="border-r border-white/10"
      style={{
        width: open ? LIBRARY_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH,
        backgroundColor: RelistenBlue['950'],
      }}
    >
      <View className="h-12 flex-row items-center pl-1.5 pr-1">
        <TouchableOpacity
          accessibilityLabel={open ? 'Hide sidebar' : 'Show sidebar'}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="h-11 w-11 items-center justify-center"
          onPress={() => setLibrarySidebarOpen(!open)}
        >
          <MaterialCommunityIcons color="rgba(255, 255, 255, 0.8)" name="dock-left" size={22} />
        </TouchableOpacity>
        {open && (
          <RelistenText accessibilityRole="header" className="flex-1 text-lg font-bold">
            Library
          </RelistenText>
        )}
      </View>
      {open && (
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
          <RecentlyPlayedShows />
          <SidebarPlaylists />
          <FavoriteArtists />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RecentlyPlayedShows() {
  const entries = useHistoryRecentlyPlayedShows(RECENT_SHOW_COUNT);

  if (entries.length === 0) {
    return null;
  }

  return (
    <SidebarSection title="Recently Played">
      {entries.map((entry) => (
        <SidebarRow
          key={entry.show.uuid}
          title={entry.show.displayDate}
          subtitle={[entry.artist.name, entry.show.venue?.name].filter(Boolean).join(' · ')}
          href={{
            pathname:
              '/relisten/tabs/(myLibrary)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
            params: {
              artistUuid: entry.artist.uuid,
              showUuid: entry.show.uuid,
              sourceUuid: entry.source.uuid,
            },
          }}
        />
      ))}
    </SidebarSection>
  );
}

/** Favorites first, then the most recently edited, as on My Library. */
function SidebarPlaylists() {
  const playlists = usePlaylists();
  const isFavorite = useIsFavoritePlaylist();
  const preview = [
    ...playlists.filter((playlist) => isFavorite(playlist)),
    ...playlists.filter((playlist) => !isFavorite(playlist)),
  ].slice(0, PLAYLIST_COUNT);

  if (preview.length === 0) {
    return null;
  }

  return (
    <SidebarSection title="Playlists">
      {preview.map((playlist) => (
        <SidebarRow
          key={playlist.playlistId}
          title={playlistDisplayName(playlist)}
          href={{
            pathname: '/relisten/tabs/(myLibrary)/playlists/[playlistId]',
            params: { playlistId: playlist.playlistId },
          }}
        />
      ))}
      {playlists.length > PLAYLIST_COUNT && (
        <SidebarRow
          title={`All ${playlists.length} Playlists`}
          muted
          href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }}
        />
      )}
    </SidebarSection>
  );
}

function FavoriteArtists() {
  const artistUuids = useFavoriteCatalogUuids('artist');
  const artists = useQuery(
    Artist,
    (rows) => rows.filtered('uuid IN $0', [...artistUuids]).sorted('sortName'),
    [artistUuids]
  );

  if (artists.length === 0) {
    return null;
  }

  return (
    <SidebarSection title="Favorite Artists">
      {artists.slice(0, FAVORITE_ARTIST_COUNT).map((artist) => (
        <SidebarRow
          key={artist.uuid}
          title={artist.name}
          href={{
            pathname: '/relisten/tabs/(myLibrary)/[artistUuid]',
            params: { artistUuid: artist.uuid },
          }}
        />
      ))}
    </SidebarSection>
  );
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mt-3">
      <RelistenText className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </RelistenText>
      {children}
    </View>
  );
}

function SidebarRow({
  title,
  subtitle,
  href,
  muted = false,
}: {
  title: string;
  subtitle?: string;
  href: Href;
  muted?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="link"
      className="mx-2 min-h-[44px] justify-center rounded-lg px-2 py-1.5"
      onPress={() => router.push(href)}
    >
      <RelistenText
        className={muted ? 'text-sm text-gray-300' : 'text-[15px] font-semibold'}
        numberOfLines={1}
      >
        {title}
      </RelistenText>
      {subtitle ? (
        <RelistenText className="text-xs text-gray-400" numberOfLines={1}>
          {subtitle}
        </RelistenText>
      ) : null}
    </TouchableOpacity>
  );
}
