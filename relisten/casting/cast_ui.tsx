import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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

export function RelistenCastButton({
  className,
  style,
  tintColor = 'white',
  ...props
}: RelistenCastButtonProps) {
  const castState = useCastState();
  const shouldRenderCastButton = useShouldRenderCastButton();

  if (!shouldRenderCastButton) {
    return null;
  }

  return (
    <View className={className} style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
      <View pointerEvents="none" accessible={false} accessibilityElementsHidden>
        {castState === CastState.CONNECTING ? (
          <ActivityIndicator size="small" color={tintColor} />
        ) : (
          <MaterialIcons
            name={castState === CastState.CONNECTED ? 'cast-connected' : 'cast'}
            size={20}
            color={tintColor}
          />
        )}
      </View>
      {/* The SDK owns the full touch target and discovery; draw its glyph at the app's size.
          Keep alpha above UIKit's hit-testing threshold so the native button receives taps. */}
      <CastButton
        {...props}
        style={[StyleSheet.absoluteFill, { opacity: 0.02 }]}
        tintColor={tintColor}
      />
    </View>
  );
}
