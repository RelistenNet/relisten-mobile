import { TouchableOpacity, View } from 'react-native';
import { useAccountScope } from '@/relisten/accounts/account_context';
import { RelistenText } from '@/relisten/components/relisten_text';
import { addTracks } from '@/relisten/playlists/playlist_actions';
import { usePlaylistLifecycle } from '@/relisten/playlists/ui/playlist_lifecycle';
import { Playlist, PlaylistOperation } from '@/relisten/realm/models/playlists/playlist';
import { usePlaylistSyncService } from '@/relisten/realm/root_services';
import { useQuery, useRealm } from '@/relisten/realm/schema';
import { useShouldMakeNetworkRequests } from '@/relisten/util/netinfo';

/** Edits waiting longer than this while online get a quiet "still saving" line. */
const SLOW_SAVE_MS = 60_000;
/** A paused outbox bigger than one batch can't be resent whole (see the contract). */
const MAX_BATCH_OPERATIONS = 500;

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

  if (!playlist.ownerUserId) {
    return null;
  }

  const inState = (state: PlaylistOperation['state']) =>
    operations.filter((op) => op.state === state);
  const held = inState('archived_hold');
  const paused = inState('quota_paused');
  const refusedTracks = inState('needs_attention').flatMap((op) => [...op.failedTrackIds]);

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

  if (paused.length > 0 || playlist.serverState === 'needs_attention') {
    return (
      <Notice message="Saved on this phone only. Your account is full. Questions? team@relisten.net" />
    );
  }

  if (refusedTracks.length > 0) {
    const count = refusedTracks.length;
    return (
      <Notice
        message={`${count} ${count === 1 ? 'track' : 'tracks'} couldn’t be added because this playlist changed on another device.`}
        actions={[
          {
            label: 'Add Again',
            onPress: () => {
              addTracks(realm, playlistId, refusedTracks, true);
              service.dismissRefused(playlistId);
            },
          },
          { label: 'Dismiss', onPress: () => service.dismissRefused(playlistId) },
        ]}
      />
    );
  }

  const signedInAsOwner = account.isAuthenticated && account.userId === playlist.ownerUserId;
  const oldestPending = inState('pending').reduce(
    (oldest, op) => Math.min(oldest, op.createdAt.getTime()),
    Number.POSITIVE_INFINITY
  );
  if (signedInAsOwner && online && Date.now() - oldestPending > SLOW_SAVE_MS) {
    return <Notice message="Still saving your changes…" quiet />;
  }

  return null;
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
