import { RelistenPlaybackState } from '@/modules/relisten-audio-player';
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
      if (isQueueable(row, online)) {
        tracks.push(queueTrackFor(playlistId, row, segmentInstanceId));
      }
    }
  }
  return tracks;
}

/** One queue occurrence of an entry, keeping its playlist provenance. */
export function queueTrackFor(
  playlistId: string,
  row: PlaylistRowEntry,
  segmentInstanceId = createUuidV7()
): PlayerQueueTrack {
  const track = PlayerQueueTrack.fromSourceTrack(row.sourceTrack!);
  track.playlistContext = { playlistId, entryId: row.entry.entryId, segmentInstanceId };
  return track;
}

/**
 * Plays the playlist in order, from `startEntryId` or the beginning. Returns
 * false, leaving the queue alone, if nothing can play or the chosen entry
 * can't play right now.
 */
export function playPlaylist(
  player: RelistenPlayer,
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean,
  startEntryId?: string
): boolean {
  const tracks = queueTracksFor(playlistId, groups, online);
  const startIndex = startEntryId
    ? tracks.findIndex((t) => t.playlistContext?.entryId === startEntryId)
    : 0;
  if (tracks.length === 0 || startIndex < 0) {
    return false;
  }
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

/**
 * Plays an entry from a moment in it, for a guide's timestamp link. If the
 * queue already holds that entry from this playlist, playback moves there
 * (or just seeks, when it is already the playing track); otherwise the
 * playlist is queued from that entry. Returns false when the entry can't play
 * right now: a text block, a missing entry, or offline without a download.
 */
export function playEntryAt(
  player: RelistenPlayer,
  playlistId: string,
  groups: PlaylistRowGroup[],
  online: boolean,
  entryId: string,
  seconds: number
): boolean {
  const queued = player.queue.orderedTracks.findIndex(
    (track) =>
      track.playlistContext?.playlistId === playlistId && track.playlistContext.entryId === entryId
  );
  if (queued >= 0) {
    const isPlaying =
      queued === player.queue.currentIndex && player.state === RelistenPlaybackState.Playing;
    if (isPlaying) {
      void player.seekToTime(seconds);
    } else {
      player.playTrackAtIndex(queued, seconds);
    }
    return true;
  }

  const tracks = queueTracksFor(playlistId, groups, online);
  const startIndex = tracks.findIndex((track) => track.playlistContext?.entryId === entryId);
  if (startIndex < 0) {
    return false;
  }
  player.queue.replaceQueue(tracks, undefined, { resetShuffle: true });
  player.playTrackAtIndex(startIndex, seconds);
  sharedStatsigClient().logEvent(playlistActionEvent('play', tracks.length));
  return true;
}
