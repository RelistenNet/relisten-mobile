import {
  useRelistenPlayer,
  useRelistenPlayerPlaybackState,
} from '@/relisten/player/relisten_player_hooks';
import { FlatList, Platform, TouchableOpacity, View } from 'react-native';
import Flex from '@/relisten/components/flex';
import Scrubber from 'react-native-scrubber';
import { useNativePlaybackProgress } from '@/relisten/player/native_playback_state_hooks';
import React, { useCallback, useEffect, useState } from 'react';
import {
  useRelistenPlayerCurrentTrack,
  useRelistenPlayerQueueOrderedTracks,
} from '@/relisten/player/relisten_player_queue_hooks';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useFullShowFromSource } from '@/relisten/realm/models/show_repo';
import { useArtist } from '@/relisten/realm/models/artist_repo';
import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { VolumeManager } from 'react-native-volume-manager';
import AirPlayButton from 'react-native-airplay-button';
import { SourceTrackComponent } from '@/relisten/components/SourceTrackComponent';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

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
  const currentPlayerTrack = useRelistenPlayerCurrentTrack();
  const { data: artist } = useArtist(currentPlayerTrack?.sourceTrack.artistUuid);
  const { data: showWithSources } = useFullShowFromSource(
    currentPlayerTrack?.sourceTrack?.sourceUuid
  );
  const show = showWithSources?.show;

  if (currentPlayerTrack === undefined || artist === null || show === undefined) {
    return <></>;
  }

  const currentTrack = currentPlayerTrack.sourceTrack;

  return (
    <Flex column className="mb-4">
      <Flex className="items-center justify-between pb-1 pt-3">
        <RelistenText className="text-3xl font-bold">{currentTrack.title}</RelistenText>
        <TouchableOpacity onPress={() => {}} className="p-2">
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

function PlayerQueue() {
  const orderedQueueTracks = useRelistenPlayerQueueOrderedTracks();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const player = useRelistenPlayer();

  useEffect(() => {
    navigation.setOptions({ title: `${orderedQueueTracks.length} Tracks` });
  }, [orderedQueueTracks.length]);

  return (
    <DraggableFlatList
      className="w-full flex-1"
      data={orderedQueueTracks}
      onDragEnd={({ data }) => player.queue.reorderQueue(data.map((q) => q.sourceTrack))}
      keyExtractor={(item) => item.sourceTrack.uuid}
      renderItem={({ item, drag, isActive, getIndex }) => (
        <ScaleDecorator>
          <TouchableOpacity onLongPress={drag} disabled={isActive} className="flex-1">
            <SourceTrackComponent
              key={item.identifier}
              sourceTrack={item.sourceTrack}
              isLastTrackInSet={getIndex() == orderedQueueTracks.length - 1}
              playShow={() => {}}
              showTrackNumber={false}
            />
          </TouchableOpacity>
        </ScaleDecorator>
      )}
    ></DraggableFlatList>
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
