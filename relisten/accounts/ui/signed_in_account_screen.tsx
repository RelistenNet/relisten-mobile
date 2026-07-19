import { AccountErrorNotice } from '@/relisten/accounts/ui/account_error_notice';
import { FavoriteSyncFailureNotice } from '@/relisten/accounts/ui/favorite_sync_failure_notice';
import {
  AccountSyncState,
  SyncStatusText,
  syncStatusLabel,
} from '@/relisten/accounts/ui/sync_status';
import { UnavailableFavoritesNotice } from '@/relisten/accounts/ui/unavailable_favorites_notice';
import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { SectionHeader } from '@/relisten/components/section_header';
import { ScrollView, View } from 'react-native';
import type { FavoriteSyncFailure } from '@/relisten/library/favorite_hooks';

type SignedInAccountScreenProps = {
  actionError?: string;
  anonymousFavoriteCount: number;
  importAvailable: boolean;
  importInProgress: boolean;
  lastSuccessfulSyncAt?: Date;
  onImportFavorites: () => void;
  onReviewUsername: () => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  pendingUsername: string | null;
  pendingSyncCount: number;
  syncFailure?: FavoriteSyncFailure;
  syncState: AccountSyncState;
  syncWaitingMessage?: string;
  onDiscardRejectedFavorites: () => void;
  onRetryFavoriteSync: () => void;
  transitioning: boolean;
  unavailableFavoriteCount: number;
  username: string;
  usernameReviewNeeded: boolean;
};

export function SignedInAccountScreen({
  actionError,
  anonymousFavoriteCount,
  importAvailable,
  importInProgress,
  lastSuccessfulSyncAt,
  onImportFavorites,
  onDiscardRejectedFavorites,
  onReviewUsername,
  onRetryFavoriteSync,
  onSignOut,
  onSwitchAccount,
  pendingUsername,
  pendingSyncCount,
  syncFailure,
  syncState,
  syncWaitingMessage,
  transitioning,
  unavailableFavoriteCount,
  username,
  usernameReviewNeeded,
}: SignedInAccountScreenProps) {
  const syncSubtitle =
    syncWaitingMessage ??
    (pendingSyncCount > 0
      ? `${pendingSyncCount} ${pendingSyncCount === 1 ? 'change' : 'changes'} saved on this device`
      : lastSuccessfulSyncAt
        ? `Last synced ${lastSuccessfulSyncAt.toLocaleString()}`
        : syncStatusLabel(syncState));

  return (
    <ScrollView className="flex-1 bg-relisten-blue-950">
      <Flex column className="pb-8">
        <View className="gap-1 p-6">
          <RelistenText className="text-3xl font-bold">@{username}</RelistenText>
          <RelistenText className="text-gray-400">
            This is your public Relisten username.
          </RelistenText>
        </View>

        {actionError && (
          <View className="px-4 pb-4">
            <AccountErrorNotice message={actionError} />
          </View>
        )}

        {usernameReviewNeeded && (
          <View className="px-4 pb-4">
            <View className="gap-3 rounded-lg border border-relisten-blue-600 bg-relisten-blue-900 p-4">
              <RelistenText className="font-semibold">
                Choose how you appear on Relisten
              </RelistenText>
              <RelistenText className="text-sm text-gray-300">
                {pendingUsername
                  ? `@${pendingUsername} is saved on this device and waiting to sync.`
                  : `@${username} already works. Review it now, or keep listening and decide later.`}
              </RelistenText>
              <RelistenButton intent="primary" onPress={onReviewUsername}>
                {pendingUsername ? 'Retry username' : 'Review username'}
              </RelistenButton>
            </View>
          </View>
        )}

        <SectionHeader title="Account" />
        <Flex column className="gap-5 p-4 pr-8">
          <RowWithAction
            title="Username"
            subtitle={
              pendingUsername
                ? `@${pendingUsername} is waiting to sync.`
                : usernameReviewNeeded
                  ? 'Your assigned username is ready to review.'
                  : 'Used when your name is shown publicly.'
            }
          >
            <RelistenButton intent="outline" onPress={onReviewUsername}>
              {pendingUsername ? 'Retry' : usernameReviewNeeded ? 'Review' : 'Change'}
            </RelistenButton>
          </RowWithAction>

          <RowWithAction title="Favorites sync" subtitle={syncSubtitle}>
            <SyncStatusText state={syncState} />
          </RowWithAction>

          {syncFailure && (
            <FavoriteSyncFailureNotice
              failure={syncFailure}
              onDiscardRejected={onDiscardRejectedFavorites}
              onRetry={onRetryFavoriteSync}
            />
          )}

          <UnavailableFavoritesNotice count={unavailableFavoriteCount} />

          {(importAvailable || importInProgress) && (
            <RowWithAction
              title="Favorites on this device"
              subtitle={`${anonymousFavoriteCount} ${
                anonymousFavoriteCount === 1 ? 'favorite is' : 'favorites are'
              } available to add to this account.`}
            >
              <RelistenButton disabled={importInProgress} onPress={onImportFavorites}>
                {importInProgress ? 'Adding...' : 'Add'}
              </RelistenButton>
            </RowWithAction>
          )}
        </Flex>

        <SectionHeader title="Account access" />
        <Flex column className="gap-3 p-4">
          <RelistenButton disabled={transitioning} intent="outline" onPress={onSwitchAccount}>
            Switch account
          </RelistenButton>
          <RelistenButton disabled={transitioning} intent="outline" onPress={onSignOut}>
            Sign out
          </RelistenButton>
        </Flex>
      </Flex>
    </ScrollView>
  );
}
