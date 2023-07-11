import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
};
export default function ArtistsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Artists',
          headerStyle: {
            backgroundColor: 'green',
          },
        }}
      />
      <Stack.Screen
        name="[artistUuid]/index"
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="[artistUuid]/venues"
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="[artistUuid]/[yearUuid]/index"
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="[artistUuid]/[yearUuid]/[showUuid]/index"
        options={{
          title: '',
        }}
      />
    </Stack>
  );
}
