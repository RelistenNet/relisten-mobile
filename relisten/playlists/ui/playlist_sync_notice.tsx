import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { addAgain } from '@/relisten/playlists/playlist_actions';
import { PlaylistLimitError } from '@/relisten/playlists/playlist_repository';
import { GuideLimitError } from '@/relisten/playlists/guide/guide_text';
import { showPlaylistToast } from '@/relisten/playlists/ui/playlist_toast';
import { usePlaylistLifecycle } from '@/relisten/playlists/ui/playlist_lifecycle';
import {
  Playlist,
  PlaylistCommand,
  PlaylistOperation,
} from '@/relisten/realm/models/playlists/playlist';
import {
  refusedAddition,
  MAX_BATCH_OPERATIONS,
  type PlaylistEdit,
} from '@/relisten/playlists/sync/playlist_wire';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Edits waiting longer than this while online get a quiet "still saving" line. */
const SLOW_SAVE_MS = 60_000;

/**
 * The one line, at most, that an account playlist shows about syncing. Saving
 * normally says nothing; this appears only when the listener should know or
 * act. Offline shows nothing, since everything keeps working.
 */
export function PlaylistSyncNotice({ playlist }: { playlist: Playlist }) {
  const realm = useRealm();
  const service = usePlaylistSyncService();
  const account = useAccountScope();
  const online = useShouldMakeNetworkRequests();
  const { restore } = usePlaylistLifecycle();
  const { playlistId } = playlist;
  const operations = useQuery(
    PlaylistOperation,
    (rows) => rows.filtered('playlistId == $0', playlistId),
    [playlistId]
  );
  const refusedCreate = useQuery(
    PlaylistCommand,
    (rows) => rows.filtered('playlistId == $0 AND state == $1', playlistId, 'needs_attention'),
    [playlistId]
  )[0];

  const inState = (state: PlaylistOperation['state']) =>
    operations.filter((op) => op.state === state);
  const held = inState('archived_hold');
  const paused = inState('quota_paused');
  const refused = inState('needs_attention');
  // Read from the refused edits themselves, so text blocks come back with their tracks.
  const refusedAdditions = refused.flatMap((op) => {
    const addition = refusedAddition(JSON.parse(op.operationJson) as PlaylistEdit);
    return addition ? [addition] : [];
  });
  const refusedTrackCount = refusedAdditions
    .flatMap((addition) => addition.entries)
    .filter((entry) => entry.trackId).length;
  // Pending and in-flight edits both count as unsaved.
  const oldestUnsaved = operations
    .filter((op) => op.state === 'pending' || op.state === 'in_flight')
    .reduce((oldest, op) => Math.min(oldest, op.createdAt.getTime()), Number.POSITIVE_INFINITY);
  const slowSave = useIsSlow(oldestUnsaved);

  if (!playlist.libraryUserId || playlist.access !== 'owner') {
    return null;
  }

  if (playlist.archived) {
    return (
      <Notice
        message={
          held.length > 0
            ? 'This playlist was deleted on another device.'
            : 'This playlist was deleted.'
        }
        actions={[
          { label: 'Restore', onPress: () => void restore(playlist) },
          ...(held.length > 0
            ? [{ label: 'Discard My Changes', onPress: () => service.discardHeldEdits(playlistId) }]
            : []),
        ]}
      />
    );
  }

  if (paused.length > MAX_BATCH_OPERATIONS) {
    return (
      <Notice message="We couldn’t save your recent changes. Please email team@relisten.net so we can help." />
    );
  }

  if (paused.length > 0 || refusedCreate?.lastErrorCode === 'quota_exceeded') {
    return (
      <Notice message="Saved on this phone only. Your account is full. Questions? team@relisten.net" />
    );
  }

  if (refusedCreate) {
    return (
      <Notice message="Saved on this phone only. Your account couldn’t save this playlist. Questions? team@relisten.net" />
    );
  }

  if (refusedAdditions.length > 0) {
    const count = refusedTrackCount;
    const what = count === 0 ? 'Some notes' : `${count} ${count === 1 ? 'track' : 'tracks'}`;
    return (
      <Notice
        message={`${what} couldn’t be added because this playlist changed on another device.`}
        actions={[
          {
            label: 'Add Again',
            onPress: () => {
              try {
                addAgain(realm, playlistId, refusedAdditions);
              } catch (error) {
                showPlaylistToast(
                  error instanceof PlaylistLimitError || error instanceof GuideLimitError
                    ? error.message
                    : 'Couldn’t add them again.'
                );
                return;
              }
              service.dismissRefused(playlistId);
            },
          },
          { label: 'Dismiss', onPress: () => service.dismissRefused(playlistId) },
        ]}
      />
    );
  }

  if (refused.length > 0) {
    return (
      <Notice
        message="Some changes couldn’t be saved because this playlist changed on another device."
        actions={[{ label: 'OK', onPress: () => service.dismissRefused(playlistId) }]}
      />
    );
  }

  const signedInToLibrary = account.isAuthenticated && account.userId === playlist.libraryUserId;
  if (signedInToLibrary && online && slowSave) {
    return <Notice message="Still saving your changes…" quiet />;
  }

  return null;
}

/** True once the oldest unsaved edit has waited `SLOW_SAVE_MS`, re-rendering when it crosses. */
function useIsSlow(since: number): boolean {
  const [now, setNow] = useState(() => Date.now());
  const due = since + SLOW_SAVE_MS;
  useEffect(() => {
    if (!Number.isFinite(due) || now >= due) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), due - now);
    return () => clearTimeout(timer);
  }, [due, now]);
  return Number.isFinite(due) && now >= due;
}

function Notice({
  message,
  actions = [],
  quiet = false,
}: {
  message: string;
  actions?: { label: string; onPress: () => void }[];
  quiet?: boolean;
}) {
  if (quiet) {
    return (
      <RelistenText className="px-4 pb-3 text-center text-sm text-gray-400">{message}</RelistenText>
    );
  }
  return (
    <View className="mx-4 mb-4 rounded-lg border border-white/10 bg-relisten-blue-800 px-4 py-3">
      <RelistenText className="text-sm">{message}</RelistenText>
      {actions.length > 0 && (
        <View className="mt-1 flex-row justify-end">
          {actions.map((action) => (
            <TouchableOpacity
              key={action.label}
              accessibilityRole="button"
              className="min-h-[44px] justify-center pl-4"
              onPress={action.onPress}
            >
              <RelistenText className="font-semibold text-relisten-blue-300" selectable={false}>
                {action.label}
              </RelistenText>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
