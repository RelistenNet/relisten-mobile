import {
  LEGACY_TAB_INSET_REPORTER,
  useTabInsetReporter,
} from '@/relisten/player/ui/tab_inset_adapter';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Stack } from 'expo-router/stack';
import { Image } from 'react-native';
import RelistenWhite from '@/assets/relisten_white.png';
import { useIsDesktopLayout } from '@/relisten/util/layout';

export default function ArtistsLayout() {
  const bottomTabBarHeight = useBottomTabBarHeight();
  const isDesktopLayout = useIsDesktopLayout();
  const tabInsetBottom = isDesktopLayout ? 0 : bottomTabBarHeight;

  useTabInsetReporter(LEGACY_TAB_INSET_REPORTER.relistenGroup, tabInsetBottom);

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
