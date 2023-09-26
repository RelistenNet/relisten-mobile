import { useSelector } from '@xstate/react';

import { FlatList } from 'react-native';
import PlaybackMachine from '../machines/PlaybackMachine';
import { SourceTrackComponent } from '@/relisten/components/SourceTrackComponent';

export default function PlaybackQueue() {
  const context = useSelector(PlaybackMachine, ({ context }) => context);

  const queue = context.queue;

  if (!queue?.length) return null;

  const jumpToTrack = (trackIndex: number) => {
    console.log('jump to', trackIndex);

    PlaybackMachine.send({ type: 'SKIP_TO', trackIndex });
  };

  return (
    <FlatList
      data={queue}
      renderItem={({ item, index }) => (
        <SourceTrackComponent
          key={item.identifier}
          sourceTrack={item}
          isLastTrackInSet={index == queue.length - 1}
          playShow={() => jumpToTrack(index)}
        />
      )}
    />
  );
}
