import type { ShowSummaryResource, SourceSummaryResource } from '@/relisten/api/catalog/resources';
import { normalizedVenueLocation } from '@/relisten/components/venue_presenters';
import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { showVenueLabel } from '@/relisten/util/venue_route';
import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

/**
 * How one result reads in a list. Every result stacks the same lines, so the
 * eye finds the same thing in the same place whatever the result is:
 *
 *     title  marks                 rating or duration
 *     artist · date                a show's plays
 *     venue, location              a track's plays
 *     note
 *
 * The title takes the style of the app row for that kind of thing: a bold
 * date as in the show list, a song in regular weight as in a playlist, or a
 * bold name as in the artist, song and venue lists.
 */
export interface SearchRowView {
  title: string;
  titleStyle: 'date' | 'track' | 'name';
  /** Short marks such as SBD or Soundcheck. */
  badges: string[];
  /** The artist, then the date unless the date is the title. */
  byline: string;
  /** Venue and location. */
  place?: string;
  /** What tells this row apart from its neighbors: a taper credit or a review excerpt. */
  note?: string;
  /** The note is quoted text or an identifier rather than a plain fact. */
  noteItalic?: boolean;
  /** What sits at the end of the title, byline and place lines, in that order. */
  aside: [title?: string, byline?: string, place?: string];
}

/** VoiceOver would spell "SBD" letter by letter. */
const spokenBadge = (badge: string) => (badge === 'SBD' ? 'Soundboard' : badge);

