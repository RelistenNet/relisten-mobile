import { Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { player } from '@/modules/relisten-audio-player';
import { usePlaybackState } from '@/relisten/components/PlaybackBar';
import { RelistenText } from '@/relisten/components/relisten_text';

export default function Page() {
  const playbackState = usePlaybackState();

  // const play = () => {
  //   player.play({ url: 'https://phish.in/audio/000/012/258/12258.mp3', identifier: '1' });
  //   player.setNextStream({ url: 'https://phish.in/audio/000/012/259/12259.mp3', identifier: '2' });

  //   // setTimeout(() => {
  //   //   player.pause();
  //   // }, 20000);
  // };

  return (
    <SafeAreaView>
      {/* <TouchableOpacity onPress={play} disabled={playbackState.playback}>
        <Text className="rounded bg-red-500 p-12 text-white">play test</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => player.resume()}
        disabled={playbackState.playback === 'Playing'}
      >
        <Text className="rounded bg-yellow-500 p-12 text-white">RESUME</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => player.seekTo(0.95)}>
        <Text className="rounded bg-green-500 p-12 text-white">skip to 95%</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => player.pause()}
        disabled={playbackState.playback === 'Paused'}
      >
        <Text className="rounded bg-orange-500 p-12 text-white">pause</Text>
      </TouchableOpacity> */}

      <RelistenText>{JSON.stringify(playbackState, null, 2)}</RelistenText>
    </SafeAreaView>
  );
}
