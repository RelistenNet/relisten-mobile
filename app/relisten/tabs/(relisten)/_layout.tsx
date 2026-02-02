import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { Image } from 'react-native';
import RelistenWhite from '@/assets/relisten_white.png';
import { useIsDesktopLayout } from '@/relisten/util/layout';

export default function ArtistsLayout() {
  const bottomTabBarHeight = useBottomTabBarHeight();
  const isDesktopLayout = useIsDesktopLayout();

  const { setTabBarHeight } = useRelistenPlayerBottomBarContext();

  useEffect(() => {
    setTabBarHeight(isDesktopLayout ? 0 : bottomTabBarHeight);
  }, [bottomTabBarHeight, isDesktopLayout, setTabBarHeight]);

  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Relisten',
          headerTitleAlign: 'center',
          headerLargeTitle: false,
          headerStyle: {
            backgroundColor: RelistenBlue['950'],
          },
          headerTitle: () => {
            return (
              <Image
                source={RelistenWhite}
                style={{ width: '100%', height: 32, marginTop: 4 }}
                resizeMode="contain"
              />
            );
          },
        }}
      />

      <Stack.Screen
        name="recently-played"
        options={{
          title: 'Recently Played',
        }}
      />
    </Stack>
  );
}
