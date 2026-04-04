import type { ComponentProps } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { CastButton, CastState, useCastDevice, useCastState } from 'react-native-google-cast';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

export function useRelistenCastStatus() {
  const castState = useCastState();
  const device = useCastDevice();

  const isCasting = castState === CastState.CONNECTED;
  const deviceName = device?.friendlyName;

  return { isCasting, deviceName };
}

export function useShouldRenderCastButton() {
  const { type } = useNetInfo();
  const shouldMakeNetworkRequests = useShouldMakeNetworkRequests();

  // Discovery may intentionally start only after the first Cast-button tap on iOS,
  // so discovered-device state is the wrong signal for whether the button should exist.
  return shouldMakeNetworkRequests && (type === 'wifi' || type === 'ethernet');
}

export type RelistenCastButtonProps = ComponentProps<typeof CastButton> & {
  className?: string;
};

export function RelistenCastButton({ className, ...props }: RelistenCastButtonProps) {
  const shouldRenderCastButton = useShouldRenderCastButton();

  if (!shouldRenderCastButton) {
    return null;
  }

  return <CastButton className={className} {...props} />;
}
