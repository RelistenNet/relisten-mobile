import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import Flex from '@/relisten/components/flex';
import { RelistenText } from '@/relisten/components/relisten_text';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerCurrentTrack } from '@/relisten/player/relisten_player_queue_hooks';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
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
import {
  useIsPlayerBottomBarVisible,
  PlayerBarPlacementBackend,
  usePlayerBarPlacementOffset,
  useRelistenPlayerBottomBarContext,
} from './player_bar_layout';

function OfflineBanner() {
  return (
    <View className="flex flex-row items-center justify-center bg-red-900/85 px-3 py-2">
      <MaterialIcons name="cloud-off" size={20} color={'white'} style={{ marginRight: 4 }} />
      <RelistenText className="text-sm text-white">
        Offline. You can stream downloaded tracks
      </RelistenText>
    </View>
  );
}

interface PlayerBottomBarContentsProps {
  placementBackend: PlayerBarPlacementBackend;
}

function PlayerBottomBarProgress({
  placementBackend,
}: {
  placementBackend: PlayerBarPlacementBackend;
}) {
  const progress = useNativePlaybackProgress();
  const percent =
    progress?.duration && progress.duration > 0
      ? Math.max(0, Math.min(1, progress.elapsed / progress.duration))
      : 0;

  if (placementBackend === 'nativeTabsAccessory') {
    return (
      <View style={styles.accessoryProgressTrack}>
        <View style={[styles.accessoryProgressFill, { width: `${percent * 100}%` }]} />
      </View>
    );
  }

  return (
    <View style={styles.scrubberShell}>
      <ScrubberRow showTimes={false} />
    </View>
  );
}

function PlayerBottomBarContents({ placementBackend }: PlayerBottomBarContentsProps) {
  const currentTrack = useRelistenPlayerCurrentTrack();
  const playbackState = useRelistenPlayerPlaybackState();
  const player = useRelistenPlayer();
  const router = useRouter();
  const { isCasting, deviceName } = useRelistenCastStatus();
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  if (!currentTrack) {
    return <></>;
  }

  const track = currentTrack.sourceTrack;
  const isAccessory = placementBackend === 'nativeTabsAccessory';
  const playbackIconSize = isAccessory ? 26 : 30;
  const utilityIconClassName = isAccessory ? 'h-[18] w-[18]' : 'h-[20] w-[20]';
  const rootContainerCn = isAccessory ? '' : 'flex-1';
  const headerRowCn = isAccessory ? 'min-h-[38px] items-center' : 'items-center';
  const titleClassName = isAccessory
    ? 'text-[15px] font-semibold text-white'
    : 'text-base font-semibold text-white';
  const subtitleClassName = isAccessory ? 'text-xs text-slate-200' : 'text-sm text-slate-200';
  const castingClassName = isAccessory ? 'text-[11px] text-slate-300' : 'text-xs text-slate-300';
  const transportButtonStyle = isAccessory
    ? styles.transportButtonAccessory
    : styles.transportButton;
  const utilityButtonShellStyle = isAccessory
    ? styles.utilityButtonShellAccessory
    : styles.utilityButtonShell;

  let playbackStateIcon = <MaterialIcons name="play-arrow" size={playbackIconSize} color="white" />;

  if (playbackState == RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons name="pause" size={playbackIconSize} color="white" />;
  } else if (playbackState == RelistenPlaybackState.Stalled) {
    playbackStateIcon = (
      <Progress.CircleSnail indeterminate={true} size={isAccessory ? 22 : 28} color="white" />
    );
  }

  return (
    <Flex column cn={rootContainerCn}>
      <Flex cn={headerRowCn}>
        <TouchableOpacity
          onPress={() => {
            player.togglePauseResume();
          }}
          style={transportButtonStyle}
        >
          {playbackStateIcon}
        </TouchableOpacity>
        <Pressable
          onPress={() => router.push({ pathname: '/relisten/player' })}
          className={isAccessory ? 'ml-2 flex-1' : 'ml-3 flex-1'}
          style={styles.metadataPressable}
        >
          <Flex column cn="flex-1 min-w-0">
            <RelistenText className={titleClassName} numberOfLines={1}>
              {track?.title ?? ''}
            </RelistenText>
            <RelistenText className={subtitleClassName} numberOfLines={1}>
              {currentTrack.subtitle ?? ''}
            </RelistenText>
            {isCasting && (
              <RelistenText className={castingClassName} numberOfLines={1}>
                Casting{deviceName ? ` to ${deviceName}` : ''}
              </RelistenText>
            )}
          </Flex>
        </Pressable>
        <Flex cn={isAccessory ? 'ml-2 items-center self-center' : 'ml-2 items-center'}>
          {Platform.OS === 'ios' && (
            <View style={utilityButtonShellStyle}>
              <AirPlayButton
                activeTintColor="white"
                tintColor="rgba(226, 232, 240, 0.72)"
                prioritizesVideoDevices={false}
                className={utilityIconClassName}
              />
            </View>
          )}
          {shouldMakeNetworkRequests && (
            <View style={utilityButtonShellStyle}>
              <RelistenCastButton
                tintColor="rgba(226, 232, 240, 0.78)"
                className={utilityIconClassName}
              />
            </View>
          )}
        </Flex>
      </Flex>
      <PlayerBottomBarProgress placementBackend={placementBackend} />
    </Flex>
  );
}

