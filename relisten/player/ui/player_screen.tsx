import { PlayerHeaderToolbar } from '@/relisten/player/ui/player_actions_menu';
import { PlayerBackground } from '@/relisten/player/ui/player_background';
import { PlayerOverlayHeader } from '@/relisten/player/ui/player_overlay_header';
import { PlayerQueueSheet } from '@/relisten/player/ui/player_queue_sheet';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { Stack, useNavigation } from 'expo-router';
import { Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PlayerScreenVariant = 'modal' | 'embedded' | 'overlay';

type PlayerScreenProps = {
  onClose?: () => void;
  variant?: PlayerScreenVariant;
};

export function PlayerScreen({ onClose, variant = 'modal' }: PlayerScreenProps) {
  const navigation = useNavigation();
  const isEmbedded = variant === 'embedded';
  const isOverlay = variant === 'overlay';
  const usesTransparentHeader = variant === 'modal' && Platform.OS === 'ios';
  const closePlayer = onClose ?? (() => navigation.goBack());

  return (
    <>
      {variant === 'modal' && (
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
          <PlayerHeaderToolbar onClose={closePlayer} />
        </>
      )}
      <View className="flex-1 bg-relisten-blue-950">
        <PlayerBackground />
        <SafeAreaView
          className="flex-1"
          edges={isEmbedded || isOverlay ? ['top'] : []}
          style={{ zIndex: 1 }}
        >
          {isOverlay && <PlayerOverlayHeader onClose={closePlayer} />}
          <PlayerQueueSheet
            allowsInteractiveDismiss={isOverlay}
            usesTransparentHeader={usesTransparentHeader}
          />
        </SafeAreaView>
      </View>
    </>
  );
}
