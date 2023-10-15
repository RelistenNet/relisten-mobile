import { player } from '@/modules/relisten-audio-player';
import { MaterialIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSelector } from '@xstate/react';
import { MotiView, View } from 'moti';
import { useRef } from 'react';
import { Pressable, TouchableOpacity } from 'react-native';
import PlaybackMachine from '../machines/PlaybackMachine';
import { useArtist } from '../realm/models/artist_repo';
import { useFullShow } from '../realm/models/show_repo';
import { duration } from '../util/duration';
import Flex from './flex';
import { RelistenButton } from './relisten_button';
import { RelistenText } from './relisten_text';
import PlaybackQueue from './PlaybackQueue';
import {
  useActiveTrackDownloadProgress,
  usePlaybackProgress,
  usePlaybackState,
} from '@/relisten/components/playback_state';

export const useIsBarVisible = () => {
  const playbackState = usePlaybackState();

  return playbackState !== undefined && playbackState !== 'Stopped';
};

// type StyledBottomSheetProps = {
//   handleStyle?: StyleProp<ViewStyle>;
// } & BottomSheetProps;
//
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
    <View
      style={{
        height: isPlaybackBarVisbile ? DEFAULT_PLAYBACK_HEIGHT : 0,
        backgroundColor: 'red',
        width: '100%',
      }}
    />
  );
};

function ProgressText() {
  const playbackProgress = usePlaybackProgress();

  return (
    <>
      {(playbackProgress?.duration ?? 0) > 0 && (
        <Flex cn="flex-row">
          <RelistenText
            numberOfLines={1}
            // animate={{
            //   translateX: -100,
            // }}
            className="text-sm"
          >
            {duration(playbackProgress?.elapsed ?? 0, playbackProgress?.duration ?? 0)}/
            {duration(playbackProgress?.duration ?? 0)}
          </RelistenText>
        </Flex>
      )}
    </>
  );
}

function DownloadProgressBar() {
  const activeTrackDownloadProgress = useActiveTrackDownloadProgress();

  return (
    <MotiView
      // from={{ width: '100%' }}
      // animate={{ width: '25%' }}
      // from={{ width: 0, }}
      animate={{ width: (activeTrackDownloadProgress?.percent ?? 0) * 250 }}
      className="absolute bottom-0 left-0 top-0 h-full w-full bg-relisten-blue-200"
    />
  );
}

function PlaybackProgressBar() {
  const playbackProgress = usePlaybackProgress();

  return (
    <MotiView
      // from={{ width: '100%' }}
      // animate={{ width: '25%' }}
      // from={{ width: 0, }}
      animate={{ translateX: (playbackProgress?.percent ?? 0.0) * 250 }}
      className="absolute -left-0.5 bottom-0 h-[150%] w-1 bg-relisten-blue-400"
    />
  );
}

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
      index={!playbackState ? -1 : 0}
      onChange={(index) => (bottomSheetIndexRef.current = index)}
      handleComponent={() => (
        <View className="relative h-2 w-full bg-relisten-blue-800">
          <DownloadProgressBar />
          <PlaybackProgressBar />
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
              <ProgressText />
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
