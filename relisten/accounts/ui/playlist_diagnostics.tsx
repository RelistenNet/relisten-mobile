import { useAccountScope } from '@/relisten/accounts/account_context';
import { relativeTime, SettingsRow } from '@/relisten/accounts/ui/settings_list';
import { DiagnosticRow } from '@/relisten/accounts/ui/favorite_diagnostics';
import { SectionHeader } from '@/relisten/components/section_header';
import { useRelistenPlayerQueueOrderedTracks } from '@/relisten/player/relisten_player_queue_hooks';
import { usePlaylistSaveState } from '@/relisten/playlists/playlist_hooks';
import {
  Playlist,
  PLAYLIST_DEVICE_STATE_ID,
  PlaylistCommand,
  PlaylistDeviceState,
  PlaylistEntry,
  PlaylistOperation,
  PlaylistSegment,
} from '@/relisten/realm/models/playlists/playlist';
import { useObject, useQuery } from '@/relisten/realm/schema';
import plur from 'plur';
import { View } from 'react-native';

/** The account screen's Playlists row: quiet when everything is saved, specific when not. */
export function PlaylistSyncRow() {
  const { userId } = useAccountScope();
  const libraryUserId = userId ?? '';
  const saveState = usePlaylistSaveState(userId ?? undefined);
  const playlists = useQuery(
    Playlist,
    (rows) =>
      rows.filtered(
        'libraryUserId == $0 AND access == $1 AND archived == false AND deletedAt == null',
        libraryUserId,
        'owner'
      ),
    [libraryUserId]
  );
  const unsent = useQuery(
    PlaylistOperation,
    (rows) =>
      rows.filtered('libraryUserId == $0 AND state IN $1', libraryUserId, ['pending', 'in_flight']),
    [libraryUserId]
  );

  const value =
    saveState === 'needsAttention'
      ? 'Needs attention'
      : saveState === 'unsaved' && unsent.length > 0
        ? `${unsent.length} ${plur('change', unsent.length)} saving`
        : saveState === 'unsaved'
          ? 'Saving…'
          : `${playlists.length} ${plur('playlist', playlists.length)} · up to date`;

  return (
    <SettingsRow
      label="Playlists"
      value={value}
      valueClassName={saveState === 'needsAttention' ? 'text-red-300' : undefined}
    />
  );
}

/**
 * Counters for playlist sync, by layer: what the device holds, what is
 * waiting in the outbox (by state), creates, the last pulls, and how much of
 * the play queue came from playlists. Shown under Diagnostics.
 */
export function PlaylistDiagnostics() {
  const { userId } = useAccountScope();
  const libraryUserId = userId ?? '';
  const playlists = useQuery(Playlist);
  const segments = useQuery(PlaylistSegment, (rows) => rows.filtered('live == true'), []);
  const entries = useQuery(PlaylistEntry, (rows) => rows.filtered('live == true'), []);
  const operations = useQuery(
    PlaylistOperation,
    (rows) => rows.filtered('libraryUserId == $0', libraryUserId),
    [libraryUserId]
  );
  const commands = useQuery(
    PlaylistCommand,
    (rows) => rows.filtered('libraryUserId == $0', libraryUserId),
    [libraryUserId]
  );
  const device = useObject(PlaylistDeviceState, PLAYLIST_DEVICE_STATE_ID);
  const queue = useRelistenPlayerQueueOrderedTracks();

  const inLibrary = playlists.filter((p) => p.libraryUserId === libraryUserId);
  const owned = inLibrary.filter((p) => p.access === 'owner');
  const followed = inLibrary.length - owned.length;
  const phoneOnly = playlists.filter((p) => !p.libraryUserId);
  const count = (rows: { length: number }) => rows.length;
  const byState = (state: string) => operations.filter((op) => op.state === state).length;
  // One pass over the entries rather than a query per segment.
  const entriesPerSegment = new Map<string, number>();
  for (const entry of entries) {
    entriesPerSegment.set(entry.segmentId, (entriesPerSegment.get(entry.segmentId) ?? 0) + 1);
  }
  const linkedSegments = [...segments].filter(
    (segment) => (entriesPerSegment.get(segment.segmentId) ?? 0) > 1
  ).length;
  const generations = new Set(owned.map((p) => p.historyGeneration).filter(Boolean));
  const fromPlaylists = queue.filter((track) => track.playlistContext);
  const queueLinks = new Set(
    fromPlaylists.map((track) => track.playlistContext!.segmentInstanceId)
  );

  return (
    <>
      <SectionHeader title="Playlist diagnostics" />
      <View className="px-4 py-3">
        <DiagnosticRow
          label="Playlists"
          value={[
            `${owned.filter((p) => !p.archived && !p.deletedAt).length} on account`,
            `${followed} followed`,
            `${phoneOnly.filter((p) => !p.deletedAt).length} phone only`,
            `${playlists.filter((p) => p.archived || p.deletedAt).length} deleted`,
            `${playlists.length - inLibrary.length - phoneOnly.length} other accounts`,
          ].join(' · ')}
        />
        <DiagnosticRow
          label="Tracks"
          value={`${count(entries)} entries · ${count(segments)} segments · ${linkedSegments} linked`}
        />
        <DiagnosticRow
          label="Outbox"
          value={[
            `${byState('pending')} pending`,
            `${byState('in_flight')} sending`,
            `${byState('acknowledged')} acknowledged`,
            `${byState('quota_paused')} quota paused`,
            `${byState('archived_hold')} held`,
            `${byState('needs_attention')} refused`,
          ].join(' · ')}
        />
        <DiagnosticRow
          label="Creates"
          value={`${commands.filter((c) => c.state === 'pending').length} pending · ${commands.filter((c) => c.state === 'needs_attention').length} refused`}
        />
        <DiagnosticRow
          label="Sequence"
          value={`next edit #${device?.nextOperationSequence ?? 0}`}
        />
        <DiagnosticRow
          label="Server state"
          value={[
            `${owned.filter((p) => p.serverState === 'synced').length} synced`,
            `${owned.filter((p) => p.serverState === 'creating').length} creating`,
            `${owned.filter((p) => p.appliedRevision == null && p.serverState === 'synced').length} need snapshot`,
            `${generations.size} ${plur('generation', generations.size)}`,
          ].join(' · ')}
        />
        <DiagnosticRow
          label="Last change"
          value={
            owned.length > 0
              ? relativeTime(new Date(Math.max(...owned.map((p) => p.updatedAt.getTime()))))
              : 'none'
          }
        />
        <DiagnosticRow
          label="Queue"
          value={`${fromPlaylists.length} of ${queue.length} from playlists · ${queueLinks.size} ${plur('occurrence group', queueLinks.size)}`}
        />
      </View>
    </>
  );
}
