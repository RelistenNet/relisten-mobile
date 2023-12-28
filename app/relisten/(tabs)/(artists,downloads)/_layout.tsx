import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack } from 'expo-router/stack';

export const unstable_settings = {
  initialRouteName: 'index',
};
interface ArtistsLayoutProps {
  segment: '(artists)' | '(downloads)';
}
export default function ArtistsLayout({ segment }: ArtistsLayoutProps) {
  console.log(segment);

  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
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
        name="[artistUuid]/show/[showUuid]/source/[sourceUuid]/index"
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
  );
}
