import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import Flex from '@/relisten/components/flex';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText } from '@/relisten/components/relisten_text';
import { SoundIndicator } from '@/relisten/components/sound_indicator';
import { SourceTrackOfflineIndicator } from '@/relisten/components/source/source_track_offline_indicator';
import {
  useNativeActiveTrackDownloadProgress,
  useNativePlaybackProgress,
} from '@/relisten/player/native_playback_state_hooks';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { trackDuration } from '@/relisten/util/duration';
import { useGroupSegment } from '@/relisten/util/routes';
import { tw } from '@/relisten/util/tw';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { type ParamListBase, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { LegacyRef, useCallback, useEffect, useRef } from 'react';
import { FlatList, Platform, TouchableOpacity, View } from 'react-native';
import AirPlayButton from 'react-native-airplay-button';
import { HapticModeEnum, Slider } from 'react-native-awesome-slider';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DisclosureIndicator } from '@/relisten/components/disclosure_indicator';

export function ScrubberRow() {
  const progressObj = useNativePlaybackProgress();
  const downloadProgress = useNativeActiveTrackDownloadProgress();
  const player = useRelistenPlayer();

  const doSeek = useCallback(
    (value: number) => {
      if (progressObj?.duration === undefined) {
        return;
      }

      player.seekTo(value / progressObj.duration).then(() => {});
    },
    [player, progressObj?.duration]
  );

  const cacheValue = (downloadProgress?.percent ?? 0) * (progressObj?.duration ?? 0);

  const progress = useSharedValue(progressObj?.elapsed ?? 0);
  const min = useSharedValue(0);
  const max = useSharedValue(progressObj?.duration ?? 0);
  const cache = useSharedValue(cacheValue);
  const isScrubbing = useSharedValue(false);

  useEffect(() => {
    if (!isScrubbing.value) {
      progress.value = progressObj?.elapsed ?? 0;
    }
  }, [progressObj?.elapsed, isScrubbing.value]);
  useEffect(() => {
    max.value = progressObj?.duration ?? 0;
  }, [progressObj?.duration]);
  useEffect(() => {
    cache.value = cacheValue;
  }, [cacheValue]);

  return (
    <Slider
      progress={progress}
      minimumValue={min}
      maximumValue={max}
      cache={cache}
      isScrubbing={isScrubbing}
      hapticMode={HapticModeEnum.BOTH}
      onHapticFeedback={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onSlidingComplete={doSeek}
      theme={{
        minimumTrackTintColor: RelistenBlue['400'],
        // maximumTrackTintColor?: string;
        cacheTrackTintColor: RelistenBlue['600'],
        bubbleBackgroundColor: RelistenBlue['900'],
        // bubbleTextColor: 'black',
        // disableMinTrackTintColor?: string;
        // heartbeatColor?: string;
      }}
      bubble={(value) => {
        return trackDuration(value);
      }}

      // scrubbedColor={RelistenBlue['100']}
      // trackColor="white"
      // trackBackgroundColor={RelistenBlue['700']}
      // bufferedTrackColor={RelistenBlue['400']}
      // bufferedValue={
      //   downloadProgress && progress ? downloadProgress?.percent * progress?.duration : 0
      // }
      // displayValues={displayValues}
    />
  );
}

function CurrentTrackInfo() {
  const { showActionSheetWithOptions } = useActionSheet();
  const navigation = useNavigation();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment(true);
  const progressObj = useNativePlaybackProgress();

  const artist = currentPlayerTrack?.sourceTrack?.artist;
  const show = currentPlayerTrack?.sourceTrack?.show;

  const onDotsPress = useCallback(() => {
    if (!artist || !show) {
      return;
    }

    const options = [`Go to ${artist.name}`, `Go to ${show.displayDate}`, 'Cancel'];
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
      },
      (selectedIndex?: number) => {
        switch (selectedIndex) {
          case 0:
            navigation.goBack();
            router.push({
              pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/`,
              params: {
                artistUuid: artist.uuid,
              },
            });
            break;
          case 1:
            navigation.goBack();
            router.push({
              pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/show/[showUuid]/source/[sourceUuid]/`,

              params: {
                artistUuid: artist.uuid,
                showUuid: show.uuid,
                sourceUuid: 'initial',
              },
            });
            break;
          case cancelButtonIndex:
            break;
          // Canceled
        }
      }
    );
  }, [artist, router, show]);

  if (currentPlayerTrack === undefined || artist === undefined || show === undefined) {
    return <></>;
  }

  const currentTrack = currentPlayerTrack.sourceTrack;

  return (
    <Flex column className="mb-4">
      <Flex className="items-center justify-between pb-1 pt-3">
        <TouchableOpacity onPress={onDotsPress}>
          <RelistenText className="text-3xl font-bold">
            {currentTrack.title}
            <DisclosureIndicator />
          </RelistenText>
        </TouchableOpacity>
      </Flex>
      <RelistenText className="pb-0.5 text-lg">
        {artist.name} • {show.displayDate}
      </RelistenText>
      {show.venue && (
        <RelistenText className="text-md text-gray-300">
          {show.venue.name}, {show.venue.location}
        </RelistenText>
      )}
      <Flex cn="justify-between mt-2">
        <RelistenText cn="font-semibold">{trackDuration(progressObj?.elapsed ?? 0)}</RelistenText>
        <RelistenText cn="font-semibold">{trackDuration(progressObj?.duration ?? 0)}</RelistenText>
      </Flex>
    </Flex>
  );
}

