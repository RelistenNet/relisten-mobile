import { FlatList } from 'react-native';
import { SourceTrackComponent } from '@/relisten/components/SourceTrackComponent';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';

export default function PlaybackQueue() {
  const player = useRelistenPlayer();
  const orderedTracks = useRelistenPlayerQueueOrderedTracks();

  const jumpToTrack = (trackIndex: number) => {
    player.queue.playTrackAtIndex(trackIndex);
  };

  return (
    <FlatList
      data={orderedTracks}
      renderItem={({ item, index }) => (
        <SourceTrackComponent
          key={item.identifier}
          sourceTrack={item.sourceTrack}
          isLastTrackInSet={index == orderedTracks.length - 1}
          playShow={() => jumpToTrack(index)}
        />
      )}
    />
  );
}
