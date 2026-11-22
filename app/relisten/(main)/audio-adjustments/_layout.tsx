import { AudioAdjustmentEditingProvider } from '@/relisten/player/audio_adjustments/audio_adjustment_editing';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/stack';

export default function AudioAdjustmentsLayout() {
  if (!audioAdjustmentNative.capabilities().supported) {
    return <Redirect href="/relisten/tabs/(relisten)" />;
  }

  return (
    <AudioAdjustmentEditingProvider>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: RelistenBlue[950] },
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: RelistenBlue[950] },
          headerTintColor: 'white',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="equalizer" />
        <Stack.Screen name="presets" />
      </Stack>
    </AudioAdjustmentEditingProvider>
  );
}
