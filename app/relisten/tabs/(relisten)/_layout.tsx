import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useGroupSegment } from '@/relisten/util/routes';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';

export const unstable_settings = {
  initialRouteName: 'index',
};

const TITLES = {
  '(artists)': 'Artists',
  '(downloaded)': 'Downloaded',
};

export default function ArtistsLayout() {
  const groupSegment = useGroupSegment();
  const bottomTabBarHeight = useBottomTabBarHeight();

  const { setTabBarHeight } = useRelistenPlayerBottomBarContext();

  useEffect(() => {
    setTabBarHeight(bottomTabBarHeight);
  }, [bottomTabBarHeight, setTabBarHeight]);

  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Relisten',
          headerStyle: {
            backgroundColor: RelistenBlue['950'],
          },
        }}
      />

      <Stack.Screen
        name="today"
        options={{
          title: 'Today in History',
        }}
      />
    </Stack>
  );
}
