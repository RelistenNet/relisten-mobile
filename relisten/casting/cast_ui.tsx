import type { ComponentProps } from 'react';
import { CastButton, CastState, useCastDevice, useCastState } from 'react-native-google-cast';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export function useRelistenCastStatus() {
  const castState = useCastState();
  const device = useCastDevice();

  const isCasting = castState === CastState.CONNECTED;
  const deviceName = device?.friendlyName;

  return { isCasting, deviceName };
}

export type RelistenCastButtonProps = ComponentProps<typeof CastButton> & {
  className?: string;
};

export function RelistenCastButton({ className, ...props }: RelistenCastButtonProps) {
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  if (!shouldMakeNetworkRequests) {
    return null;
  }

  return <CastButton className={className} {...props} />;
}
