import { useNativeTabsBottomInset } from '@/relisten/player/ui/native_tabs_inset';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { RelistenNavigationProvider } from '@/relisten/util/routes';
import { Stack } from 'expo-router/stack';
import { Image, Platform, View } from 'react-native';
import RelistenWhite from '@/assets/relisten_white.png';

export default function ArtistsLayout() {
  const nativeTabsBottomInset = useNativeTabsBottomInset();
  const contentBottomInset = Platform.OS === 'android' ? nativeTabsBottomInset : 0;

  return (
    <RelistenNavigationProvider groupSegment="(artists)">
      <View
        className="flex-1"
        style={contentBottomInset > 0 ? { paddingBottom: contentBottomInset } : undefined}
      >
        <View className="flex-1">
          <Stack screenOptions={{ headerShadowVisible: false, freezeOnBlur: true }}>
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
        </View>
      </View>
    </RelistenNavigationProvider>
  );
}
