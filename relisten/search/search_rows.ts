import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

/**
 * How one result reads in a list: what it is, and the facts that tell it
 * apart from its neighbors (artist, date, venue, and for a performance its
 * set and duration). Two performances from one show stay separate rows, so
 * the set and duration are what distinguish them.
 */
export interface SearchRowText {
  title: string;
  subtitle: string;
  /** Set, position and duration of the exact file a performance row adds. */
  detail?: string;
  /** Short marks such as SBD or Soundcheck. */
  badges: string[];
}

/** `20170725` reads as the app writes dates elsewhere: `2017-07-25`. */
export function searchDate(date: number): string {
  if (!date) {
    return '';
  }
  const text = String(date).padStart(8, '0');
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
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

/**
 * Artist names the device already knows. Venue rows don't carry a name: an
 * imported venue has only the artist's ID, and a shared venue only slugs.
 */
export interface SearchArtistNames {
  byId(artistId: string): string | undefined;
  bySlug(slug: string): string | undefined;
}

const NO_ARTIST_NAMES: SearchArtistNames = { byId: () => undefined, bySlug: () => undefined };
const VENUE_ARTISTS_SHOWN = 2;

/** "Grateful Dead, Dead & Company +1" for a shared venue; one name for an imported one. */
function venueArtists(row: SearchCatalogRow & { kind: 'venue' }, names: SearchArtistNames) {
  if (row.artist_label) {
    return row.artist_label;
  }
  if (row.artist_id) {
    return names.byId(row.artist_id);
  }

  const slugs = row.artist_slugs ?? [];
  const known = slugs.map((slug) => names.bySlug(slug)).filter((name): name is string => !!name);
  if (known.length === 0) {
    return undefined;
  }
  const shown = known.slice(0, VENUE_ARTISTS_SHOWN).join(', ');
  const more = slugs.length - Math.min(known.length, VENUE_ARTISTS_SHOWN);
  return more > 0 ? `${shown} +${more}` : shown;
}

export function describeSearchRow(
  row: SearchCatalogRow,
  names: SearchArtistNames = NO_ARTIST_NAMES
): SearchRowText {
  if (row.kind === 'sequence') {
    return {
      title: `Passage · ${row.song_ids.length} songs`,
      subtitle: joined(searchDate(row.date), row.venue),
      detail: row.set || undefined,
      badges: [],
    };
  }

  const badges = [row.soundboard && 'SBD', row.soundcheck && 'Soundcheck'].filter(
    (badge): badge is string => Boolean(badge)
  );
  const place = joined(row.venue_label, row.city_label);
  const date = searchDate(row.date);

  switch (row.kind) {
    case 'artist':
      return { title: row.label, subtitle: 'Artist', badges: [] };
    case 'song':
      return { title: row.label, subtitle: joined('Song', row.artist_label), badges: [] };
    case 'venue':
      return {
        title: row.venue_label || row.label,
        subtitle: joined('Venue', row.city_label, venueArtists(row, names)),
        badges: [],
      };
    case 'tour':
      return { title: row.label, subtitle: joined('Tour', row.artist_label), badges: [] };
    case 'show':
      return {
        title: joined(date, row.venue_label),
        subtitle: joined(row.artist_label, row.city_label),
        badges,
      };
    case 'performance': {
      const { preview } = row;
      const fileBadges = [preview.soundboard && 'SBD', preview.soundcheck && 'Soundcheck'].filter(
        (badge): badge is string => Boolean(badge)
      );
      return {
        title: preview.label || row.label,
        subtitle: joined(row.artist_label, date, place),
        detail: joined(
          preview.set,
          preview.duration ? searchDuration(preview.duration) : undefined
        ),
        badges: fileBadges,
      };
    }
    case 'recording':
      return {
        title: row.source_upstream || row.label,
        subtitle: joined(row.artist_label, date, place),
        badges,
      };
    case 'review':
      // Reviews have no title of their own; the matching passage tells them apart.
      return {
        title: joined('Review', date),
        subtitle: joined(row.artist_label, row.venue_label),
        detail: reviewSnippet(row.highlights?.review_text),
        badges: [],
      };
  }
}

/** The matched passage as plain text: marks dropped, whitespace collapsed. */
function reviewSnippet(text: string | undefined): string | undefined {
  const plain = text
    ?.replace(/<\/?mark>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain ? `“${plain}”` : undefined;
}

export function describePlaylistCard(card: SearchPlaylistCard): SearchRowText {
  const tracks = `${card.track_count} ${card.track_count === 1 ? 'track' : 'tracks'}`;
  return {
    title: card.label,
    subtitle: joined(
      card.curator ? `@${card.curator}` : card.owned ? 'Your playlist' : undefined,
      tracks
    ),
    badges: [],
  };
}

/** A stable list key. Performance rows key on their file, since one show can have several. */
export function searchRowKey(row: SearchCatalogRow): string {
  switch (row.kind) {
    case 'sequence':
      return `sequence:${row.source_id}:${row.track_ids.join(',')}`;
    case 'performance':
      return `performance:${row.preview.track_id}`;
    default:
      return `${row.kind}:${row.id}`;
  }
}
