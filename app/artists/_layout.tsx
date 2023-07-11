import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
};
export default function ArtistsLayout() {
  console.log('STACK');

  return (
    <Stack screenOptions={{ headerShown: false, title: 'Artists' }}>
      <Stack.Screen name="index" options={{ title: 'Artists' }} />
      <Stack.Screen name="[uuid]" options={{ title: 'Years' }} />
    </Stack>
  );
}
