import type { PlaylistRowEntry } from '@/relisten/playlists/playlist_hooks';
import type { SourceTrack } from '@/relisten/realm/models/source_track';

import plur from 'plur';

/** "6 tracks · 1 hr 21 min". Duration is left out until tracks have loaded. */
export function playlistSizeLine(entryCount: number, durationSeconds: number): string {
  const tracks = `${entryCount.toLocaleString()} ${plur('track', entryCount)}`;
  return durationSeconds > 0 ? `${tracks} · ${humanDuration(durationSeconds)}` : tracks;
}

/** "1 hr 21 min", "58 min", "4 min". */
export function humanDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes} min`;
  }
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

/** "Grateful Dead", "Grateful Dead, Phish", "Widespread Panic, Phish, and 3 more". */
export function artistLine(artistNames: string[]): string {
  if (artistNames.length <= 2) {
    return artistNames.join(', ');
  }
  return `${artistNames.slice(0, 2).join(', ')}, and ${artistNames.length - 2} more`;
}

/** "Deleted today", "Deleted yesterday", "Deleted 3 days ago". */
export function deletedAgo(deletedAt: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - deletedAt.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return 'Deleted today';
  }
  if (days === 1) {
    return 'Deleted yesterday';
  }
  return `Deleted ${days} days ago`;
}

/** A track's title inside a sentence or label; lowercase "track" before its details load. */
export const trackTitle = (row: PlaylistRowEntry | undefined) => row?.sourceTrack?.title ?? 'track';

/** The loaded track when every entry comes from the same recording, for "one show" labels. */
export function singleSourceTrack(entries: PlaylistRowEntry[]): SourceTrack | undefined {
  const first = entries[0]?.sourceTrack;
  if (!first) {
    return undefined;
  }
  return entries.every((r) => r.sourceTrack?.sourceUuid === first.sourceUuid) ? first : undefined;
}

/** An entry inside a sentence or label: its track's title, or "note" for a text block. */
export const entryTitle = (row: PlaylistRowEntry | undefined) =>
  row?.status === 'text' ? 'note' : trackTitle(row);

/** "Linked · 3 tracks", or "Linked · 2 tracks, 1 note" when text blocks are linked in. */
export function linkedEntriesLabel(entries: PlaylistRowEntry[]): string {
  const notes = entries.filter((row) => row.status === 'text').length;
  const tracks = entries.length - notes;
  const parts = [];
  if (tracks > 0) {
    parts.push(`${tracks} ${plur('track', tracks)}`);
  }
  if (notes > 0) {
    parts.push(`${notes} ${plur('note', notes)}`);
  }
  return `Linked · ${parts.join(', ')}`;
}

/**
 * One line of plain text from guide Markdown, for a fixed-height preview row.
 * It only drops the marks that would read as noise in one line (heading,
 * quote and list markers, emphasis, link syntax, escapes); it is not a
 * renderer, so a literal asterisk can be lost.
 */
export function markdownPreview(markdown: string | undefined): string {
  if (!markdown) {
    return '';
  }

  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*(>\s*)+/, '')
        .replace(/^\s*#{1,6}\s+/, '')
        .replace(/^\s*([-*+]|\d+[.)])\s+/, '')
        .replace(/\\([\\`*_{}[\]()#+\-.!>~])/g, '$1')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*~`]+/g, '')
        .replace(/(^|\s)_+|_+(\s|$)/g, '$1$2')
        .trim()
    )
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ');
}

/**
 * A playlist's name for lists and headers. A followed playlist has no name
 * until its first snapshot arrives, and keeps none once its owner hides it.
 */
export function playlistDisplayName(playlist: { name: string; unavailable: boolean }) {
  return playlist.name || (playlist.unavailable ? 'Unavailable playlist' : 'Loading…');
}
