import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import type { MenuAction } from '@/relisten/components/menus/native_menu_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

/** A "Go to Song" action names its song: `go-to-song:<song id>`. */
export const GO_TO_SONG_PREFIX = 'go-to-song:';
export type GoToSongActionId = `${typeof GO_TO_SONG_PREFIX}${string}`;

export interface TrackSong {
  id: string;
  name: string;
}

/**
 * The songs a track's normalized title resolved to, in the order played. A
 * medley track such as "Scarlet Begonias > Fire on the Mountain" has several;
 * a song played twice in one track is listed once.
 */
export function songsOf(sourceTrack: Pick<SourceTrack, 'normalization'>): TrackSong[] {
  const songs = new Map<string, TrackSong>();
  const parts = [...(sourceTrack.normalization?.parts ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  for (const part of parts) {
    if (part.song && !songs.has(part.song.id)) {
      songs.set(part.song.id, { id: part.song.id, name: part.song.name });
    }
  }
  return [...songs.values()];
}

/**
 * One "Go to <song>" action per song, meant to sit inside one of a menu's
 * inline sections. Not a submenu: the iOS menu shows only one level of
 * nesting, so a submenu inside a section would lose its songs.
 */
export function goToSongActions(songs: TrackSong[]): MenuAction[] {
  return songs.map((song) => ({
    id: `${GO_TO_SONG_PREFIX}${song.id}` satisfies GoToSongActionId,
    image: nativeMenuIcons.song,
    title: `Go to ${song.name}`,
  }));
}
