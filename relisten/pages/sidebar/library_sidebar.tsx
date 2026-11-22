import { useAccount, useAccountScope } from '@/relisten/accounts/account_context';
import { accountPath, openSignInSheet } from '@/relisten/accounts/ui/account_routes';
import { useAccountSyncSummary } from '@/relisten/accounts/ui/sync_status';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useIsFavoritePlaylist, usePlaylists } from '@/relisten/playlists/playlist_hooks';
import { playlistDisplayName } from '@/relisten/playlists/playlist_format';
import { openNewPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { Artist } from '@/relisten/realm/models/artist';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import { useQuery } from '@/relisten/realm/schema';
import {
  useFavoriteCatalogUuids,
  useRemainingDownloadsCount,
} from '@/relisten/realm/root_services';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { SidePane } from '@/relisten/util/side_pane';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { type Href, router, usePathname } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { setLibrarySidebarOpen, useLibrarySidebarOpen } from './library_sidebar_state';

export const LIBRARY_SIDEBAR_WIDTH = 260;
const COLLAPSED_SIDEBAR_WIDTH = 56;

const RECENT_SHOW_COUNT = 6;
const PLAYLIST_COUNT = 6;
const FAVORITE_ARTIST_COUNT = 8;

/**
 * Quick ways into the listener's own music in a wide window, top to bottom:
 * their account, active downloads, playlists, favorite artists, and shows they
 * played recently. Every section stays in place when empty and says how to
 * fill it. Rows open in the My Library tab, where the full lists live.
 *
 * Collapsing slides it down to a strip that keeps only the button that
 * brings it back.
 */
export function LibrarySidebar() {
  const open = useLibrarySidebarOpen();
  const contentOpacity = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    contentOpacity.set(withTiming(open ? 1 : 0, { duration: 160 }));
  }, [contentOpacity, open]);

  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const collapsedStyle = useAnimatedStyle(() => ({ opacity: 1 - contentOpacity.value }));

  return (
    <SidePane
      edge="leading"
      open={open}
      openWidth={LIBRARY_SIDEBAR_WIDTH}
      closedWidth={COLLAPSED_SIDEBAR_WIDTH}
    >
      <SafeAreaView
        edges={['top', 'bottom', 'left']}
        className="flex-1 border-r border-white/10"
        style={{ backgroundColor: RelistenBlue['950'] }}
      >
        <View className="h-12 flex-row items-center pl-1.5 pr-1">
          <TouchableOpacity
            accessibilityLabel={open ? 'Hide sidebar' : 'Show sidebar'}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            className={
              open
                ? 'h-11 w-11 items-center justify-center rounded-lg'
                : 'h-11 w-11 items-center justify-center rounded-lg bg-white/10'
            }
            onPress={() => setLibrarySidebarOpen(!open)}
          >
            <MaterialCommunityIcons color="rgba(255, 255, 255, 0.8)" name="dock-left" size={22} />
          </TouchableOpacity>
          <Animated.View style={contentStyle} className="flex-1">
            <RelistenText accessibilityRole="header" className="text-lg font-bold">
              Library
            </RelistenText>
          </Animated.View>
        </View>
        {/* The open list and the collapsed icons share this area and cross-fade. */}
        <View className="flex-1">
          <Animated.View
            style={contentStyle}
            className="flex-1"
            pointerEvents={open ? 'auto' : 'none'}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          >
            <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
              <AccountRow />
              <ActiveDownloadsRow />
              <SidebarPlaylists />
              <FavoriteArtists />
              <RecentlyPlayedShows />
            </ScrollView>
          </Animated.View>
          <Animated.View
            style={[
              collapsedStyle,
              { position: 'absolute', left: 0, top: 0, width: COLLAPSED_SIDEBAR_WIDTH },
            ]}
            pointerEvents={open ? 'none' : 'auto'}
            accessibilityElementsHidden={open}
            importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
          >
            <CollapsedSectionIcons />
          </Animated.View>
        </View>
      </SafeAreaView>
    </SidePane>
  );
}

const COLLAPSED_SECTIONS = [
  { icon: 'account-circle', label: 'Account' },
  { icon: 'playlist-music', label: 'Playlists' },
  { icon: 'heart-outline', label: 'Favorite Artists' },
  { icon: 'history', label: 'Recently Played' },
] as const;

