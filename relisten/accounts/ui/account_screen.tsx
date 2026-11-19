import { usernamePath, useAccountTab } from '@/relisten/accounts/ui/account_routes';
import { useAccount } from '@/relisten/accounts/account_context';
import type { AccountProvider } from '@/relisten/accounts/auth/account_auth_types';
import { accountErrorMessage } from '@/relisten/accounts/ui/account_error_notice';
import { usePostSignInPrompts } from '@/relisten/accounts/ui/post_sign_in_prompts';
import { useProviderSignIn } from '@/relisten/accounts/ui/provider_sign_in';
import { SignedInAccountScreen } from '@/relisten/accounts/ui/signed_in_account_screen';
import { SignedOutAccountScreen } from '@/relisten/accounts/ui/signed_out_account_screen';
import { isAccountWaitingToRestore } from '@/relisten/accounts/ui/sync_status';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useFavoriteSyncStatus } from '@/relisten/library/favorite_hooks';
import { useAccountDataCounts } from '@/relisten/accounts/ui/account_data_counts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

export function AccountScreen() {
  const account = useAccount();
  const syncStatus = useFavoriteSyncStatus();
  const {
    anonymousImport,
    errorMessage: promptError,
    presentImportPrompt,
  } = usePostSignInPrompts();
  const router = useRouter();
  const tab = useAccountTab();
  const [actionError, setActionError] = useState<string | null>(null);
  const [switchingProvider, setSwitchingProvider] = useState<AccountProvider | null>(null);
  const providerSignIn = useProviderSignIn();
  const [transitioning, setTransitioning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const accountData = useAccountDataCounts(account.profile?.userId ?? null);

  const switchAccount = async (provider: AccountProvider) => {
    setTransitioning(true);
    setActionError(null);
    account.clearError();
    setSwitchingProvider(provider);

    try {
      await account.switchAccount(provider);
    } catch (error) {
      setActionError(accountErrorMessage(error));
    }

    setSwitchingProvider(null);
    setTransitioning(false);
  };

  const confirmSwitchAccount = () => {
    Alert.alert(
      'Switch account?',
      "Playback will stop and this account's favorites will be hidden. Downloads stay on this device. If you cancel sign-in, Relisten stays signed out.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use Apple', onPress: () => void switchAccount('apple') },
        { text: 'Use Google', onPress: () => void switchAccount('google') },
      ]
    );
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your synced favorites stay with your account, and downloads stay on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            setTransitioning(true);
            setActionError(null);
            void account
              .signOut()
              .catch((error) => setActionError(accountErrorMessage(error)))
              .finally(() => setTransitioning(false));
          },
        },
      ]
    );
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setActionError(null);
    account.clearError();

    try {
      // An unconfirmed deletion explains itself through the account error.
      const result = await account.deleteAccount();
      if (result === 'deleting') {
        Alert.alert(
          'Deleting your account',
          'Relisten is deleting your account and everything saved to it. This device is signed out.'
        );
      }
    } catch (error) {
      setActionError(accountErrorMessage(error));
    }

    setDeleting(false);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      `This permanently deletes @${account.profile?.username} and everything saved to it: ${accountData.summary}. It can't be undone. Downloads and listening history stay on this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Account', style: 'destructive', onPress: () => void deleteAccount() },
      ]
    );
  };

  if (account.status === 'restoring') {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-relisten-blue-900 p-6">
        <ActivityIndicator color="white" size="large" />
        <RelistenText className="text-gray-300">Checking your account...</RelistenText>
      </View>
    );
  }

  if (account.status !== 'signedIn' || !account.profile) {
    return (
      <SignedOutAccountScreen
        busy={account.status === 'signingIn' || transitioning}
        errorMessage={
          providerSignIn.error ??
          actionError ??
          (account.error ? accountErrorMessage(account.error) : undefined)
        }
        onSignIn={async (provider) => {
          setActionError(null);
          await providerSignIn.signIn(provider);
        }}
        openingProvider={providerSignIn.openingProvider ?? switchingProvider}
      />
    );
  }

  const importAvailable =
    anonymousImport.state === 'available' || anonymousImport.state === 'deferred';
  const importInProgress = anonymousImport.state === 'importing';
  const accountIsWaitingToRestore = isAccountWaitingToRestore(account.error);
  const displayedSyncState =
    syncStatus.state === 'needsAttention'
      ? syncStatus.state
      : accountIsWaitingToRestore
        ? 'waiting'
        : syncStatus.state;
  const syncWaitingMessage = accountIsWaitingToRestore
    ? account.error?.code === 'credentials_temporarily_unavailable'
      ? account.error.message
      : 'Favorites are available on this device. Relisten will sync when your account is reachable.'
    : undefined;
  return (
    <SignedInAccountScreen
      actionError={
        actionError ??
        promptError ??
        (!accountIsWaitingToRestore && account.error
          ? accountErrorMessage(account.error)
          : undefined)
      }
      anonymousFavoriteCount={anonymousImport.anonymousFavoriteCount}
      importAvailable={importAvailable}
      importInProgress={importInProgress}
      lastSuccessfulSyncAt={syncStatus.lastSuccessfulSyncAt}
      onImportFavorites={presentImportPrompt}
      onDiscardRejectedFavorites={syncStatus.discardRejected}
      onReviewUsername={() => router.push(usernamePath(tab))}
      onRetryFavoriteSync={syncStatus.retryFailed}
      onSignOut={confirmSignOut}
      onDeleteAccount={confirmDeleteAccount}
      deleting={deleting}
      onSwitchAccount={confirmSwitchAccount}
      pendingUsername={account.pendingUsername}
      pendingSyncCount={syncStatus.pendingCount}
      syncFailure={syncStatus.failure}
      syncState={displayedSyncState}
      syncWaitingMessage={syncWaitingMessage}
      transitioning={transitioning || deleting}
      username={account.profile.username}
      usernameReviewNeeded={account.profile.usernameReviewNeeded}
    />
  );
}
