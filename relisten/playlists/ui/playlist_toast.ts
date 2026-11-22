// Playlist confirmations, shown with the app's toast (`relisten/components/toast`).

import Realm from 'realm';
import { showToast, type ToastAction } from '@/relisten/components/toast';
import { undoForLatestEdit } from '@/relisten/playlists/playlist_actions';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';

/**
 * The Undo button for an edit toast, bound to the edit just made. An account
 * edit can be undone only until it is sent.
 */
export function undoAction(realm: Realm, playlistId: string): ToastAction {
  const undo = undoForLatestEdit(playlistId);
  return {
    label: 'Undo',
    onPress: () => {
      const result = undo(realm);
      if (result === 'sent') {
        showToast('That change is already saved to your account, so it can’t be undone.', {
          tone: 'warning',
        });
      } else if (result === 'gone') {
        showToast('That change can no longer be undone.', { tone: 'warning' });
      }
    },
  };
}

/** Confirms an edit with Undo. An edit that changed nothing gets no toast. */
export function toastEdit(
  realm: Realm,
  playlistId: string,
  changed: boolean,
  message: string,
  extra: ToastAction[] = []
) {
  if (changed) {
    showToast(message, { actions: [undoAction(realm, playlistId), ...extra] });
  }
}

/** "Removed Jack Straw", noting when its one linked partner is left on its own; "Removed note" for a text block. */
export function removedMessage(row: PlaylistRowEntry, group: PlaylistRowGroup): string {
  if (row.status === 'text') {
    return 'Removed note';
  }
  const title = row.sourceTrack?.title ?? 'track';
  const mate = group.entries.length === 2 ? group.entries.find((r) => r !== row) : undefined;
  return mate
    ? `Removed ${title}. ${mate.sourceTrack?.title ?? 'The other track'} is no longer linked.`
    : `Removed ${title}`;
}
