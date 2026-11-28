import { ListRow } from '@/relisten/components/list_row';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { SubtitleText } from '@/relisten/components/row_subtitle';
import { SectionHeader } from '@/relisten/components/section_header';
import { Show } from '@/relisten/realm/models/show';
import { useQuery } from '@/relisten/realm/schema';
import plur from 'plur';
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
          <FavoriteCategories />
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

/** The listener's favorites, one row per kind, its count in the subtitle. */
function FavoriteCategories() {
  const showUuids = useLibraryShowCatalogUuids();
  const venues = useFavoriteCatalogUuids('venue');
  const shows = useQuery(Show, (rows) => rows.filtered('uuid IN $0', [...showUuids]), [showUuids]);
  const artistCount = new Set(shows.map((show) => show.artistUuid)).size;

  return (
    <View>
      <SectionHeader title="Favorites" />
      <Link href={{ pathname: '/relisten/tabs/(myLibrary)/shows' }} asChild>
        <ListRow
          title="Shows"
          subtitle={[
            `${showUuids.size} ${plur('show', showUuids.size)}`,
            artistCount > 0 ? `${artistCount} ${plur('artist', artistCount)}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      </Link>
      <ItemSeparator />
      <Link href={{ pathname: '/relisten/tabs/(myLibrary)/venues' }} asChild>
        <ListRow title="Venues" subtitle={`${venues.size} ${plur('venue', venues.size)}`} />
      </Link>
    </View>
  );
}

/** The shows played most recently, with the full history and statistics a tap away. */
function RecentListening() {
  const recentlyPlayedShows = useHistoryRecentlyPlayedShows();

  return (
    <View>
      <SectionHeader className="flex-row items-center">
        <RelistenText className="flex-1 text-m font-bold">Recent Listening</RelistenText>
        {recentlyPlayedShows.length > 0 && (
          <Link href={{ pathname: '/relisten/tabs/(myLibrary)/history/tracks' }} asChild>
            <TouchableOpacity accessibilityRole="button" hitSlop={8}>
              <RelistenText className="font-semibold text-gray-300" selectable={false}>
                See All&nbsp;›
              </RelistenText>
            </TouchableOpacity>
          </Link>
        )}
      </SectionHeader>

      {recentlyPlayedShows.length === 0 ? (
        <SubtitleText className="px-4 py-3">Shows you play will show up here.</SubtitleText>
      ) : (
        <View className="w-full flex-row flex-wrap px-2 pt-2">
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

      <View className="mt-2">
        <ItemSeparator />
      </View>
      <Link href={{ pathname: '/relisten/tabs/(myLibrary)/history/statistics' }} asChild>
        <ListRow title="Listening Statistics" subtitle="Your top artists, shows and songs" />
      </Link>
    </View>
  );
}
