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
import React, { LegacyRef, useCallback, useEffect, useRef } from 'react';
import { FlatList, Platform, Share, TouchableOpacity, View } from 'react-native';
import AirPlayButton from 'react-native-airplay-button';
import { HapticModeEnum, Slider } from 'react-native-awesome-slider';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Progress from 'react-native-progress';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { ReorderableListReorderEvent } from 'react-native-reorderable-list/src/types/props';
import * as Sharing from 'expo-sharing';

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

function useNavigateToCurrentTrackSheet() {
  const { showActionSheetWithOptions } = useActionSheet();
  const navigation = useNavigation();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const groupSegment = useGroupSegment(true);

  const artist = currentPlayerTrack?.sourceTrack?.artist;
  const show = currentPlayerTrack?.sourceTrack?.show;
  const source = currentPlayerTrack?.sourceTrack?.source;

  const showNavigateToCurrentTrackActionSheet = useCallback(() => {
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
                sourceUuid: source?.uuid || 'initial',
              },
            });
            break;
          case cancelButtonIndex:
            break;
          // Canceled
        }
      }
    );
  }, [artist, router, show, source]);

  return { showNavigateToCurrentTrackActionSheet };
}

function CurrentTrackInfo() {
  const { showNavigateToCurrentTrackActionSheet } = useNavigateToCurrentTrackSheet();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const progressObj = useNativePlaybackProgress();

  const artist = currentPlayerTrack?.sourceTrack?.artist;
  const show = currentPlayerTrack?.sourceTrack?.show;
  const source = currentPlayerTrack?.sourceTrack?.source;
  const track = currentPlayerTrack?.sourceTrack;

  if (
    currentPlayerTrack === undefined ||
    artist === undefined ||
    show === undefined ||
    track === undefined ||
    source === undefined
  ) {
    return <></>;
  }

  const onShare = () => {
    const [year, month, day] = show.displayDate.split('-');
    const url = `https://relisten.net/${artist.slug}/${year}/${month}/${day}/${track.slug}?source=${source.uuid}`;
    Share.share({
      message: `Check out ${track.title} by ${artist.name} (${show.displayDate}) on @relistenapp${Platform.OS === 'ios' ? '' : `: ${url}`}`,
      url: url,
    }).then(() => {});
  };

  const currentTrack = currentPlayerTrack.sourceTrack;

  return (
    <Flex column className="mb-4">
      <Flex className="items-stretch justify-between">
        <TouchableOpacity onPress={showNavigateToCurrentTrackActionSheet} className="flex-shrink">
          <RelistenText className="pb-1 pr-3 pt-3 text-3xl font-bold">
            {currentTrack.title}
          </RelistenText>
        </TouchableOpacity>
        <TouchableOpacity onPress={onShare}>
          <Flex className="flex-1 items-center pb-1 pl-4 pt-3">
            <MaterialIcons
              name={Platform.OS == 'ios' ? 'ios-share' : 'share'}
              size={20}
              color="white"
            />
          </Flex>
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

  let playbackStateIcon = <MaterialIcons name="play-arrow" size={80} color="white" />;

  if (playbackState == RelistenPlaybackState.Playing) {
    playbackStateIcon = <MaterialIcons name="pause" size={80} color="white" />;
  } else if (playbackState == RelistenPlaybackState.Stalled) {
    playbackStateIcon = <Progress.CircleSnail indeterminate={true} size={42} color="white" />;
  }

  return (
    <Flex className="w-full items-center justify-center py-6">
      {Platform.OS === 'ios' && <View className="w-[44px]" />}
      <TouchableOpacity
        onPress={() => {
          if (progress && (progress.elapsed < 5 || player.queue.currentIndex === 0)) {
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
        className="mx-4 flex h-[80px] w-[80px] items-center justify-center"
      >
        {playbackStateIcon}
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
  const drag = useReorderableDrag();
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
            player.playTrackAtIndex(index);
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
    player.playTrackAtIndex(index);
  };

  const subtitle = [artist?.name, show?.displayDate, show?.venue?.name, show?.venue?.location]
    .filter((x) => !!x && x.length > 0)
    .join('\u00A0·\u00A0');

  return (
    <TouchableOpacity
      className="flex flex-row items-start pl-4"
      onPress={onPress}
      onLongPress={drag}
    >
      <View className="shrink flex-col">
        <View className="w-full grow flex-row items-stretch justify-between">
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
              <RelistenText className="shrink text-lg" selectable={false}>
                {sourceTrack.title}
              </RelistenText>
              <SourceTrackOfflineIndicator offlineInfo={sourceTrack.offlineInfo} />
            </Flex>
            {subtitle.length > 0 && (
              <RelistenText
                className="pt-1 text-sm text-gray-400"
                numberOfLines={2}
                selectable={false}
              >
                {subtitle}
              </RelistenText>
            )}
          </Flex>
          <View className="grow"></View>
          <Flex className="items-center">
            <RelistenText className="py-3 text-base text-gray-400" selectable={false}>
              {sourceTrack.humanizedDuration}
            </RelistenText>
          </Flex>
          <TouchableOpacity className="shrink-0 grow-0" onPress={onDotsPress}>
            <Flex className="flex-1 items-center px-4">
              <MaterialCommunityIcons name="dots-horizontal" size={16} color="white" />
            </Flex>
          </TouchableOpacity>
          <View className="shrink-0 grow-0 py-3 pl-4">
            <MaterialIcons name="drag-handle" size={24} color="white" />
          </View>
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

  const triggerHaptics = useCallback(() => {
    'worklet';

    runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
    player.queue.moveQueueTrack(from, to);
  };

  return (
    <View className="flex-1">
      <ReorderableList
        ref={flatlistRef as unknown as LegacyRef<FlatList<PlayerQueueTrack>>}
        onReorder={onReorder}
        className="w-full flex-1"
        data={orderedQueueTracks}
        onDragStart={triggerHaptics}
        onDragEnd={triggerHaptics}
        onIndexChange={triggerHaptics}
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
            flatlistRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 0);
        }}
      ></ReorderableList>
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const { showNavigateToCurrentTrackActionSheet } = useNavigateToCurrentTrackSheet();

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => {
        return (
          <TouchableOpacity
            onPressOut={() => {
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
            onPressOut={showNavigateToCurrentTrackActionSheet}
            className="py-2 pr-2"
          >
            <MaterialCommunityIcons name="dots-horizontal" size={22} color="white" />
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
