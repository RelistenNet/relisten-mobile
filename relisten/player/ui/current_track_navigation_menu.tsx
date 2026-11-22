import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import {
  NativeMenuView,
  type MenuAction,
  type MenuComponentRef,
  type NativeActionEvent,
} from '@/relisten/components/menus/native_menu_view';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { type RelistenTabGroupSegment, useGroupSegment } from '@/relisten/util/routes';
import { showVenueName, showVenueRoute } from '@/relisten/util/venue_route';
import { router, useSegments } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import type { GoToSongActionId } from './track_songs';
import { goToShowTitle, useGoToShow, useGoToSong, useLeaveScreen } from './track_navigation';

const ACTION_IDS = {
  artist: 'artist',
  show: 'show',
  venue: 'venue',
} as const;

export type CurrentTrackNavigationActionId =
  | (typeof ACTION_IDS)[keyof typeof ACTION_IDS]
  | GoToSongActionId;

const TAB_GROUP_SEGMENTS: readonly string[] = ['(artists)', '(myLibrary)', '(offline)'];

/**
 * The tab showing under the player. The player renders as part of the Artists
 * tab, but its venue link has to stay in the tab that is showing: from My
 * Library, `(artists)/venue/<id>` also matches My Library's
 * `[artistUuid]/venue/[venueUuid]`, which then opens with "(artists)" as the
 * artist.
 */
function useShowingTab(): RelistenTabGroupSegment {
  const segments: string[] = useSegments();
  const tab = segments.find((segment) => TAB_GROUP_SEGMENTS.includes(segment));
  return (tab as RelistenTabGroupSegment | undefined) ?? '(artists)';
}

/**
 * Go-to actions for the playing track: its artist, show, venue, and songs. They all
 * leave the screen through `useLeaveScreen`, so inside the player they close
 * it first.
 */
export function useCurrentTrackNavigation() {
  const sourceTrack = useRelistenPlayerCurrentTrack()?.sourceTrack;
  const groupSegment = useGroupSegment();
  const showingTab = useShowingTab();
  const leaveScreen = useLeaveScreen();
  const goToShow = useGoToShow();
  const { actions: songActions, handleAction: handleSongAction } = useGoToSong(sourceTrack);

  const artist = sourceTrack?.artist;
  const show = sourceTrack?.show;
  const venueName = show && showVenueName(show);
  const venueRoute = useMemo(
    () => (show ? showVenueRoute(show, showingTab) : undefined),
    [show, showingTab]
  );

  const actions = useMemo<MenuAction[]>(
    () =>
      sourceTrack && artist && show
        ? [
            {
              id: ACTION_IDS.artist,
              image: nativeMenuIcons.artist,
              title: `Go to ${artist.name}`,
            },
            { id: ACTION_IDS.show, image: nativeMenuIcons.show, title: goToShowTitle(sourceTrack) },
            ...(venueName && venueRoute
              ? [
                  {
                    id: ACTION_IDS.venue,
                    image: nativeMenuIcons.venue,
                    title: `Go to ${venueName}`,
                  },
                ]
              : []),
            ...songActions,
          ]
        : [],
    [artist, show, songActions, sourceTrack, venueName, venueRoute]
  );

  const handleAction = useCallback(
    (actionId: CurrentTrackNavigationActionId) => {
      if (!sourceTrack || !artist || handleSongAction(actionId)) {
        return;
      }

      if (actionId === ACTION_IDS.show) {
        goToShow(sourceTrack);
      } else if (actionId === ACTION_IDS.artist) {
        leaveScreen(() =>
          router.push({
            pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
            params: { artistUuid: artist.uuid },
          })
        );
      } else if (actionId === ACTION_IDS.venue && venueRoute) {
        leaveScreen(() => router.push(venueRoute));
      }
    },
    [artist, goToShow, groupSegment, handleSongAction, leaveScreen, sourceTrack, venueRoute]
  );

  return { actions, handleAction };
}

/**
 * Opens the playing track's Go To actions on a tap, so the title, artist and
 * venue lead where the More menu's Go To section does.
 */
export function CurrentTrackNavigationMenu({ children }: { children: ReactNode }) {
  const { actions, handleAction } = useCurrentTrackNavigation();
  const androidMenuRef = useRef<MenuComponentRef>(null);

  if (actions.length === 0) {
    return children;
  }

  // The native menu reports back the ids of `actions`.
  const onPressAction = ({ nativeEvent }: NativeActionEvent) =>
    handleAction(nativeEvent.event as CurrentTrackNavigationActionId);

  if (Platform.OS === 'android') {
    // Android's menu sizes its trigger to fit the contents, so the title could
    // not wrap inside it. The text stays outside and opens a menu anchored
    // under it.
    return (
      <View>
        <Pressable accessible={false} onPress={() => androidMenuRef.current?.show()}>
          {children}
        </Pressable>
        <NativeMenuView
          ref={androidMenuRef}
          actions={actions}
          onPressAction={onPressAction}
          style={{ position: 'absolute', left: 0, bottom: 0 }}
        >
          <View style={{ width: 1, height: 1 }} />
        </NativeMenuView>
      </View>
    );
  }

  return (
    <NativeMenuView actions={actions} onPressAction={onPressAction} shouldOpenOnLongPress={false}>
      {children}
    </NativeMenuView>
  );
}
