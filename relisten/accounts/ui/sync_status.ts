import { useAccount, useAccountScope } from '@/relisten/accounts/account_context';
import { useFavoriteSyncStatus } from '@/relisten/library/favorite_hooks';
import { usePlaylistSaveState } from '@/relisten/playlists/playlist_hooks';

export type AccountSyncState = 'saved' | 'waiting' | 'syncing' | 'needsAttention';

export function isAccountWaitingToRestore(error: { code: string; retryable: boolean } | null) {
  return (
    error?.retryable === true &&
    (error.code === 'session_restore_failed' ||
      error.code === 'credentials_temporarily_unavailable' ||
      error.code === 'auth_service_unavailable')
  );
}

const SYNC_STATUS = {
  saved: {
    label: 'Saved',
    textClassName: 'text-gray-300',
  },
  waiting: {
    label: 'Waiting to sync',
    textClassName: 'text-amber-300',
  },
  syncing: {
    label: 'Syncing',
    textClassName: 'text-gray-300',
  },
  needsAttention: {
    label: 'Needs attention',
    textClassName: 'text-red-300',
  },
} satisfies Record<AccountSyncState, { label: string; textClassName: string }>;

export function syncStatusLabel(state: AccountSyncState) {
  return SYNC_STATUS[state].label;
}

/** Saving is quiet when it works: only waiting, saving, and problems get a word. */
const SUMMARY_LABEL: Record<AccountSyncState, string> = {
  saved: '',
  waiting: 'Waiting to sync',
  syncing: 'Saving…',
  needsAttention: 'Needs attention',
};

/** One short line about whether this device's library has reached the account. */
export function useAccountSyncSummary(): {
  state: AccountSyncState;
  label: string;
  textClassName: string;
} {
  const { error } = useAccount();
  const { userId } = useAccountScope();
  const syncStatus = useFavoriteSyncStatus();
  // Favorites and playlists both count: "Saved" only when neither has unsent work.
  const playlists = usePlaylistSaveState(userId ?? undefined);
  const state: AccountSyncState =
    syncStatus.state === 'needsAttention' || playlists === 'needsAttention'
      ? 'needsAttention'
      : isAccountWaitingToRestore(error)
        ? 'waiting'
        : syncStatus.state === 'saved' && playlists === 'unsaved'
          ? 'syncing'
          : syncStatus.state;

  return {
    state,
    label: SUMMARY_LABEL[state],
    textClassName:
      state === 'saved' || state === 'syncing' ? 'text-gray-400' : SYNC_STATUS[state].textClassName,
  };
}
