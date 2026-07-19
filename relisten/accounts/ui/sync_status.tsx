import { RelistenText } from '@/relisten/components/relisten_text';
import { tw } from '@/relisten/util/tw';

export type AccountSyncState = 'saved' | 'waiting' | 'syncing' | 'needsAttention';

export function isAccountWaitingToRestore(error: { code: string; retryable: boolean } | null) {
  return (
    error?.retryable === true &&
    (error.code === 'session_restore_failed' ||
      error.code === 'session_restore_in_progress' ||
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

export function SyncStatusText({
  className,
  state,
}: {
  className?: string;
  state: AccountSyncState;
}) {
  const status = SYNC_STATUS[state];

  return (
    <RelistenText className={tw('text-sm', status.textClassName, className)}>
      {status.label}
    </RelistenText>
  );
}
