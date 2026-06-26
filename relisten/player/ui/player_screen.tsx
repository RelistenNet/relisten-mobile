import { PlayerHeaderToolbar } from '@/relisten/player/ui/current_track_navigation_menu';
import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerQueueSheet } from '@/relisten/player/ui/player_queue_sheet';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack, useNavigation } from 'expo-router';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded';

type PlayerScreenProps = {
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ variant = 'modal' }: PlayerScreenProps) {
  const navigation = useNavigation();
  const isEmbedded = variant === 'embedded';
  const usesTransparentHeader = !isEmbedded && Platform.OS === 'ios';

  return (
    <>
      {!isEmbedded && (
        <>
          <Stack.Screen
            options={{
              title: 'Now Playing',
              contentStyle: { backgroundColor: 'transparent' },
              headerStyle: {
                backgroundColor: usesTransparentHeader ? 'transparent' : RelistenBlue['950'],
              },
              headerShadowVisible: false,
              headerTintColor: 'white',
              headerTitleStyle: { fontSize: 18, fontWeight: '600' },
              headerTransparent: usesTransparentHeader,
            }}
          />
          <PlayerHeaderToolbar onClose={() => navigation.goBack()} />
        </>
      )}
      <View className="flex-1 bg-relisten-blue-950">
        <PlayerBackground />
        <SafeAreaView
          className="flex-1"
          edges={isEmbedded ? ['top', 'bottom'] : ['bottom']}
          style={{ zIndex: 1 }}
        >
          <PlayerQueueSheet usesTransparentHeader={usesTransparentHeader} />
        </SafeAreaView>
      </View>
    </>
  );
}
