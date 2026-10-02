import { useAccount } from '@/relisten/accounts/account_context';
import { SyncStatusText, isAccountWaitingToRestore } from '@/relisten/accounts/ui/sync_status';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useFavoriteSyncStatus } from '@/relisten/library/favorite_hooks';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

export function AccountEntryCard() {
  const { error, pendingUsername, profile, status } = useAccount();
  const syncStatus = useFavoriteSyncStatus();
  const router = useRouter();
  const signedIn = status === 'signedIn' && profile;
  const syncState =
    syncStatus.state === 'needsAttention'
      ? syncStatus.state
      : isAccountWaitingToRestore(error)
        ? 'waiting'
        : syncStatus.state;

  const title = signedIn
    ? `@${profile.username}`
    : status === 'restoring'
      ? 'Checking your account...'
      : 'Sync your favorites';
  const description = signedIn
    ? pendingUsername
      ? `@${pendingUsername} is waiting to sync.`
      : profile.usernameReviewNeeded
        ? 'Review the username other listeners will see.'
        : 'Favorites stay available on your signed-in devices.'
    : 'Sign in to keep favorites available on your signed-in devices.';

  return (
    <View className="px-4 pb-4">
      <TouchableOpacity
        accessibilityHint="Opens Relisten account settings"
        accessibilityLabel={signedIn ? `Account ${title}` : 'Sync your favorites'}
        accessibilityRole="button"
        className="rounded-lg border border-white/10 bg-relisten-blue-900 p-4"
        disabled={status === 'restoring'}
        onPress={() => router.push('/relisten/account')}
      >
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1 gap-1">
            <RelistenText className="font-semibold">{title}</RelistenText>
            <RelistenText className="text-sm text-gray-400">{description}</RelistenText>
          </View>
          <View className="shrink-0 flex-row items-center gap-2">
            {signedIn && <SyncStatusText state={syncState} />}
            <MaterialIcons color="#9ca3af" name="chevron-right" size={24} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
