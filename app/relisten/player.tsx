import { usePlayerSheetControls } from '@/relisten/player/ui/player_sheet_state';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

export default function Page() {
  const { expand } = usePlayerSheetControls();
  const queueTracks = useRelistenPlayerQueueOrderedTracks();
  const navigation = useNavigation();
  const router = useRouter();
  const hasHandledRedirect = useRef(false);

  useEffect(() => {
    if (hasHandledRedirect.current) {
      return;
    }
    hasHandledRedirect.current = true;

    // Compatibility-only route: expanded player UI is hosted in /relisten/tabs.
    if (queueTracks.length > 0) {
      expand();
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace('/relisten/tabs');
  }, [expand, navigation, queueTracks.length, router]);

  return null;
}
