import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { MaterialIcons } from '@expo/vector-icons';
import React, { PropsWithChildren, useCallback, useContext, useState } from 'react';
import {
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScrubberRow } from './player_screen';
import * as Progress from 'react-native-progress';
import AirPlayButton from 'react-native-airplay-button';
import { RelistenCastButton, useRelistenCastStatus } from '@/relisten/casting/cast_ui';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { usePlayerSheetControls } from './player_sheet_state';

const COLLAPSED_CARD_HORIZONTAL_MARGIN = 12;
const COLLAPSED_CARD_BOTTOM_MARGIN = 8;

function OfflineBanner() {
  return (
    <View className="bg-red-800 flex flex-row justify-center items-center p-1.5">
      <MaterialIcons name="cloud-off" size={20} color={'white'} style={{ marginRight: 4 }} />
      <RelistenText>Offline. You can stream downloaded tracks</RelistenText>
    </View>
  );
}

function PlayerBottomBarContents() {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();
  const player = useRelistenPlayer();
  const { expand } = usePlayerSheetControls();
  const { isCasting, deviceName } = useRelistenCastStatus();

  const artist = currentTrack?.sourceTrack?.artist;
  const showCache = currentTrack?.sourceTrack?.show;

  const subtitle = [
    artist?.name,
    showCache?.displayDate,
    showCache?.venue?.name,
    showCache?.venue?.location,
  ]
    .filter((x) => !!x && x.length > 0)
    .join(' · ');

  if (!currentTrack) {
    return <></>;
  }

  let playbackStateIcon = <MaterialIcons name="play-arrow" size={42} color="white" />;

  if (playbackState == RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons name="pause" size={42} color="white" />;
  } else if (playbackState == RelistenPlaybackState.Stalled) {
    playbackStateIcon = <Progress.CircleSnail indeterminate={true} size={28} color="white" />;
  }

  const track = currentTrack.sourceTrack;

  return (
    <Flex column cn="flex-1 gap-3">
      <Flex cn="items-center">
        <Pressable onPress={expand} className="flex-1">
          <Flex cn="items-center">
            <Flex cn="ml-2 h-full items-center">
              <TouchableOpacity
                onPress={() => {
                  player.togglePauseResume();
                }}
                className="flex h-[42px] w-[42px] items-center justify-center"
              >
                {playbackStateIcon}
              </TouchableOpacity>
            </Flex>
            <Flex column cn="ml-4 truncate flex-1">
              <RelistenText className="text-lg font-semibold">{track?.title ?? ''}</RelistenText>
              <RelistenText className="truncate" numberOfLines={1}>
                {subtitle ?? ''}
              </RelistenText>
              {isCasting && (
                <RelistenText className="text-xs text-gray-300" numberOfLines={1}>
                  Casting{deviceName ? ` to ${deviceName}` : ''}
                </RelistenText>
              )}
            </Flex>
          </Flex>
        </Pressable>
        <Flex cn="items-center">
          {Platform.OS === 'ios' && (
            <AirPlayButton
              activeTintColor="white"
              tintColor="rgba(255, 255, 255, 0.5)"
              prioritizesVideoDevices={false}
              className="mx-2 h-[42] w-[42]"
            />
          )}
          <RelistenCastButton tintColor="rgba(255, 255, 255, 0.7)" className="mr-2 h-[42] w-[42]" />
        </Flex>
      </Flex>
      <View className="relative bg-relisten-blue-700">
        <ScrubberRow />
      </View>
    </Flex>
  );
}

export function PlayerBottomBar() {
  const isOnline = useShouldMakeNetworkRequests();
  const { tabBarHeight, playerBottomBarHeight, setPlayerBottomBarHeight } =
    useRelistenPlayerBottomBarContext();

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { height } = e.nativeEvent.layout;
      if (playerBottomBarHeight != height) {
        setPlayerBottomBarHeight(height);
      }
    },
    [playerBottomBarHeight, setPlayerBottomBarHeight]
  );

  const isVisible = useIsPlayerBottomBarVisible();

  if (!isVisible) {
    return <></>;
  }

  return (
    <View
      onLayout={onLayout}
      style={[
        styles.container,
        {
          bottom: tabBarHeight + COLLAPSED_CARD_BOTTOM_MARGIN,
        },
      ]}
    >
      <View style={styles.surfaceShadow}>
        <View style={styles.surface}>
          {!isOnline && <OfflineBanner />}
          <View className="w-full border-t-2 border-t-relisten-blue-700 bg-relisten-blue-800 pt-2">
            <PlayerBottomBarContents />
          </View>
        </View>
      </View>
    </View>
  );
}

export const useIsPlayerBottomBarVisible = () => {
  const playbackState = useRelistenPlayerPlaybackState();
  const tracks = useRelistenPlayerQueueOrderedTracks();
  const isDesktopLayout = useIsDesktopLayout();

  return !isDesktopLayout && playbackState !== undefined && tracks.length > 0;
};

export interface RelistenPlayerBottomBarContextProps {
  tabBarHeight: number;
  playerBottomBarHeight: number;
  collapsedSheetFootprint: number;

  setTabBarHeight: (num: number) => void;
  setPlayerBottomBarHeight: (num: number) => void;
}

const DEFAULT_TAB_BAR_HEIGHT = 44;
const DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT = 64;

const DEFAULT_CONTEXT_VALUE: RelistenPlayerBottomBarContextProps = {
  tabBarHeight: DEFAULT_TAB_BAR_HEIGHT,
  playerBottomBarHeight: DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT,
  collapsedSheetFootprint: DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT + COLLAPSED_CARD_BOTTOM_MARGIN,

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setTabBarHeight: (num: number) => {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setPlayerBottomBarHeight: (num: number) => {},
};

export const RelistenPlayerBottomBarContext =
  React.createContext<RelistenPlayerBottomBarContextProps>(DEFAULT_CONTEXT_VALUE);

export const RelistenPlayerBottomBarProvider = ({ children }: PropsWithChildren<object>) => {
  const [tabBarHeight, setTabBarHeight] = useState(DEFAULT_TAB_BAR_HEIGHT);
  const [playerBottomBarHeight, setPlayerBottomBarHeight] = useState(
    DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT
  );
  const isPlayerBottomBarVisible = useIsPlayerBottomBarVisible();

  return (
    <RelistenPlayerBottomBarContext.Provider
      value={{
        tabBarHeight,
        playerBottomBarHeight: isPlayerBottomBarVisible ? playerBottomBarHeight : 0,
        collapsedSheetFootprint: isPlayerBottomBarVisible
          ? playerBottomBarHeight + COLLAPSED_CARD_BOTTOM_MARGIN
          : 0,
        setTabBarHeight,
        setPlayerBottomBarHeight,
      }}
    >
      {children}
    </RelistenPlayerBottomBarContext.Provider>
  );
};
export const useRelistenPlayerBottomBarContext = () => {
  const context = useContext(RelistenPlayerBottomBarContext);

  if (context === undefined) {
    throw new Error('useRelistenPlayer must be used within a RelistenPlayerProvider');
  }

  return context;
};

const styles = StyleSheet.create({
  container: {
    left: COLLAPSED_CARD_HORIZONTAL_MARGIN,
    position: 'absolute',
    right: COLLAPSED_CARD_HORIZONTAL_MARGIN,
  },
  surface: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  surfaceShadow: {
    borderRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
});
