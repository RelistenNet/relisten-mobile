import { SectionHeader } from '@/relisten/components/section_header';
import { accountPath } from '@/relisten/accounts/ui/account_routes';
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
        : summary.label || 'Account, sync and diagnostics'
    : 'Save your favorites and playlists to your account';

  return (
    <>
      <SectionHeader title="Account" />
      <Link href={accountPath('(relisten)')} push asChild>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${subtitle}`}
          className="flex-row items-center px-4 py-3"
          disabled={status === 'restoring'}
        >
          {signedIn ? (
            <AccountAvatar username={profile.username} size={48} />
          ) : (
            <MaterialIcons color="white" name="account-circle" size={48} />
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
    </>
  );
}
