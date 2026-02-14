import {
  LEGACY_TAB_INSET_REPORTER,
  useTabInsetReporter,
} from '@/relisten/player/ui/tab_inset_adapter';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useGroupSegment } from '@/relisten/util/routes';
import { useIsDesktopLayout } from '@/relisten/util/layout';
import { MaterialIcons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { Image, View } from 'react-native';
import { RelistenText } from '@/relisten/components/relisten_text';
import RelistenWhite from '@/assets/relisten_white.png';

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
  const isDesktopLayout = useIsDesktopLayout();
  const tabInsetBottom = isDesktopLayout ? 0 : bottomTabBarHeight;

  useTabInsetReporter(LEGACY_TAB_INSET_REPORTER.libraryGroup, tabInsetBottom);

  return (
    <Stack screenOptions={{ headerShadowVisible: false }}>
      <Stack.Screen
        name="index"
        options={{
          title: TITLES[groupSegment ?? '(artists)'],
          headerTitleAlign: 'center',
          headerLargeTitle: false,
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
                source={RelistenWhite}
                onError={(error) => console.log('Image failed to load:', error.nativeEvent.error)}
                style={{
                  width: '100%',
                  height: 32,
                  marginTop: 4,
                }}
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
