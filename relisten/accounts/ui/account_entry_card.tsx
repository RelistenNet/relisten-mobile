import { useAccount } from '@/relisten/accounts/account_context';
import { AccountAvatar } from '@/relisten/accounts/ui/account_avatar';
import { useAccountSyncSummary } from '@/relisten/accounts/ui/sync_status';
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
 * The account's place on My Library. Signed in, a quiet line that leads to the
 * Relisten tab, where account settings live. Signed out, an offer to sign in,
 * shown only once there is something worth saving and until it is dismissed.
 */
export function AccountEntryCard() {
  const { profile, status } = useAccount();

  if (status === 'restoring') {
    return null;
  }
  if (status === 'signedIn' && profile) {
    return <SignedInLine username={profile.username} />;
  }
  return <SignInPrompt />;
}

function SignedInLine({ username }: { username: string }) {
  const router = useRouter();
  const summary = useAccountSyncSummary();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`@${username}, ${summary.label}`}
      accessibilityHint="Opens account settings on the Relisten tab"
      className="mb-2 flex-row items-center px-4 py-2"
      onPress={() => router.navigate('/relisten/tabs/(relisten)')}
    >
      <AccountAvatar username={username} size={28} />
      <RelistenText className="ml-3 shrink font-semibold" numberOfLines={1}>
        @{username}
      </RelistenText>
      <RelistenText className={`ml-2 shrink text-sm ${summary.textClassName}`} numberOfLines={1}>
        {summary.label}
      </RelistenText>
      <View className="flex-1" />
      <MaterialIcons color="#9ca3af" name="chevron-right" size={22} />
    </TouchableOpacity>
  );
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
        onPress={() => router.push('/relisten/account')}
      >
        Sign In
      </RelistenButton>
    </View>
  );
}
