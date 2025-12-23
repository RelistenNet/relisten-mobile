import { PropsWithChildren } from 'react';
import { useRelistenPlayer } from '@/relisten/player/relisten_player_hooks';
import { useRelistenCastSession } from '@/relisten/casting/cast_session';

export const RelistenCastProvider = ({ children }: PropsWithChildren<object>) => {
  const player = useRelistenPlayer();
  useRelistenCastSession(player);

  return <>{children}</>;
};
