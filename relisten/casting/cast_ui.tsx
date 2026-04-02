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

export function useIsCastAvailable() {
  const castState = useCastState();
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  return shouldMakeNetworkRequests && castState !== CastState.NO_DEVICES_AVAILABLE;
}

export type RelistenCastButtonProps = ComponentProps<typeof CastButton> & {
  className?: string;
};

export function RelistenCastButton({ className, ...props }: RelistenCastButtonProps) {
  const isCastAvailable = useIsCastAvailable();

  if (!isCastAvailable) {
    return null;
  }

  return <CastButton className={className} {...props} />;
}
