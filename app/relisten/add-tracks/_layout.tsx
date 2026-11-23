import { useGlobalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useState } from 'react';
import { View } from 'react-native';
import { RelistenBlue } from '@/relisten/relisten_blue';
import { AddTracksProvider } from '@/relisten/search/ui/add_tracks_context';
import { AddTracksNoticeBar } from '@/relisten/search/ui/add_tracks_controls';
import { isRelistenTabGroupSegment } from '@/relisten/util/routes';

/**
 * Add Tracks: a sheet with its own stack (results, a venue's or song's shows,
 * a setlist, other recordings) that adds files to one playlist. The stack
 * draws the header, so the sheet's own header stays hidden, and the notice
 * bar sits over every screen because the sheet covers the app's toast.
 */
export default function AddTracksLayout() {
  const params = useGlobalSearchParams<{ playlistId: string; tab?: string }>();
  // Global params follow the focused screen, and inner screens push their own,
  // so the sheet keeps the playlist and tab it was opened with.
  const [destination] = useState(() => ({
    playlistId: String(params.playlistId),
    tab: params.tab && isRelistenTabGroupSegment(params.tab) ? params.tab : '(myLibrary)',
  }));

  return (
    <AddTracksProvider playlistId={destination.playlistId} tab={destination.tab}>
      <View className="flex-1">
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: RelistenBlue[900] },
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: RelistenBlue[900] },
            headerTintColor: 'white',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="shows" />
          <Stack.Screen name="source" />
          <Stack.Screen name="recordings" />
        </Stack>
        <AddTracksNoticeBar />
      </View>
    </AddTracksProvider>
  );
}
