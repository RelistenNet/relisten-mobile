import { trackIdForSourceTrack } from '@/relisten/playlists/playlist_hooks';
import { openAddToPlaylist } from '@/relisten/playlists/ui/playlist_navigation';
import { PlaybackHistoryEntry } from '@/relisten/realm/models/history/playback_history_entry';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

/** Checkbox selection of history entries, to add several plays to a playlist at once. */
export interface HistorySelection {
  selected: ReadonlySet<string>;
  toggle: (entryUuid: string) => void;
}

/**
 * Selecting history entries: start (from a row's menu or a long press) with
 * one entry checked, toggle others, then add them to a playlist in the order
 * they were played, so a listening session reads in order and its segues can
 * be linked.
 */
export function useHistorySelection(entries: readonly PlaybackHistoryEntry[]) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);

  const selection: HistorySelection | undefined = selected
    ? {
        selected,
        toggle: (uuid) =>
          setSelected((current) => {
            const next = new Set(current);
            if (next.has(uuid)) {
              next.delete(uuid);
            } else {
              next.add(uuid);
            }
            return next;
          }),
      }
    : undefined;

  const addToPlaylist = () => {
    if (!selected || selected.size === 0) {
      return;
    }
    const trackIds = entries
      .filter((entry) => selected.has(entry.uuid))
      .sort((a, b) => a.playbackStartedAt.getTime() - b.playbackStartedAt.getTime())
      .map((entry) => trackIdForSourceTrack(entry.sourceTrack));
    setSelected(null);
    openAddToPlaylist(router, [...new Set(trackIds)], { linkable: true });
  };

  return {
    selection,
    start: (uuid: string) => setSelected(new Set([uuid])),
    cancel: () => setSelected(null),
    addToPlaylist,
  };
}

/** The header while selecting: Cancel on the left, Add N to Playlist on the right. */
export function HistorySelectionToolbar({
  count,
  onCancel,
  onAdd,
}: {
  count: number;
  onCancel: () => void;
  onAdd: () => void;
}) {
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={onCancel}>Cancel</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button disabled={count === 0} onPress={onAdd}>
          {count === 0 ? 'Add to Playlist' : `Add ${count} to Playlist`}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}