/** Everything a row shows, for VoiceOver. */
export function searchRowAccessibilityLabel(view: SearchRowView): string {
  const [titleAside, bylineAside, placeAside] = view.aside;
  return [
    view.title,
    ...view.badges.map(spokenBadge),
    titleAside,
    view.byline,
    bylineAside,
    view.place,
    placeAside,
    view.note,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Seconds as `m:ss`, or `h:mm:ss` for an hour or more. */
export function searchDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

function showPlace(show: ShowSummaryResource): string {
  const venue = show.imported_venue;
  const canonical = show.artist_venue?.venue;
  const name = venue?.name ?? canonical?.name;
  const location = venue?.location ?? normalizedVenueLocation(canonical);
  return name && location && name.toLowerCase().includes(location.toLowerCase())
    ? name
    : [name, location].filter(Boolean).join(', ');
}

/** A 0–10 rating as show rows print it: `8.25 ★`. Unrated is left blank. */
export function searchRating(rating: number | undefined): string | undefined {
  return rating && rating > 0 ? `${rating.toFixed(2)} ★` : undefined;
}

/**
 * `736 plays/yr`, `3.3k plays/yr`. The index counts the year before it was
 * built, so the label says so. None is left blank.
 */
export function searchPlays(plays: number | undefined): string | undefined {
  if (!plays || plays <= 0) {
    return undefined;
  }
  const short = (value: number, unit: string) => `${value.toFixed(1).replace(/\.0$/, '')}${unit}`;
  const count =
    plays >= 1_000_000
      ? short(plays / 1_000_000, 'M')
      : plays >= 1_000
        ? short(plays / 1_000, 'k')
        : String(plays);
  return `${count} ${plays === 1 ? 'play' : 'plays'}/yr`;
}

export function describeSearchRow(row: SearchCatalogRow): SearchRowView {
  const artist = row.artist?.name;
  const plays = searchPlays(row.popularity?.windows['1y']?.plays);
  const highlights = row.match?.highlights;
  const named = (title: string, byline: string, place?: string): SearchRowView => ({
    title,
    titleStyle: 'name',
    badges: [],
    byline,
    place,
    aside: [],
  });

  switch (row.kind) {
    case 'artist':
      return named(row.artist.name, 'Artist');
    case 'song':
      return named(row.song.name, joined(artist, 'Song'));
    case 'tour':
      return named(row.tour.name, joined(artist, 'Tour'));
    case 'venue': {
      const venue = row.venue;
      const location = 'artist_id' in venue ? venue.location : normalizedVenueLocation(venue);
      return named(venue.name ?? 'Unknown venue', joined(artist, 'Venue'), location ?? undefined);
    }
    case 'show':
    case 'recording':
      return describeShow(row.show, row.artist.name, plays, row.source, recordingNote(row));
    case 'review':
      return {
        ...describeShow(row.show, row.artist.name, plays, row.source),
        badges: [],
        note: reviewSnippet(highlights?.review_text ?? row.review.title ?? row.review.review),
      };
    case 'performance': {
      const track = row.preview_track;
      const soundcheck = track.normalization.parts.some((part) =>
        part.qualifiers.includes('soundcheck')
      );
      return {
        title: row.performance?.song ?? track.title,
        titleStyle: 'track',
        badges: soundcheck ? ['Soundcheck'] : [],
        byline: joined(artist, row.show.display_date),
        place: showPlace(row.show),
        aside: [track.duration ? searchDuration(track.duration) : undefined, undefined, plays],
      };
    }
    case 'sequence':
      return {
        title: row.passage.parts.map((part) => part.song.name).join(' → '),
        titleStyle: 'track',
        badges: [],
        byline: joined(artist, row.show.display_date),
        place: showPlace(row.show),
        aside: [plays],
      };
  }
}

function describeShow(
  show: ShowSummaryResource,
  artist: string,
  plays: string | undefined,
  source: SourceSummaryResource | undefined,
  note?: string
): SearchRowView {
  return {
    title: show.display_date,
    titleStyle: 'date',
    badges: (source?.is_soundboard ?? show.has_soundboard_source) ? ['SBD'] : [],
    byline: artist,
    place: showPlace(show),
    note,
    noteItalic: true,
    aside: [searchRating(source?.avg_rating ?? show.avg_rating), plays],
  };
}

/** A recording is identified by its matching notes or credits, not its upstream ID. */
function recordingNote(row: Extract<SearchCatalogRow, { kind: 'show' | 'recording' }>) {
  const highlights = row.match?.highlights;
  const matched = plainSnippet(highlights?.notes || highlights?.credits);
  if (matched) {
    return `“${matched}”`;
  }

  const { taper, transferrer } = row.source ?? {};
  return (
    joined(
      taper ? `Taper: ${taper}` : undefined,
      transferrer ? `Transfer: ${transferrer}` : undefined
    ) || undefined
  );
}

/** Highlighted text as plain text: marks dropped, whitespace collapsed. */
function plainSnippet(text: string | undefined): string | undefined {
  const plain = text
    ?.replace(/<\/?mark>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain || undefined;
}

/** A review's matching passage, quoted. */
function reviewSnippet(text: string | undefined): string | undefined {
  const plain = plainSnippet(text);
  return plain ? `“${plain}”` : undefined;
}

const trackCount = (count: number) => `${count} ${count === 1 ? 'track' : 'tracks'}`;

export function describePlaylistCard(card: SearchPlaylistCard): SearchRowView {
  return {
    title: card.name,
    titleStyle: 'name',
    badges: [],
    byline: joined(
      card.curator ? `@${card.curator}` : card.owned ? 'Yours' : undefined,
      'Playlist',
      trackCount(card.track_count)
    ),
    aside: [],
  };
}

/**
 * A show on the device, as a remote show row. Its soundboard flag is passed
 * in: a show knows whether any recording is one, a history entry knows its own.
 */
export function describeLocalShow(show: Show, soundboard: boolean): SearchRowView {
  return {
    title: show.displayDate,
    titleStyle: 'date',
    badges: soundboard ? ['SBD'] : [],
    byline: show.artist?.name ?? '',
    place: showVenueLabel(show),
    aside: [searchRating(show.avgRating)],
  };
}

/** A downloaded file, as a remote performance row. */
export function describeLocalTrack(track: SourceTrack): SearchRowView {
  return {
    title: track.title,
    titleStyle: 'track',
    badges: track.source?.isSoundboard ? ['SBD'] : [],
    byline: joined(track.artist?.name, track.show?.displayDate),
    place: track.show ? showVenueLabel(track.show) : undefined,
    aside: [track.humanizedDuration],
  };
}

export function describeLocalArtist(name: string): SearchRowView {
  return { title: name, titleStyle: 'name', badges: [], byline: 'Artist', aside: [] };
}

export function describeLocalPlaylist(name: string, entryCount: number): SearchRowView {
  return {
    title: name,
    titleStyle: 'name',
    badges: [],
    byline: joined('Playlist', trackCount(entryCount)),
    aside: [],
  };
}
