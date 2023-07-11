import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
};
export default function ArtistsLayout() {
  console.log('STACK');

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
        name="[uuid]/index"
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="[uuid]/venues"
        options={{
          title: '',
        }}
      />
    </Stack>
  );
}
