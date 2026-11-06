import { NonIdealState } from '@/relisten/components/non_ideal_state';
import {
  usePlayerBarPlacementBackend,
  usePlayerBarVisualHeight,
} from '@/relisten/player/ui/player_bar_layout';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function OfflineArtistsEmptyState() {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const playerPlacement = usePlayerBarPlacementBackend();
  const playerHeight = usePlayerBarVisualHeight();

  return (
    <View
      className="flex-1"
      // iOS plain views extend behind the header and native tabs/accessory.
      // An overlay player isn't included in the screen's safe-area inset.
      style={{
        paddingTop: Platform.OS === 'ios' ? headerHeight : 0,
        paddingBottom:
          (Platform.OS === 'ios' ? insets.bottom : 0) +
          (playerPlacement === 'overlay' ? playerHeight : 0),
      }}
    >
      <NonIdealState
        icon="cloud-off"
        title="No offline shows yet"
        description="Download tracks from any show and they'll appear here for offline playback."
        actionText="Browse artists"
        onAction={() => router.navigate('/relisten/tabs/(artists)')}
      />
    </View>
  );
}