interface PlayerBottomBarProps {
  placementBackend?: PlayerBarPlacementBackend;
}

export function PlayerBottomBar({ placementBackend = 'overlay' }: PlayerBottomBarProps) {
  const isOnline = useShouldMakeNetworkRequests();
  const { playerBottomBarHeight, setPlayerBottomBarHeight } = useRelistenPlayerBottomBarContext();
  const placementOffset = usePlayerBarPlacementOffset();

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

  const containerStyle =
    placementBackend === 'overlay'
      ? {
          bottom: placementOffset,
          position: 'absolute' as const,
          width: '100%' as const,
        }
      : {
          width: '100%' as const,
        };
  const contentContainerStyle =
    placementBackend === 'overlay'
      ? styles.overlayContentContainer
      : styles.accessoryContentContainer;
  const shellChromeStyle =
    Platform.OS === 'ios' ? styles.shellChromeIos : styles.shellChromeAndroid;
  const shellSurfaceStyle =
    Platform.OS === 'ios' ? styles.shellSurfaceIos : styles.shellSurfaceAndroid;
  const mainSurfaceStyle =
    placementBackend === 'overlay' ? styles.mainSurfaceOverlay : styles.mainSurfaceAccessory;
  const body = (
    <>
      {!isOnline && <OfflineBanner />}
      <View style={mainSurfaceStyle}>
        <PlayerBottomBarContents placementBackend={placementBackend} />
      </View>
    </>
  );

  return (
    <View onLayout={onLayout} style={containerStyle}>
      <View style={contentContainerStyle}>
        {placementBackend === 'overlay' ? (
          <View style={shellChromeStyle}>
            <View style={[styles.shellSurface, shellSurfaceStyle]}>{body}</View>
          </View>
        ) : (
          body
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accessoryProgressFill: {
    backgroundColor: '#22d3ee',
    borderRadius: 999,
    height: '100%',
  },
  accessoryProgressTrack: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: 999,
    height: 3,
    marginHorizontal: 5,
    overflow: 'hidden',
  },
  accessoryContentContainer: {
    paddingBottom: 0,
    paddingHorizontal: 6,
    paddingTop: 0,
    width: '100%',
  },
  metadataPressable: {
    minWidth: 0,
  },
  mainSurfaceAccessory: {
    paddingBottom: 8,
    paddingHorizontal: 0,
    paddingTop: 6,
  },
  mainSurfaceOverlay: {
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  overlayContentContainer: {
    flex: 1,
    paddingBottom: 8,
    paddingHorizontal: 12,
    width: '100%',
  },
  scrubberShell: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderRadius: 999,
    marginHorizontal: 2,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  shellChromeAndroid: {
    borderRadius: 24,
    elevation: 10,
    shadowColor: '#020617',
  },
  shellChromeIos: {
    borderRadius: 24,
    shadowColor: '#020617',
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.22,
    shadowRadius: 22,
  },
  shellSurface: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  shellSurfaceAndroid: {
    backgroundColor: 'rgba(8, 18, 31, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
  },
  shellSurfaceIos: {
    backgroundColor: 'rgba(8, 18, 31, 0.76)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
  },
  transportButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  transportButtonAccessory: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  utilityButtonShell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginLeft: 8,
    width: 36,
  },
  utilityButtonShellAccessory: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 15,
    height: 30,
    justifyContent: 'center',
    marginLeft: 6,
    width: 30,
  },
});
