import React, { PropsWithChildren, useContext, useEffect, useState } from 'react';
import { RelistenPlayer, RelistenPlayerReportTrackEvent } from '@/relisten/player/relisten_player';

export interface RelistenPlayerProps {
  player: RelistenPlayer;
}

export const RelistenPlayerContext = React.createContext<RelistenPlayerProps>({
  player: RelistenPlayer.DEFAULT_INSTANCE,
});
export const RelistenPlayerProvider = ({ children }: PropsWithChildren<object>) => {
  return (
    <RelistenPlayerContext.Provider value={{ player: RelistenPlayer.DEFAULT_INSTANCE }}>
      {children}
    </RelistenPlayerContext.Provider>
  );
};
export const useRelistenPlayer = () => {
  const context = useContext(RelistenPlayerContext);

  if (context === undefined) {
    throw new Error('useRelistenPlayer must be used within a RelistenPlayerProvider');
  }

  return context.player;
};

export function useRelistenPlayerPlaybackState() {
  const player = useRelistenPlayer();

  const [playbackState, setPlaybackState] = useState(player.state);

  useEffect(() => {
    const teardown = player.onStateChanged.addListener((newPlaybackState) => {
      setPlaybackState(newPlaybackState);
    });

    return () => {
      teardown();
    };
  }, [player, setPlaybackState]);

  return playbackState;
}

export function useRelistenReportTrackEvent() {
  const player = useRelistenPlayer();

  const [reportTrackEvent, setReportTrackEvent] = useState<
    RelistenPlayerReportTrackEvent | undefined
  >(undefined);

  useEffect(() => {
    const teardown = player.onShouldReportTrack.addListener((newReportTrackEvent) => {
      setReportTrackEvent(newReportTrackEvent);
    });

    return () => {
      teardown();
    };
  }, [player, setReportTrackEvent]);

  return reportTrackEvent;
}
