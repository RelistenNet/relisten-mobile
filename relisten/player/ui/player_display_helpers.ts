import { type SourceTrack } from '@/relisten/realm/models/source_track';
import type { LinkPosition } from '@/relisten/playlists/playlist_drag_slots';

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const SHORT_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export function playerDisplayDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');
  const monthName = LONG_MONTHS[Number(month) - 1];

  return monthName ? `${monthName} ${Number(day)}, ${year}` : displayDate;
}

export function playerPosterDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');

  return {
    day,
    month: SHORT_MONTHS[Number(month) - 1] ?? month,
    year,
  };
}

export function playerQueueDate(displayDate: string) {
  const [year = '', month = '', day = ''] = displayDate.split('-');
  const uppercaseMonth = SHORT_MONTHS[Number(month) - 1];
  const monthName = uppercaseMonth
    ? `${uppercaseMonth[0]}${uppercaseMonth.slice(1).toLowerCase()}`
    : month;

  return `${monthName} ${Number(day)}, ${year}`;
}

export function playerDisplayTitle(title: string) {
  return title.replace(/\s*>\s*/g, ' > ');
}

/** Artist, date, and venue summary used by history rows. */
export function playerTrackMetadata(sourceTrack: SourceTrack) {
  return [
    sourceTrack.artist.name,
    playerQueueDate(sourceTrack.show.displayDate),
    sourceTrack.show.venue?.name,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Names a performance for spoken controls, including same-title songs in a mixed-show queue. */
export function playerTrackAccessibilityLabel(sourceTrack: SourceTrack) {
  return [
    playerDisplayTitle(sourceTrack.title),
    sourceTrack.artist.name,
    playerQueueDate(sourceTrack.show.displayDate),
    sourceTrack.show.venue?.name,
    sourceTrack.show.venue?.location,
  ]
    .filter(Boolean)
    .join(', ');
}

type LinkedQueueTrack = { playlistContext?: { segmentInstanceId: string } };

/**
 * Where a queue row sits in a run of tracks from one playlist link, judged by
 * its neighbors in the current order. Shuffle keeps a link's tracks together;
 * a link split apart by a manual reorder shows as separate runs.
 */
export function queueLinkPosition(
  tracks: readonly LinkedQueueTrack[],
  index: number
): LinkPosition | undefined {
  const linkId = tracks[index]?.playlistContext?.segmentInstanceId;
  if (!linkId) {
    return undefined;
  }

  const linkedBefore = tracks[index - 1]?.playlistContext?.segmentInstanceId === linkId;
  const linkedAfter = tracks[index + 1]?.playlistContext?.segmentInstanceId === linkId;
  if (linkedBefore && linkedAfter) {
    return 'middle';
  }
  if (linkedBefore) {
    return 'last';
  }
  return linkedAfter ? 'first' : undefined;
}