function PlayerControls() {
  const player = useRelistenPlayer();
  const playbackState = useRelistenPlayerPlaybackState();
  const progress = useNativePlaybackProgress();

  return (
    <Flex className="w-full items-center justify-center pt-0">
      {Platform.OS === 'ios' && <View className="w-[44px]" />}
      <TouchableOpacity
        onPress={() => {
          if (progress && progress.elapsed < 5) {
            player.seekTo(0).then(() => {});
          } else {
            player.previous();
          }
        }}
        className="p-2"
      >
        <MaterialCommunityIcons name="skip-backward" size={42} color="white" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => {
          player.togglePauseResume();
        }}
        className="mx-4"
      >
        {playbackState === RelistenPlaybackState.Playing ? (
          <MaterialIcons name="pause" size={80} color="white" />
        ) : (
          <MaterialIcons name="play-arrow" size={80} color="white" />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        disabled={player.queue.isCurrentTrackLast}
        onPress={() => {
          player.next();
        }}
        className={tw('p-2', {
          'opacity-40': player.queue.isCurrentTrackLast,
        })}
      >
        <MaterialCommunityIcons name="skip-forward" size={42} color="white" />
      </TouchableOpacity>
      {Platform.OS === 'ios' && (
        <AirPlayButton
          activeTintColor="blue"
          tintColor="white"
          prioritizesVideoDevices={false}
          style={{ width: 42, height: 42, marginLeft: 8 }}
        />
      )}
    </Flex>
  );
}

function PlayerQueueItem({ queueTrack, index }: { queueTrack: PlayerQueueTrack; index: number }) {
  const { showActionSheetWithOptions } = useActionSheet();
  const player = useRelistenPlayer();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const isPlayingThisTrack = currentPlayerTrack?.identifier == queueTrack.identifier;
  const playbackState = useRelistenPlayerPlaybackState();
  const sourceTrack = queueTrack.sourceTrack;

  const artist = sourceTrack.artist;
  const show = sourceTrack.show;

  const onDotsPress = () => {
    const options = ['Play now', 'Play next', 'Add to end of queue', 'Remove from queue', 'Cancel'];
    const destructiveButtonIndex = 3;
    const cancelButtonIndex = options.length - 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (selectedIndex?: number) => {
        switch (selectedIndex) {
          case 0:
            // Play now
            player.queue.playTrackAtIndex(index);
            break;
          case 1:
            // Play next
            player.queue.queueNextTrack([queueTrack]);
            break;
          case 2:
            // Add to end of queue
            player.queue.addTrackToEndOfQueue([queueTrack]);
            break;
          case destructiveButtonIndex:
            // Remove from queue
            player.queue.removeTrackAtIndex(index);
            break;
          case cancelButtonIndex:
            break;
          // Canceled
        }
      }
    );
  };

  const onPress = () => {
    player.queue.playTrackAtIndex(index);
  };

  const subtitle = [artist?.name, show?.displayDate, show?.venue?.name, show?.venue?.location]
    .filter((x) => !!x && x.length > 0)
    .join(' · ');

  return (
    <TouchableOpacity className="flex flex-row items-start px-4" onPress={onPress}>
      <View className="shrink flex-col">
        <View className="w-full grow flex-row items-center justify-between">
          <Flex column className="shrink py-3 pr-2">
            <Flex className="items-center">
              {isPlayingThisTrack && (
                <View className="pr-1">
                  <SoundIndicator
                    size={18}
                    playing={playbackState === RelistenPlaybackState.Playing}
                  />
                </View>
              )}
              <RelistenText className="shrink text-lg">{sourceTrack.title}</RelistenText>
              <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
            </Flex>
            {subtitle.length > 0 && (
              <RelistenText className="pt-1 text-sm text-gray-400" numberOfLines={2}>
                {subtitle}
              </RelistenText>
            )}
          </Flex>
          <View className="grow"></View>
          <RelistenText className="py-3 text-base text-gray-400">
            {sourceTrack.humanizedDuration}
          </RelistenText>
          <TouchableOpacity className="shrink-0 grow-0 py-3 pl-4" onPress={onDotsPress}>
            <MaterialCommunityIcons name="dots-horizontal" size={16} color="white" />
          </TouchableOpacity>
        </View>
        <ItemSeparator />
      </View>
    </TouchableOpacity>
  );
}

