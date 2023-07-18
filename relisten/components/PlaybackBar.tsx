import { player } from '@/modules/relisten-audio-player';
import { MaterialIcons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { useActor, useActorRef, useMachine, useSelector } from '@xstate/react';
import { MotiView, View } from 'moti';
import { useEffect, useRef, useState } from 'react';
import { Pressable, TouchableOpacity } from 'react-native';
import PlaybackMachine from '../machines/PlaybackMachine';
import { duration } from '../util/duration';
import Flex from './flex';
import { RelistenButton } from './relisten_button';
import { RelistenText } from './relisten_text';

export const usePlaybackState = () => {
  const [state, setState] = useState<any>({});

  const percent = state?.progress?.elapsed / state?.progress?.duration || undefined;

  useEffect(() => {
    const listener = player.addPlaybackProgressListener((progress) => {
      setState((obj) => ({ ...obj, progress }));
    });

    const playback = player.addPlaybackStateListener((playbackState) => {
      if (playbackState?.newPlaybackState) {
        setState((obj) => ({ ...obj, playback: playbackState?.newPlaybackState }));
      }
    });

    return () => {
      listener.remove();
      playback.remove();
    };
  });

  return { ...state, percent };
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

const DEFAULT_PLAYBACK_HEIGHT = 64;

export default function PlaybackBar() {
  const bottomSheetIndexRef = useRef<number>(1);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const context = useSelector(PlaybackMachine, ({ context }) => context);
  const playbackState = usePlaybackState();

  const playpause = () => {
    PlaybackMachine.send({ type: 'PLAYPAUSE' });
  };

  const activeTrack = context.queue[context.activeTrackIndex];

  // console.log('hi', player.DEBUG_STATE);

  const toggleSheet = () => {
    if (bottomSheetIndexRef.current === 1) {
      bottomSheetRef.current?.collapse();
    } else {
      bottomSheetRef.current?.expand();
    }
  };

  return (
    <BottomSheet
      snapPoints={[DEFAULT_PLAYBACK_HEIGHT, '80%']}
      ref={bottomSheetRef}
      index={0}
      onChange={(index) => (bottomSheetIndexRef.current = index)}
      handleComponent={() => (
        <View className="relative h-1 w-full bg-relisten-blue-800">
          <MotiView
            // from={{ width: '100%' }}
            // animate={{ width: '25%' }}
            // from={{ width: 0, }}
            animate={{ width: (playbackState.percent ?? 0) * 250 }}
            className="absolute bottom-0 left-0 top-0 h-full w-full bg-relisten-blue-700"
          ></MotiView>
        </View>
      )}
      // snapPoints={snapPoints}
      // onChange={handleSheetChanges}
    >
      <View className="relative flex-1 bg-relisten-blue-700">
        <Pressable onPress={toggleSheet}>
          <Flex cn="h-[64px] items-center gap-1">
            <TouchableOpacity onPress={() => PlaybackMachine.send({ type: 'SKIP_BACK' })}>
              <MaterialIcons name="skip-previous" size={32} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={playpause}>
              {context.playbackState === 'Playing' ? (
                <MaterialIcons name="pause" size={32} color="white" />
              ) : (
                <MaterialIcons name="play-arrow" size={32} color="white" />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => PlaybackMachine.send({ type: 'SKIP_FORWARD' })}>
              <MaterialIcons name="skip-next" size={32} color="white" />
            </TouchableOpacity>
            <Flex column>
              <RelistenText className="text-lg font-semibold">
                {activeTrack?.title ?? 'No Active Track'}
              </RelistenText>
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
            </Flex>
          </Flex>
        </Pressable>
        <Flex cn="flex-1 bg-relisten-blue-800" center>
          <RelistenText>{JSON.stringify(context.playbackState, null, 2)}</RelistenText>
          <RelistenText>{JSON.stringify(context.activeTrackIndex, null, 2)}</RelistenText>
          <RelistenButton textClassName="text-sm" onPress={() => player.seekTo(0.98)}>
            (Seek To 98%!)
          </RelistenButton>
        </Flex>
      </View>
    </BottomSheet>
  );
}
