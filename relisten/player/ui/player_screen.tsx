import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import Flex from '@/relisten/components/flex';
import { ItemSeparator } from '@/relisten/components/item_separator';
import { RelistenText, UnselectableText } from '@/relisten/components/relisten_text';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { PlayerQueueTrack } from '@/relisten/player/relisten_player_queue';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { Show } from '@/relisten/realm/models/show';
import { useObject } from '@/relisten/realm/schema';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useActionSheet } from '@expo/react-native-action-sheet';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { FlatList, Platform, TouchableOpacity, View } from 'react-native';
import AirPlayButton from 'react-native-airplay-button';
import { SafeAreaView } from 'react-native-safe-area-context';
import Scrubber from 'react-native-scrubber';
import { VolumeManager } from 'react-native-volume-manager';

function ScrubberRow() {
  const progress = useNativePlaybackProgress();
  const player = useRelistenPlayer();

  const doSeek = useCallback(
    (value: number) => {
      if (progress?.duration === undefined) {
        return;
      }

      player.seekTo(value / progress.duration).then(() => {});
    },
    [player, progress?.duration]
  );

  return (
    <Scrubber
      value={progress?.elapsed ?? 0}
      totalDuration={progress?.duration ?? 100}
      onSlidingComplete={doSeek}
      scrubbedColor={RelistenBlue['100']}
      trackColor="white"
      trackBackgroundColor={RelistenBlue['600']}
    />
  );
}

