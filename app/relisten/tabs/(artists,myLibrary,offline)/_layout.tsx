import { useRelistenPlayerBottomBarContext } from '@/relisten/player/ui/player_bottom_bar';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useGroupSegment } from '@/relisten/util/routes';
import { MaterialIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { useEffect } from 'react';
import { Image, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';

export const unstable_settings = {
  initialRouteName: 'index',
};

const TITLES = {
  '(artists)': 'Artists',
  '(myLibrary)': 'My Library',
  '(offline)': 'Offline',
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
          title: TITLES[groupSegment ?? '(artists)'],
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
            return groupSegment == '(artists)' ? (
              <Image
                source={require('@/assets/Relisten White.png')}
                style={{ width: '100%', height: 28 }}
                resizeMode="contain"
              />
            ) : (
              <View className="flex flex-1 items-center justify-center">
                <RelistenText className="text-lg font-bold">{children}</RelistenText>
              </View>
            );
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
        name="[artistUuid]/venue/[venueUuid]/index"
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
          headerRight: () => <MaterialIcons name="more-horiz" color="white" size={24} />,
        }}
      />
      <Stack.Screen
        name="[artistUuid]/show/[showUuid]/sources/index"
        options={{
          title: '',
        }}
      />
      <Stack.Screen
        name="[artistUuid]/tour/[tourUuid]/index"
        options={{
          title: '',
        }}
      />
      <Stack.Screen name="[artistUuid]/song/[songUuid]/index" options={{ title: '' }} />
      <Stack.Screen name="history/tracks" options={{ title: 'My History' }} />
    </Stack>
  );
}
