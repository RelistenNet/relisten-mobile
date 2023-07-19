import { PropsWithChildren } from 'react';
import { PLAYBACK_SKELETON } from '../PlaybackBar';

export const ScrollScreen = ({ children }: PropsWithChildren) => {
  return (
    <>
      {children}
      <PLAYBACK_SKELETON />
    </>
  );
};
