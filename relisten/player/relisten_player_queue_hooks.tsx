import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import React, { useEffect, useState } from 'react';
import {
  PlayerQueueTrack,
  PlayerRepeatState,
  PlayerShuffleState,
} from '@/relisten/player/relisten_player_queue';

export function useRelistenPlayerQueue() {
  const player = useRelistenPlayer();

  return player.queue;
}

export function useRelistenPlayerQueueOrderedTracks() {
  const queue = useRelistenPlayerQueue();

  const [orderedTracks, setOrderedTracks] = useState(queue.orderedTracks);

  useEffect(() => {
    const teardown = queue.onOrderedTracksChanged.addListener((orderedTracks) => {
      setOrderedTracks(orderedTracks);
    });

    return () => {
      teardown();
    };
  }, [queue, setOrderedTracks]);

  return orderedTracks;
}

export function useRelistenPlayerShuffleState(): [
  PlayerShuffleState,
  React.Dispatch<React.SetStateAction<PlayerShuffleState>>,
] {
  const queue = useRelistenPlayerQueue();

  const [shuffleState, setShuffleState] = useState(queue.shuffleState);

  useEffect(() => {
    const teardown = queue.onShuffleStateChanged.addListener((newShuffleState) => {
      setShuffleState(newShuffleState);
    });

    return () => {
      teardown();
    };
  }, [queue, setShuffleState]);

  return [shuffleState, setShuffleState];
}

export function useRelistenPlayerRepeatState(): [
  PlayerRepeatState,
  React.Dispatch<React.SetStateAction<PlayerRepeatState>>,
] {
  const queue = useRelistenPlayerQueue();

  const [repeatState, setRepeatState] = useState(queue.repeatState);

  useEffect(() => {
    const teardown = queue.onRepeatStateChanged.addListener((newShuffleState) => {
      setRepeatState(newShuffleState);
    });

    return () => {
      teardown();
    };
  }, [queue]);

  return [repeatState, setRepeatState];
}

export function useRelistenPlayerCurrentTrack(): PlayerQueueTrack | undefined {
  const queue = useRelistenPlayerQueue();

  const [currentTrack, setCurrentTrack] = useState(() => queue.currentTrack);

  useEffect(() => {
    const teardown = queue.onCurrentTrackChanged.addListener((newCurrentTrack) => {
      console.log('setCurrentTrack', newCurrentTrack);
      setCurrentTrack(newCurrentTrack);
    });

    return () => {
      teardown();
    };
  }, [queue, setCurrentTrack]);

  return currentTrack;
}