function CurrentTrackInfo() {
  const { showActionSheetWithOptions } = useActionSheet();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();

  const { data: artist } = useArtist(currentPlayerTrack?.sourceTrack.artistUuid);
  const show = useObject(Show, currentPlayerTrack?.sourceTrack?.showUuid || '');

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
            router.push({
              pathname: '/relisten/(tabs)/artists/[artistUuid]/' as const,
              params: {
                artistUuid: artist.uuid,
              },
            });
            break;
          case 1:
            router.push({
              pathname: '/relisten/(tabs)/artists/[artistUuid]/show/[showUuid]/' as const,
              params: {
                artistUuid: artist.uuid,
                showUuid: show.uuid,
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

  if (currentPlayerTrack === undefined || artist === null || show === null) {
    return <></>;
  }

  const currentTrack = currentPlayerTrack.sourceTrack;

  return (
    <Flex column className="mb-4">
      <Flex className="items-center justify-between pb-1 pt-3">
        <RelistenText className="text-3xl font-bold">{currentTrack.title}</RelistenText>
        <TouchableOpacity onPress={onDotsPress} className="p-2 pr-0">
          <MaterialCommunityIcons name="dots-horizontal" size={22} color="white" />
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
    </Flex>
  );
}

function PlayerControls() {
  const player = useRelistenPlayer();
  const playbackState = useRelistenPlayerPlaybackState();
  const progress = useNativePlaybackProgress();

  return (
    <Flex className="w-full items-center justify-center py-4">
      <TouchableOpacity
        onPress={() => {
          if (progress && progress.elapsed < 5) {
            player.seekTo(0);
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
        onPress={() => {
          player.next();
        }}
        className="p-2"
      >
        <MaterialCommunityIcons name="skip-forward" size={42} color="white" />
      </TouchableOpacity>
    </Flex>
  );
}

function PlayerVolumeControls() {
  const [currentSystemVolume, setReportedSystemVolume] = useState<number>(0);

  useEffect(() => {
    VolumeManager.getVolume().then((result) => {
      setReportedSystemVolume(result.volume);
    });

    const volumeListener = VolumeManager.addVolumeListener((result) => {
      setReportedSystemVolume(result.volume);
    });

    return () => {
      volumeListener.remove();
    };
  }, [setReportedSystemVolume]);

  return (
    <Flex className="w-full items-center">
      <View className="flex-grow">
        <Slider
          className="w-40 flex-1 flex-grow"
          minimumValue={0}
          maximumValue={1}
          minimumTrackTintColor="white"
          maximumTrackTintColor={RelistenBlue['600']}
          onValueChange={(value) => {
            VolumeManager.setVolume(value, { showUI: false });
          }}
          onSlidingComplete={async (value) => {
            setReportedSystemVolume(value);
          }}
          value={currentSystemVolume}
          step={0.001}
        />
      </View>
      {Platform.OS == 'ios' && (
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

function PlayerQueueItem({ queueTrack, index }: { queueTrack: PlayerQueueTrack; index?: number }) {
  const { showActionSheetWithOptions } = useActionSheet();
  const player = useRelistenPlayer();
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const isPlayingThisTrack = currentPlayerTrack?.identifier == queueTrack.identifier;
  const sourceTrack = queueTrack.sourceTrack;

  const artist = useArtist(sourceTrack.artistUuid);
  const show = useObject(Show, sourceTrack.showUuid || '');

  if (typeof index === 'undefined') return null;

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
            player.queue.queueNextTrack([queueTrack.sourceTrack]);
            break;
          case 2:
            // Add to end of queue
            player.queue.addTrackToEndOfQueue([queueTrack.sourceTrack]);
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

  const subtitle = [artist?.data?.name, show?.displayDate, show?.venue?.name, show?.venue?.location]
    .filter((x) => !!x && x.length > 0)
    .join(' · ');

  return (
    // <TouchableOpacity className="flex h-full w-full flex-row items-start px-4" onPress={onPress}>
    <View className="shrink flex-col px-4">
      <View className="w-full grow flex-row items-center justify-between">
        <Flex column className="shrink py-3 pr-2">
          <Flex className="items-center">
            {isPlayingThisTrack && (
              <View className="pr-1">
                <MaterialIcons name="bar-chart" size={18} color="white" />
              </View>
            )}
            <UnselectableText className="text-lg">{sourceTrack.title}</UnselectableText>
          </Flex>
          {subtitle.length > 0 && (
            <UnselectableText className="pt-1 text-sm text-gray-400" numberOfLines={1}>
              {subtitle}
            </UnselectableText>
          )}
        </Flex>
        <View className="grow"></View>
        <UnselectableText className="py-3 text-base text-gray-400">
          {sourceTrack.humanizedDuration}
        </UnselectableText>
        <TouchableOpacity className="shrink-0 grow-0 py-3 pl-4" onPress={onDotsPress}>
          <MaterialCommunityIcons name="dots-horizontal" size={16} color="white" />
        </TouchableOpacity>
      </View>
      <ItemSeparator />
    </View>
    // </TouchableOpacity>
  );
}

function PlayerQueue() {
  const player = useRelistenPlayer();
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
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

  const onPress = (index?: number) => {
    if (!index) return;
    player.queue.playTrackAtIndex(index);
  };
  return (
    <View className="flex-1">
      <DraggableFlatList
        ref={flatlistRef as any}
        data={orderedQueueTracks}
        onDragEnd={({ data }) => player.queue.reorderQueue(data.map((q) => q.sourceTrack))}
        keyExtractor={(item) => item.identifier}
        renderItem={({ item, drag, isActive, getIndex }) => (
          <ScaleDecorator key={item.identifier}>
            <TouchableOpacity
              onPress={() => onPress(getIndex())}
              onLongPress={drag}
              disabled={isActive}
              className="w-full flex-1"
            >
              <PlayerQueueItem queueTrack={item} index={getIndex()} />
              {/* <RelistenText>hi</RelistenText> */}
            </TouchableOpacity>
          </ScaleDecorator>
        )}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatlistRef.current?.scrollToIndex({ index: info.index, animated: true });
          }, 100);
        }}
      ></DraggableFlatList>
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

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
    });
  }, [navigation]);

  return (
    <SafeAreaView className="flex-1 bg-relisten-blue-800" edges={['bottom']}>
      <Flex column className="flex-1">
        <View className="flex-1 flex-grow bg-relisten-blue-900">
          <PlayerQueue />
        </View>
        <Flex column className="flex-shrink border-t border-relisten-blue-700 px-4">
          <CurrentTrackInfo />
          <ScrubberRow />
          <PlayerControls />
          <PlayerVolumeControls />
        </Flex>
      </Flex>
    </SafeAreaView>
  );
}
