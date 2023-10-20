import { FlatList } from 'react-native';
import { SourceTrackComponent } from '@/relisten/components/SourceTrackComponent';
import { useRelistenPlayer } from '@/relisten/player/relisten_player';
import { useNativePlaybackCurrentTrackIdentifier } from '@/relisten/player/native_playback_state_hooks';

export default function PlaybackQueue() {
  const { player } = useRelistenPlayer();
  // used purely as a re-render hook.
  const _ = useNativePlaybackCurrentTrackIdentifier();

  const queue = player.queue.orderedTracks;

  const jumpToTrack = (trackIndex: number) => {
    console.log('jump to', trackIndex);

    player.queue.playTrackAtIndex(trackIndex);
  };

  return (
    <FlatList
      data={queue}
      renderItem={({ item, index }) => (
        <SourceTrackComponent
          key={item.identifier}
          sourceTrack={item.sourceTrack}
          isLastTrackInSet={index == queue.length - 1}
          playShow={() => jumpToTrack(index)}
        />
      )}
    />
  );
}
