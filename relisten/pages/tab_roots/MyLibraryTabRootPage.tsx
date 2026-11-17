import { useAccount, useAccountScope } from '@/relisten/accounts/account_context';
import { AccountEntryCard } from '@/relisten/accounts/ui/account_entry_card';
import { accountPath } from '@/relisten/accounts/ui/account_routes';
import { useAccountSyncSummary } from '@/relisten/accounts/ui/sync_status';
import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import Plur from '@/relisten/components/plur';
import { RelistenText } from '@/relisten/components/relisten_text';
import { ShowCard } from '@/relisten/components/show_card';
import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { MyPlaylistsSection } from '@/relisten/playlists/ui/my_playlists_section';
import { useHistoryRecentlyPlayedShows } from '@/relisten/realm/models/history/playback_history_entry_repo';
import {
  useFavoriteCatalogUuids,
  useLibraryShowCatalogUuids,
  useRemainingDownloadsCount,
} from '@/relisten/realm/root_services';
import { logTabRootDebug } from '@/relisten/util/profile_logging';
import { useGroupSegment } from '@/relisten/util/routes';
import { MaterialIcons } from '@expo/vector-icons';
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';

/**
 * My Library answers two questions: what's mine (playlists I made, then the
 * shows and venues I saved) and what have I been listening to. The account is
 * a button in the header rather than a row in the content.
 */
export default function MyLibraryTabRootPage() {
  const scrollProps = usePlayerBottomScrollViewProps({});

  useEffect(() => {
    logTabRootDebug('myLibrary.page mount');
    return () => logTabRootDebug('myLibrary.page unmount');
  }, []);
  useFocusEffect(
    useCallback(() => {
      logTabRootDebug('myLibrary.page focus');
      return () => logTabRootDebug('myLibrary.page blur');
    }, [])
  );

  return (
    <>
      <AccountHeaderButton />
      <ScrollView {...scrollProps}>
        <View className="pt-2">
          <AccountEntryCard />
          <ActiveDownloads />
          <MyPlaylistsSection />
          <SavedCategories />
          <RecentListening />
        </View>
      </ScrollView>
    </>
  );
}

/** Outlined when signed out, filled when signed in, badged when sync needs attention. */
function AccountHeaderButton() {
  const router = useRouter();
  const { status } = useAccount();
  const { isAuthenticated } = useAccountScope();
  const summary = useAccountSyncSummary();
  const signedIn = status === 'signedIn' && isAuthenticated;
  const needsAttention = signedIn && summary.state === 'needsAttention';

  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button
        accessibilityLabel={
          needsAttention ? 'Account, needs attention' : signedIn ? 'Account' : 'Sign in'
        }
        icon={
          needsAttention
            ? nativeMenuIcons.accountNeedsAttention
            : signedIn
              ? nativeMenuIcons.accountSignedIn
              : nativeMenuIcons.account
        }
        onPress={() => router.push(accountPath('(myLibrary)'))}
      />
    </Stack.Toolbar>
  );
}

function ActiveDownloads() {
  const groupSegment = useGroupSegment();
  const downloadsCount = useRemainingDownloadsCount();

  if (downloadsCount === 0) {
    return null;
  }
  return (
    <Link href={{ pathname: `/relisten/tabs/${groupSegment}/downloading` }} asChild>
      <TouchableOpacity className="mb-4 bg-relisten-blue-700 px-4 py-4">
        <RelistenText className="text-center font-bold">
          <Plur count={downloadsCount} word="track" /> downloading&nbsp;›
        </RelistenText>
      </TouchableOpacity>
    </Link>
  );
}

/** What the listener has saved, one row per kind, each with its count. */
function SavedCategories() {
  const shows = useLibraryShowCatalogUuids();
  const venues = useFavoriteCatalogUuids('venue');

  return (
    <View className="mb-6 border-y border-white/10">
      <CategoryRow label="Shows" count={shows.size} pathname="/relisten/tabs/(myLibrary)/shows" />
      <View className="ml-4 h-px bg-white/10" />
      <CategoryRow
        label="Venues"
        count={venues.size}
        pathname="/relisten/tabs/(myLibrary)/venues"
      />
    </View>
  );
}

function CategoryRow({
  label,
  count,
  pathname,
}: {
  label: string;
  count: number;
  pathname: '/relisten/tabs/(myLibrary)/shows' | '/relisten/tabs/(myLibrary)/venues';
}) {
  return (
    <Link href={{ pathname }} asChild>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${count}`}
        className="min-h-[52px] flex-row items-center px-4"
      >
        <RelistenText className="flex-1 text-lg" selectable={false}>
          {label}
        </RelistenText>
        <RelistenText className="text-gray-400" selectable={false}>
          {count}
        </RelistenText>
        <MaterialIcons color="#9ca3af" name="chevron-right" size={22} />
      </TouchableOpacity>
    </Link>
  );
}

/** The shows played most recently, with the full history and statistics a tap away. */
function RecentListening() {
  const recentlyPlayedShows = useHistoryRecentlyPlayedShows();

  return (
    <View className="mb-4">
      <View className="flex-row items-center px-4 py-2">
        <RelistenText className="flex-1 text-m font-bold">Recent Listening</RelistenText>
        {recentlyPlayedShows.length > 0 && (
          <Link href={{ pathname: '/relisten/tabs/(myLibrary)/history/tracks' }} asChild>
            <TouchableOpacity accessibilityRole="button" hitSlop={8}>
              <RelistenText className="text-gray-400" selectable={false}>
                See All&nbsp;›
              </RelistenText>
            </TouchableOpacity>
          </Link>
        )}
      </View>

      {recentlyPlayedShows.length === 0 ? (
        <RelistenText className="px-4 pb-2 text-gray-400">
          Shows you play will show up here.
        </RelistenText>
      ) : (
        <View className="w-full flex-row flex-wrap px-2">
          {recentlyPlayedShows.map((show) => (
            <ShowCard
              show={show.show}
              key={show.show.uuid}
              sourceUuid={show.source.uuid}
              className="my-1 shrink basis-1/2"
            />
          ))}
        </View>
      )}

      <Link href={{ pathname: '/relisten/tabs/(myLibrary)/history/statistics' }} asChild>
        <TouchableOpacity
          accessibilityRole="button"
          className="mt-3 min-h-[52px] flex-row items-center border-y border-white/10 px-4"
        >
          <RelistenText className="flex-1 text-lg" selectable={false}>
            Listening Statistics
          </RelistenText>
          <MaterialIcons color="#9ca3af" name="chevron-right" size={22} />
        </TouchableOpacity>
      </Link>
    </View>
  );
}
