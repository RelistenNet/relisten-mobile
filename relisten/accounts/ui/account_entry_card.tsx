import { accountPath } from '@/relisten/accounts/ui/account_routes';
import { useAccount } from '@/relisten/accounts/account_context';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { usePlaylists } from '@/relisten/playlists/playlist_hooks';
import {
  useFavoriteCatalogUuids,
  useLibraryShowCatalogUuids,
} from '@/relisten/realm/root_services';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';

const DISMISSED_KEY = 'myLibrary.signInPromptDismissed';

/**
 * The account's place in My Library's content: nothing once signed in (the
 * header's account button covers that), and an offer to sign in otherwise,
 * shown only once there is something worth saving and until it is dismissed.
 */
export function AccountEntryCard() {
  const { status } = useAccount();
  return status === 'signedOut' ? <SignInPrompt /> : null;
}

function SignInPrompt() {
  const router = useRouter();
  const playlists = usePlaylists();
  const shows = useLibraryShowCatalogUuids();
  const artists = useFavoriteCatalogUuids('artist');
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    void AsyncStorage.getItem(DISMISSED_KEY).then((value) => setDismissed(value !== null));
  }, []);

  const hasLibrary = playlists.length > 0 || shows.size > 0 || artists.size > 0;
  if (dismissed !== false || !hasLibrary) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    void AsyncStorage.setItem(DISMISSED_KEY, new Date().toISOString());
  };

  return (
    <View className="mx-4 mb-4 rounded-lg border border-white/10 bg-relisten-blue-900 p-4">
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <RelistenText className="font-semibold">Keep your library safe</RelistenText>
          <RelistenText className="mt-1 text-sm text-gray-400">
            Sign in to save your favorites and playlists and use them on your other devices.
          </RelistenText>
        </View>
        <TouchableOpacity
          accessibilityLabel="Not now"
          accessibilityRole="button"
          className="-mr-2 -mt-2 h-11 w-11 items-center justify-center"
          onPress={dismiss}
        >
          <MaterialIcons color="#9ca3af" name="close" size={20} />
        </TouchableOpacity>
      </View>
      <RelistenButton
        className="mt-3 self-start"
        intent="primary"
        onPress={() => router.push(accountPath('(myLibrary)'))}
      >
        Sign In
      </RelistenButton>
    </View>
  );
}
