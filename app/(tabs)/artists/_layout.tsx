import PlaybackBar from '@/relisten/components/PlaybackBar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
};
export default function ArtistsLayout() {
  return (
    <>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Artists',
            headerStyle: {
              backgroundColor: RelistenBlue['950'],
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
          name="[artistUuid]/year/[yearUuid]/index"
          options={{
            title: '',
          }}
        />
        <Stack.Screen
          name="[artistUuid]/show/[showUuid]/index"
          options={{
            title: '',
          }}
        />
        <Stack.Screen
          name="[artistUuid]/show/[showUuid]/sources/index"
          options={{
            title: '',
          }}
        />
      </Stack>
      <PlaybackBar />
    </>
  );
}
