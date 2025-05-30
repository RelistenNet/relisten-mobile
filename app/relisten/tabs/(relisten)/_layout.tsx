import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { Image } from 'react-native';

export default function ArtistsLayout() {
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
          headerTitle: ({
            children,
          }: {
            /**
             * The title text of the header.
             */
            children: string;
            /**
             * Tint color for the header.
             */
            tintColor?: string;
          }) => {
            return (
              <Image
                source={require('@/assets/Relisten White.png')}
                style={{ width: '100%', height: 28 }}
                resizeMode="contain"
              />
            );
          },
        }}
      />

      <Stack.Screen
        name="today"
        options={{
          title: 'Today in History',
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
