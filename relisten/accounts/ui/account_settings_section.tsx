import { useAccount } from '@/relisten/accounts/account_context';
import { AccountAvatar } from '@/relisten/accounts/ui/account_avatar';
import { useAccountSyncSummary } from '@/relisten/accounts/ui/sync_status';
import { RelistenText } from '@/relisten/components/relisten_text';
import { MaterialIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { TouchableOpacity, View } from 'react-native';

/**
 * The first row of the Relisten tab, like the account row at the top of iOS
 * Settings. It opens the account screen, which is also where signing in starts.
 */
export function AccountSettingsSection() {
  const { pendingUsername, profile, status } = useAccount();
  const summary = useAccountSyncSummary();
  const signedIn = status === 'signedIn' && profile;

  const title = signedIn
    ? `@${profile.username}`
    : status === 'restoring'
      ? 'Checking your account…'
      : 'Sign in to Relisten';
  const subtitle = signedIn
    ? pendingUsername
      ? `@${pendingUsername} is waiting to sync`
      : profile.usernameReviewNeeded
        ? 'Choose how you appear on Relisten'
        : summary.label
    : 'Save your favorites and playlists to your account';

  return (
    <Link href="/relisten/account" push asChild>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}`}
        className="mx-4 mb-2 mt-4 flex-row items-center rounded-xl bg-relisten-blue-800 p-4"
        disabled={status === 'restoring'}
      >
        {signedIn ? (
          <AccountAvatar username={profile.username} size={48} />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded-full bg-relisten-blue-700">
            <MaterialIcons color="white" name="person" size={28} />
          </View>
        )}
        <View className="ml-3 min-w-0 flex-1">
          <RelistenText className="text-lg font-semibold" numberOfLines={1}>
            {title}
          </RelistenText>
          <RelistenText
            className={`text-sm ${signedIn && !pendingUsername && !profile.usernameReviewNeeded ? summary.textClassName : 'text-gray-400'}`}
            numberOfLines={2}
          >
            {subtitle}
          </RelistenText>
        </View>
        <MaterialIcons color="#9ca3af" name="chevron-right" size={24} />
      </TouchableOpacity>
    </Link>
  );
}
