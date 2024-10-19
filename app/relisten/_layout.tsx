import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';

export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="player"
        options={{
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerShown: true,
          headerStyle: { backgroundColor: RelistenBlue['900'] },
        }}
      />
      <Stack.Screen name="tabs" />
    </Stack>
  );
}
