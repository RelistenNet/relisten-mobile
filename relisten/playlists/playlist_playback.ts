import type { RelistenPlayer } from '@/relisten/player/relisten_player';
import { PlayerQueueTrack, PlayerShuffleState } from '@/relisten/player/relisten_player_queue';
import type { PlaylistRowEntry, PlaylistRowGroup } from '@/relisten/playlists/playlist_hooks';
import { playlistActionEvent, sharedStatsigClient } from '@/relisten/events';
import { createUuidV7 } from '@/relisten/util/uuid_v7';

/**
 * Whether an entry can be queued right now. Offline, only downloaded tracks
 * play, so pressing Play never walks into a run of network errors.
 */
export function isQueueable(row: PlaylistRowEntry, online: boolean): boolean {
  if (row.status !== 'playable' || !row.sourceTrack) {
    return false;
  }
  return online || row.sourceTrack.offlineInfo?.isPlayableOffline() === true;
}

/**
 * Builds fresh queue occurrences for the playlist. Each segment gets a new
 * segment instance ID per enqueue, so queueing the same playlist twice never
 * merges its groups, and shuffle keeps each group's tracks together.
 */
export function queueTracksFor(
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean
): PlayerQueueTrack[] {
  const tracks: PlayerQueueTrack[] = [];
  for (const group of groups) {
    const segmentInstanceId = createUuidV7();
    for (const row of group.entries) {
      if (!isQueueable(row, online)) {
        continue;
      }
      const track = PlayerQueueTrack.fromSourceTrack(row.sourceTrack!);
      track.playlistContext = { playlistId, entryId: row.entry.entryId, segmentInstanceId };
      tracks.push(track);
    }
  }
  return tracks;
}

/** Plays the playlist in order, from `startEntryId` or the beginning. Returns false if nothing can play. */
export function playPlaylist(
  player: RelistenPlayer,
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean,
  startEntryId?: string
): boolean {
  const tracks = queueTracksFor(playlistId, groups, online);
  if (tracks.length === 0) {
    return false;
  }
  const startIndex = Math.max(
    0,
    tracks.findIndex((t) => t.playlistContext?.entryId === startEntryId)
  );
  player.queue.replaceQueue(tracks, startIndex, { resetShuffle: true });
  sharedStatsigClient().logEvent(playlistActionEvent('play', tracks.length));
  return true;
}

/** Shuffles by group and starts at the first track of a random group. */
export function shufflePlaylist(
  player: RelistenPlayer,
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean
): boolean {
  const tracks = queueTracksFor(playlistId, groups, online);
  if (tracks.length === 0) {
    return false;
  }
  player.queue.replaceQueue(tracks, undefined, { resetShuffle: true });
  player.queue.setShuffleState(PlayerShuffleState.SHUFFLE_ON);
  player.playTrackAtIndex(0);
  sharedStatsigClient().logEvent(playlistActionEvent('shuffle', tracks.length));
  return true;
}
