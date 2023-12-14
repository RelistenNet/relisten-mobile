// import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Stack } from 'expo-router/stack';
import { RelistenBlue } from '@/relisten/relisten_blue';

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="player"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: true,
          headerStyle: { backgroundColor: RelistenBlue['900'] },
        }}
      />
    </Stack>
  );
}
