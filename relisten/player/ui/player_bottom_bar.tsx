import { LayoutChangeEvent, Pressable, TouchableOpacity, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import React, { PropsWithChildren, useCallback, useContext, useState } from 'react';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import Flex from '@/relisten/components/flex';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { MaterialIcons } from '@expo/vector-icons';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { useRouter } from 'expo-router';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import { ProgressView } from '@react-native-community/progress-view';
import { useObject } from '@/relisten/realm/schema';
import { Show } from '@/relisten/realm/models/show';

import { NetworkBackedBehaviorFetchStrategy } from '@/relisten/realm/network_backed_behavior';

function PlayerBottomBarContents() {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();
  const player = useRelistenPlayer();
  const progress = useNativePlaybackProgress();

  const artist = useArtist(currentTrack?.sourceTrack?.artistUuid);
  const showCache = useObject(Show, currentTrack?.sourceTrack?.showUuid || '');

  const subtitle = [
    artist?.data?.name,
    showCache?.displayDate,
    showCache?.venue?.name,
    showCache?.venue?.location,
  ]
    .filter((x) => !!x && x.length > 0)
    .join(' · ');

  if (!currentTrack) {
    return <></>;
  }

  const track = currentTrack.sourceTrack;

  return (
    <Flex column cn="flex-1">
      <Flex cn="items-center">
        <Flex cn="ml-2 h-full items-center">
          <TouchableOpacity
            onPress={() => {
              player.togglePauseResume();
            }}
          >
            {playbackState === RelistenPlaybackState.Playing ? (
              <MaterialIcons name="pause" size={42} color="white" />
            ) : (
              <MaterialIcons name="play-arrow" size={42} color="white" />
            )}
          </TouchableOpacity>
        </Flex>
        <Flex column cn="ml-4 truncate flex-1">
          <RelistenText className="text-lg font-semibold">{track?.title ?? ''}</RelistenText>
          <RelistenText className="truncate" numberOfLines={1}>
            {subtitle ?? ''}
          </RelistenText>
        </Flex>
      </Flex>
      <ProgressView
        progress={progress?.percent ?? 0}
        progressTintColor="white"
        style={{ width: '100%', height: 4, marginTop: 8 }}
      />
    </Flex>
  );
}

export function PlayerBottomBar() {
  const { tabBarHeight, playerBottomBarHeight, setPlayerBottomBarHeight } =
    useRelistenPlayerBottomBarContext();
  const router = useRouter();

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
    <View onLayout={onLayout} style={{ bottom: tabBarHeight, position: 'absolute', width: '100%' }}>
      <View className={'w-full flex-1 p-0'}>
        <Pressable onPress={() => router.push('/relisten/player')}>
          <View className="w-full rounded-t-sm bg-relisten-blue-800 pt-2">
            <PlayerBottomBarContents />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export const useIsPlayerBottomBarVisible = () => {
  const playbackState = useRelistenPlayerPlaybackState();

  return playbackState !== undefined && playbackState !== RelistenPlaybackState.Stopped;
};

export interface RelistenPlayerBottomBarContextProps {
  tabBarHeight: number;
  playerBottomBarHeight: number;

  setTabBarHeight: (num: number) => void;
  setPlayerBottomBarHeight: (num: number) => void;
}

const DEFAULT_TAB_BAR_HEIGHT = 44;
const DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT = 64;

const DEFAULT_CONTEXT_VALUE: RelistenPlayerBottomBarContextProps = {
  tabBarHeight: DEFAULT_TAB_BAR_HEIGHT,
  playerBottomBarHeight: DEFAULT_PLAYER_BOTTOM_BAR_HEIGHT,

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