/**
 * The collapsed strip shows one icon per section so it still reads as the
 * library; any of them opens the sidebar.
 */
function CollapsedSectionIcons() {
  return (
    <View className="items-center pt-2" style={{ gap: 4 }}>
      {COLLAPSED_SECTIONS.map((section) => (
        <TouchableOpacity
          key={section.label}
          accessibilityLabel={`Show sidebar: ${section.label}`}
          accessibilityRole="button"
          className="h-11 w-11 items-center justify-center rounded-lg"
          onPress={() => setLibrarySidebarOpen(true)}
        >
          <MaterialCommunityIcons color="rgba(255, 255, 255, 0.7)" name={section.icon} size={22} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Signed in, the username opens the account; signed out, an offer to sign in. */
function AccountRow() {
  const { status, profile } = useAccount();
  const { isAuthenticated } = useAccountScope();
  const summary = useAccountSyncSummary();
  const pathname = usePathname();

  if (status === 'signedIn' && isAuthenticated) {
    const needsAttention = summary.state === 'needsAttention';

    return (
      <SidebarRow
        icon="account-circle"
        title={profile ? `@${profile.username}` : 'Account'}
        subtitle={needsAttention ? summary.label : undefined}
        subtitleClassName={needsAttention ? summary.textClassName : undefined}
        selected={pathname.endsWith('/account')}
        onPress={() => router.push(accountPath('(myLibrary)'))}
      />
    );
  }

  if (status === 'restoring') {
    return null;
  }

  return (
    <View className="mx-3 mb-1 mt-1 rounded-lg border border-white/10 bg-relisten-blue-900 p-3">
      <RelistenText className="text-sm font-semibold">Keep your library safe</RelistenText>
      <RelistenText className="mt-0.5 text-xs text-gray-400">
        Sign in to sync favorites and playlists across your devices.
      </RelistenText>
      <TouchableOpacity
        accessibilityRole="button"
        className="mt-2 self-start rounded-md bg-relisten-blue-700 px-3 py-1.5"
        onPress={() => openSignInSheet(router)}
      >
        <RelistenText className="text-sm font-semibold">Sign In</RelistenText>
      </TouchableOpacity>
    </View>
  );
}

function ActiveDownloadsRow() {
  const downloadsCount = useRemainingDownloadsCount();
  const pathname = usePathname();

  if (downloadsCount === 0) {
    return null;
  }

  return (
    <SidebarRow
      icon="download"
      title={`Downloading ${downloadsCount} ${downloadsCount === 1 ? 'track' : 'tracks'}`}
      selected={pathname.endsWith('/downloading')}
      href={{ pathname: '/relisten/tabs/(myLibrary)/downloading' }}
    />
  );
}

/** Favorites first, then the most recently edited, as on My Library. */
function SidebarPlaylists() {
  const playlists = usePlaylists();
  const isFavorite = useIsFavoritePlaylist();
  const pathname = usePathname();
  const preview = [
    ...playlists.filter((playlist) => isFavorite(playlist)),
    ...playlists.filter((playlist) => !isFavorite(playlist)),
  ].slice(0, PLAYLIST_COUNT);

  return (
    <SidebarSection
      title="Playlists"
      action={
        <TouchableOpacity
          accessibilityLabel="New Playlist"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center"
          onPress={() => openNewPlaylist(router)}
        >
          <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      }
    >
      {preview.length === 0 ? (
        <>
          <SidebarRow
            icon="playlist-plus"
            title="New Playlist"
            onPress={() => openNewPlaylist(router)}
          />
          <SidebarHint>Or add songs from any show’s ••• menu.</SidebarHint>
        </>
      ) : (
        preview.map((playlist) => (
          <SidebarRow
            key={playlist.playlistId}
            title={playlistDisplayName(playlist)}
            selected={pathname.endsWith(`/playlists/${playlist.playlistId}`)}
            href={{
              pathname: '/relisten/tabs/(myLibrary)/playlists/[playlistId]',
              params: { playlistId: playlist.playlistId },
            }}
          />
        ))
      )}
      {playlists.length > PLAYLIST_COUNT && (
        <SidebarRow
          title={`All ${playlists.length} Playlists`}
          muted
          selected={pathname.endsWith('/playlists')}
          href={{ pathname: '/relisten/tabs/(myLibrary)/playlists' }}
        />
      )}
    </SidebarSection>
  );
}

function FavoriteArtists() {
  const artistUuids = useFavoriteCatalogUuids('artist');
  const pathname = usePathname();
  const artists = useQuery(
    Artist,
    (rows) => rows.filtered('uuid IN $0', [...artistUuids]).sorted('sortName'),
    [artistUuids]
  );

  return (
    <SidebarSection title="Favorite Artists">
      {artists.length === 0 ? (
        <>
          <SidebarHint>Tap ♥ on an artist to keep them here.</SidebarHint>
          <SidebarRow
            icon="account-music"
            title="Browse Artists"
            muted
            href={{ pathname: '/relisten/tabs/(artists)/all' }}
          />
        </>
      ) : (
        artists.slice(0, FAVORITE_ARTIST_COUNT).map((artist) => (
          <SidebarRow
            key={artist.uuid}
            title={artist.name}
            selected={pathname === `/relisten/tabs/${artist.uuid}`}
            href={{
              pathname: '/relisten/tabs/(myLibrary)/[artistUuid]',
              params: { artistUuid: artist.uuid },
            }}
          />
        ))
      )}
      {artists.length > FAVORITE_ARTIST_COUNT && (
        <SidebarRow
          title={`All ${artists.length} Favorites`}
          muted
          href={{ pathname: '/relisten/tabs/(artists)' }}
        />
      )}
    </SidebarSection>
  );
}

function RecentlyPlayedShows() {
  const entries = useHistoryRecentlyPlayedShows(RECENT_SHOW_COUNT);
  const pathname = usePathname();

  return (
    <SidebarSection title="Recently Played">
      {entries.length === 0 ? (
        <SidebarHint>Shows you play will show up here.</SidebarHint>
      ) : (
        <>
          {entries.map((entry) => (
            <SidebarRow
              key={entry.show.uuid}
              title={entry.show.displayDate}
              subtitle={[entry.artist.name, entry.show.venue?.name].filter(Boolean).join(' · ')}
              selected={pathname.includes(`/show/${entry.show.uuid}`)}
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
          <SidebarRow
            title="Listening History"
            muted
            selected={pathname.endsWith('/history/tracks')}
            href={{ pathname: '/relisten/tabs/(myLibrary)/history/tracks' }}
          />
        </>
      )}
    </SidebarSection>
  );
}

function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="mt-4">
      <View className="min-h-[32px] flex-row items-center pl-4 pr-2">
        <RelistenText className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
          {title}
        </RelistenText>
        {action}
      </View>
      {children}
    </View>
  );
}

function SidebarHint({ children }: { children: ReactNode }) {
  return <RelistenText className="px-4 py-1 text-xs text-gray-400">{children}</RelistenText>;
}

function SidebarRow({
  title,
  subtitle,
  subtitleClassName,
  icon,
  href,
  onPress,
  muted = false,
  selected = false,
}: {
  title: string;
  subtitle?: string;
  subtitleClassName?: string;
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  muted?: boolean;
  /** The row for the screen showing now, which the sidebar highlights. */
  selected?: boolean;
} & ({ href: Href; onPress?: never } | { href?: never; onPress: () => void })) {
  return (
    <TouchableOpacity
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityState={{ selected }}
      className={
        selected
          ? 'mx-2 min-h-[44px] flex-row items-center rounded-lg bg-relisten-blue-800 px-2 py-1.5'
          : 'mx-2 min-h-[44px] flex-row items-center rounded-lg px-2 py-1.5'
      }
      onPress={() => (href ? router.push(href) : onPress?.())}
    >
      {icon && (
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color="rgba(255, 255, 255, 0.75)"
          style={{ marginRight: 10 }}
        />
      )}
      <View className="min-w-0 flex-1">
        <RelistenText
          className={muted ? 'text-sm text-gray-300' : 'text-[15px] font-semibold'}
          numberOfLines={1}
        >
          {title}
        </RelistenText>
        {subtitle ? (
          <RelistenText className={subtitleClassName ?? 'text-xs text-gray-400'} numberOfLines={1}>
            {subtitle}
          </RelistenText>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}
