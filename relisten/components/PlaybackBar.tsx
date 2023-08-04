import { player } from '@/modules/relisten-audio-player';
import { MaterialIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSelector } from '@xstate/react';
import { MotiView, View } from 'moti';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TouchableOpacity } from 'react-native';
import PlaybackMachine from '../machines/PlaybackMachine';
import { useArtist } from '../realm/models/artist_repo';
import { useFullShow } from '../realm/models/show_repo';
import { duration } from '../util/duration';
import Flex from './flex';
import { RelistenButton } from './relisten_button';
import { RelistenText } from './relisten_text';
import PlaybackQueue from './PlaybackQueue';

export const usePlaybackState = () => {
  const [state, setState] = useState<any>({});

  const percent = state?.progress?.elapsed / state?.progress?.duration || undefined;

  useEffect(() => {
    const download = player.addDownloadProgressListener((download) => {
      setState((obj) => ({
        ...obj,
        downloadPercent: download.downloadedBytes / download.totalBytes,
      }));
    });

    const listener = player.addPlaybackProgressListener((progress) => {
      setState((obj) => ({ ...obj, progress }));
    });

    const playback = player.addPlaybackStateListener((playbackState) => {
      if (playbackState?.newPlaybackState) {
        setState((obj) => ({ ...obj, playback: playbackState?.newPlaybackState }));
      }
    });

    return () => {
      download.remove();
      listener.remove();
      playback.remove();
    };
  });

  return { ...state, percent };
};

export const useIsBarVisible = () => {
  const playback = usePlaybackState();

  return playback && playback?.playback !== 'Stopped';
};

// type StyledBottomSheetProps = {
//   handleStyle?: StyleProp<ViewStyle>;
// } & BottomSheetProps;

// const StyledBottomSheet = styled(
//   ({ handleStyle, ...props }: StyledBottomSheetProps) => (
//     <BottomSheet {...props} handleStyle={handleStyle} />
//   ),
//   {
//     props: {
//       handleStyle: true,
//     },
//   }
// );

export const DEFAULT_PLAYBACK_HEIGHT = 64;

// this hides the playback bar on screens that scroll
export const PLAYBACK_SKELETON = () => {
  const isPlaybackBarVisbile = useIsBarVisible();

  return (
    <View style={{ height: isPlaybackBarVisbile ? 0 : DEFAULT_PLAYBACK_HEIGHT, width: '100%' }} />
  );
};

export default function PlaybackBar() {
  const bottomSheetIndexRef = useRef<number>(1);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const context = useSelector(PlaybackMachine, ({ context }) => context);
  const machineState = useSelector(PlaybackMachine, ({ value }) => value);
  const playbackState = usePlaybackState();

  const playpause = () => {
    PlaybackMachine.send({ type: 'PLAYPAUSE' });
  };

  const toggleSheet = () => {
    if (bottomSheetIndexRef.current === 1) {
      bottomSheetRef.current?.collapse();
    } else {
      bottomSheetRef.current?.expand();
    }
  };

  const activeTrack = context.queue[context.activeTrackIndex];

  const artist = useArtist(activeTrack?.artistUuid, {
    onlyFetchFromApiIfLocalIsNotShowable: true,
  });

  const showCache = useFullShow(activeTrack?.showUuid ?? '');

  const subtitle = [
    artist?.data?.name,
    showCache?.data?.show?.displayDate,
    showCache?.data?.show?.venue?.name,
  ]
    .filter((x) => x)
    .join(' · ');

  return (
    <BottomSheet
      snapPoints={[DEFAULT_PLAYBACK_HEIGHT, '90%']}
      ref={bottomSheetRef}
      index={!playbackState?.playback ? -1 : 0}
      onChange={(index) => (bottomSheetIndexRef.current = index)}
      handleComponent={() => (
        <View className="relative h-2 w-full bg-relisten-blue-800">
          <MotiView
            // from={{ width: '100%' }}
            // animate={{ width: '25%' }}
            // from={{ width: 0, }}
            animate={{ width: (playbackState.downloadPercent ?? 0) * 250 }}
            className="absolute bottom-0 left-0 top-0 h-full w-full bg-relisten-blue-200"
          />
          <MotiView
            // from={{ width: '100%' }}
            // animate={{ width: '25%' }}
            // from={{ width: 0, }}
            animate={{ translateX: (playbackState.percent ?? 0.0) * 250 }}
            className="absolute -left-0.5 bottom-0 h-[150%] w-1 bg-relisten-blue-400"
          />
        </View>
      )}
      // snapPoints={snapPoints}
      // onChange={handleSheetChanges}
    >
      <View className="relative flex-1 bg-relisten-blue-700">
        <Pressable onPress={toggleSheet}>
          <Flex cn="h-[57px] items-center">
            <Flex cn="ml-2 h-full items-center">
              {/* <TouchableOpacity onPress={() => PlaybackMachine.send({ type: 'SKIP_BACK' })}>
                <MaterialIcons name="skip-previous" size={32} color="white" />
              </TouchableOpacity> */}
              <TouchableOpacity onPress={playpause}>
                {context.playbackState === 'Playing' ? (
                  <MaterialIcons name="pause" size={42} color="white" />
                ) : (
                  <MaterialIcons name="play-arrow" size={42} color="white" />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => PlaybackMachine.send({ type: 'SKIP_FORWARD' })}>
                <MaterialIcons name="skip-next" size={32} color="white" />
              </TouchableOpacity>
            </Flex>
            <Flex column cn="ml-4 truncate flex-1">
              <RelistenText className="text-lg font-semibold">
                {activeTrack?.title ?? ''}
              </RelistenText>
              <RelistenText className="truncate" numberOfLines={1}>
                {subtitle ?? ''}
              </RelistenText>
              {playbackState.progress?.duration > 0 && (
                <Flex cn="flex-row">
                  <RelistenText
                    numberOfLines={1}
                    // animate={{
                    //   translateX: -100,
                    // }}
                    className="text-sm"
                  >
                    {duration(playbackState.progress?.elapsed, playbackState.progress?.duration)}/
                    {duration(playbackState.progress?.duration)}
                  </RelistenText>
                </Flex>
              )}
            </Flex>
            <Flex>
              <MaterialIcons name="drag-indicator" size={32} color="rgba(255,255,255,0.7)" />
            </Flex>
          </Flex>
        </Pressable>
        <Flex cn="flex-1 flex-col bg-relisten-blue-800">
          <PlaybackQueue />
          <RelistenText>{JSON.stringify(clean(context), null, 2)}</RelistenText>
          <RelistenText>{JSON.stringify(machineState, null, 2)}</RelistenText>
          <RelistenText>{JSON.stringify(playbackState, null, 2)}</RelistenText>
          <RelistenButton textClassName="text-sm" onPress={() => player.seekTo(0.98)}>
            (Seek To 98%!)
          </RelistenButton>
        </Flex>
      </View>
    </BottomSheet>
  );
}

const clean = (obj: any) => {
  const next = { ...obj };
  delete next.queue;
  return next;
};
