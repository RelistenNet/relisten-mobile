import { usePlayerBottomScrollViewProps } from '@/relisten/player/ui/player_bar_layout';
import { AccountErrorNotice } from '@/relisten/accounts/ui/account_error_notice';
import { AccountAvatar } from '@/relisten/accounts/ui/account_avatar';
import { FavoriteSyncFailureNotice } from '@/relisten/accounts/ui/favorite_sync_failure_notice';
import { relativeTime, SettingsGroup, SettingsRow } from '@/relisten/accounts/ui/settings_list';
import { AccountSyncState, syncStatusLabel } from '@/relisten/accounts/ui/sync_status';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RelistenText } from '@/relisten/components/relisten_text';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { FavoriteSyncFailure } from '@/relisten/library/favorite_hooks';
import { FavoriteDiagnostics } from '@/relisten/accounts/ui/favorite_diagnostics';
import { PlaylistDiagnostics, PlaylistSyncRow } from '@/relisten/accounts/ui/playlist_diagnostics';
import { ConnectedAppsGroup } from '@/relisten/accounts/ui/connected_apps';

type SignedInAccountScreenProps = {
  actionError?: string;
  anonymousFavoriteCount: number;
  importAvailable: boolean;
  importInProgress: boolean;
  lastSuccessfulSyncAt?: Date;
  onImportFavorites: () => void;
  onReviewUsername: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  deleting: boolean;
  onSwitchAccount: () => void;
  pendingUsername: string | null;
  pendingSyncCount: number;
  syncFailure?: FavoriteSyncFailure;
  syncState: AccountSyncState;
  syncWaitingMessage?: string;
  onDiscardRejectedFavorites: () => void;
  onRetryFavoriteSync: () => void;
  transitioning: boolean;
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
  onDeleteAccount,
  deleting,
  onSwitchAccount,
  pendingUsername,
  pendingSyncCount,
  syncFailure,
  syncState,
  syncWaitingMessage,
  transitioning,
  username,
  usernameReviewNeeded,
}: SignedInAccountScreenProps) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  // Keeps the last rows clear of the mini player now that this screen sits in a tab.
  const scrollProps = usePlayerBottomScrollViewProps({});
  const favoritesValue =
    pendingSyncCount > 0
      ? `${pendingSyncCount} ${pendingSyncCount === 1 ? 'change' : 'changes'} to save`
      : syncState === 'saved' && lastSuccessfulSyncAt
        ? `Up to date · ${relativeTime(lastSuccessfulSyncAt)}`
        : syncStatusLabel(syncState);

  return (
    <ScrollView className="flex-1 bg-relisten-blue-900" {...scrollProps}>
      <View className="items-center px-6 pb-6 pt-8">
        <AccountAvatar username={username} size={72} />
        <RelistenText className="mt-3 text-2xl font-bold">@{username}</RelistenText>
        <RelistenText className="mt-1 text-center text-gray-400">
          Your favorites and playlists sync to this account.
        </RelistenText>
      </View>

      {actionError && (
        <View className="px-4 pb-4">
          <AccountErrorNotice message={actionError} />
        </View>
      )}

      {usernameReviewNeeded && (
        <View className="px-4 pb-6">
          <View className="rounded-xl border border-relisten-blue-600 bg-relisten-blue-900 p-4">
            <RelistenText className="font-semibold">Choose how you appear on Relisten</RelistenText>
            <RelistenText className="mt-2 text-sm text-gray-300">
              {pendingUsername
                ? `@${pendingUsername} is saved on this device and waiting to sync.`
                : `@${username} already works. Review it now, or keep listening and decide later.`}
            </RelistenText>
            <RelistenButton className="mt-3" intent="primary" onPress={onReviewUsername}>
              {pendingUsername ? 'Retry username' : 'Review username'}
            </RelistenButton>
          </View>
        </View>
      )}

      <SettingsGroup title="Account">
        <SettingsRow
          label="Username"
          value={pendingUsername ? `@${pendingUsername} (waiting)` : `@${username}`}
          onPress={onReviewUsername}
        />
      </SettingsGroup>

      <SettingsGroup title="Sync">
        {!syncFailure && (
          <SettingsRow
            label="Favorites"
            value={favoritesValue}
            valueClassName={syncValueClass(syncState)}
          />
        )}
        <PlaylistSyncRow />
      </SettingsGroup>

      <ConnectedAppsGroup />

      {(importAvailable || importInProgress) && (
        <View className="mb-4 px-4">
          <RelistenButton disabled={importInProgress} onPress={onImportFavorites}>
            {importInProgress
              ? 'Adding favorites…'
              : `Add ${anonymousFavoriteCount} ${anonymousFavoriteCount === 1 ? 'favorite' : 'favorites'} from this device`}
          </RelistenButton>
        </View>
      )}

      {syncWaitingMessage && (
        <RelistenText className="-mt-2 mb-4 px-4 text-sm text-gray-400">
          {syncWaitingMessage}
        </RelistenText>
      )}
      {syncFailure && (
        <View className="mb-6 px-4">
          <FavoriteSyncFailureNotice
            failure={syncFailure}
            onDiscardRejected={onDiscardRejectedFavorites}
            onRetry={onRetryFavoriteSync}
          />
        </View>
      )}

      <View className="mb-4 mt-6 flex-row gap-3 px-4">
        <RelistenButton className="flex-1" disabled={transitioning} onPress={onSwitchAccount}>
          Switch Account
        </RelistenButton>
        <RelistenButton
          className="flex-1"
          disabled={transitioning}
          onPress={onSignOut}
          textClassName="text-red-300"
        >
          Sign Out
        </RelistenButton>
      </View>

      <View className="mb-4 px-4">
        <RelistenButton
          disabled={transitioning}
          onPress={onDeleteAccount}
          textClassName="text-red-300"
        >
          {deleting ? 'Deleting Account…' : 'Delete Account'}
        </RelistenButton>
      </View>

      <View className="mb-4 px-4">
        <RelistenButton intent="outline" onPress={() => setShowDiagnostics(!showDiagnostics)}>
          {showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}
        </RelistenButton>
      </View>
      {showDiagnostics && (
        <View className="pb-8">
          <FavoriteDiagnostics />
          <PlaylistDiagnostics />
        </View>
      )}
    </ScrollView>
  );
}

function syncValueClass(state: AccountSyncState) {
  return state === 'waiting'
    ? 'text-amber-300'
    : state === 'needsAttention'
      ? 'text-red-300'
      : undefined;
}