function PlayerQueue() {
  const player = useRelistenPlayer();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const flatlistRef = useRef<FlatList<PlayerQueueTrack>>();

  useEffect(() => {
    navigation.setOptions({ title: `${orderedQueueTracks.length} Tracks` });
  }, [orderedQueueTracks.length]);

  useFocusEffect(() => {
    const idx = player.queue.currentIndex;
    if (idx) {
      flatlistRef.current?.scrollToIndex({ index: idx, animated: false });
    }
  });

  return (
    <View className="flex-1">
      <FlatList
        ref={flatlistRef as unknown as LegacyRef<FlatList<PlayerQueueTrack>>}
        className="w-full flex-1"
        data={orderedQueueTracks}
        // onDragEnd={({ data }) => player.queue.reorderQueue(data.map((q) => q.sourceTrack))}
        keyExtractor={(item) => item.identifier}
        renderItem={({ item, index }) => (
          // <ScaleDecorator>
          //   <TouchableOpacity onLongPress={drag} disabled={isActive} className="flex-1">
          <PlayerQueueItem key={item.identifier} queueTrack={item} index={index} />
          // </TouchableOpacity>
          // </ScaleDecorator>
        )}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatlistRef.current?.scrollToIndex({ index: info.index, animated: true });
          }, 100);
        }}
      ></FlatList>
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => {
        return (
          <TouchableOpacity
            onPress={() => {
              navigation.goBack();
            }}
            className="py-2 pr-2"
          >
            <MaterialCommunityIcons name="close" size={22} color="white" />
          </TouchableOpacity>
        );
      },
      headerRight: () => {
        return (
          <TouchableOpacity
            onPress={() => {
              navigation.goBack();

              router.push({
                pathname:
                  '/relisten/tabs/(artists)/[artistUuid]/show/[showUuid]/source/[sourceUuid]/',
                params: {
                  artistUuid: currentPlayerTrack?.sourceTrack.artistUuid,
                  showUuid: currentPlayerTrack?.sourceTrack.showUuid,
                  sourceUuid: currentPlayerTrack?.sourceTrack.sourceUuid,
                },
              });
            }}
            className="py-2 pr-2"
          >
            <MaterialIcons name="library-music" size={22} color="white" />
          </TouchableOpacity>
        );
      },
    });
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-relisten-blue-800" edges={['bottom']}>
      <Flex column className="flex-1">
        <View className="flex-1 flex-grow bg-relisten-blue-900">
          <PlayerQueue />
        </View>
        <Flex column className="flex-shrink border-t border-relisten-blue-700 px-8 pt-4">
          <CurrentTrackInfo />
          <ScrubberRow />
          <PlayerControls />
        </Flex>
      </Flex>
    </SafeAreaView>
  );
}
