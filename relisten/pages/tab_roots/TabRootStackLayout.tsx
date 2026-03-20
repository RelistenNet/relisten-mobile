import { RelistenBlue } from '@/relisten/relisten_blue';
import { useNativeTabsStackContentInset } from '@/relisten/player/ui/player_bar_layout';
import { useGroupSegment } from '@/relisten/util/routes';
import { MaterialIcons } from '@expo/vector-icons';
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

export default function TabRootStackLayout() {
  const groupSegment = useGroupSegment();
  const currentTitle = TITLES[groupSegment ?? '(artists)'] ?? TITLES['(artists)'];
  const contentBottomInset = useNativeTabsStackContentInset();

  return (
    <View
      className="flex-1"
      style={contentBottomInset > 0 ? { paddingBottom: contentBottomInset } : undefined}
    >
      <View className="flex-1">
        <Stack screenOptions={{ headerShadowVisible: false, freezeOnBlur: true }}>
          <Stack.Screen
            name="index"
            options={{
              title: currentTitle,
              headerTitleAlign: 'center',
              headerLargeTitle: false,
              headerStyle: {
                backgroundColor: RelistenBlue['950'],
              },
              headerTitle: () => {
                return groupSegment === '(artists)' ? (
                  <Image
                    source={RelistenWhite}
                    onError={(error) =>
                      console.log('Image failed to load:', error.nativeEvent.error)
                    }
                    style={{
                      width: '100%',
                      height: 32,
                      marginTop: 4,
                    }}
                    resizeMode="contain"
                  />
                ) : (
                  <RelistenText className="text-lg font-bold">{currentTitle}</RelistenText>
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
      </View>
    </View>
  );
}
