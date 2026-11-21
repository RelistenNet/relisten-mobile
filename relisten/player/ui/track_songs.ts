import { nativeMenuIcons } from '@/relisten/components/menus/native_menu_icons';
import type { MenuAction } from '@/relisten/components/menus/native_menu_view';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

/** A "Go to Song" action names its song: `go-to-song:<song id>`. */
export const GO_TO_SONG_PREFIX = 'go-to-song:';

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
 * One song is a direct action; several become a submenu listing each, since
 * there's no one song to pick for the whole track.
 */
export function goToSongActions(songs: TrackSong[]): MenuAction[] {
  if (songs.length === 0) {
    return [];
  }

  const songAction = (song: TrackSong, title: string): MenuAction => ({
    id: GO_TO_SONG_PREFIX + song.id,
    image: nativeMenuIcons.song,
    title,
  });

  if (songs.length === 1) {
    return [songAction(songs[0], `Go to ${songs[0].name}`)];
  }
  return [
    {
      id: 'go-to-song',
      image: nativeMenuIcons.song,
      title: 'Go to Song',
      subactions: songs.map((song) => songAction(song, song.name)),
    },
  ];
}
