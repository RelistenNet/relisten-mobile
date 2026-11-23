import type { Show } from '@/relisten/realm/models/show';
import type { SourceTrack } from '@/relisten/realm/models/source_track';
import { showVenueLabel } from '@/relisten/util/venue_route';
import type { SearchCatalogRow, SearchPlaylistCard } from './search_types';

/**
 * How one result reads in a list. Every result stacks the same lines, so the
 * eye finds the same thing in the same place whatever the result is:
 *
 *     title  marks                 rating or duration
 *     artist · date                plays, or a track's set
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
  /** What tells this row apart from its neighbors: a recording's ID, a review's passage. */
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

/** Venue and city, as show rows print them; a venue name that already contains its city keeps one. */
function venuePlace(venue: string, city: string): string {
  if (city && venue.toLowerCase().includes(city.toLowerCase())) {
    return venue;
  }
  return [venue, city].filter(Boolean).join(', ');
}

/**
 * A set's name, unless it says nothing the row doesn't: the generic "Set" a
 * source with one unnamed set gets, or a soundcheck the badge already marks.
 */
function namedSet(set: string, soundcheck: boolean): string | undefined {
  const name = set.trim().toLowerCase();
  if (!name || name === 'set' || (soundcheck && name === 'soundcheck')) {
    return undefined;
  }
  return set;
}

const marks = (soundboard: boolean, soundcheck: boolean) =>
  [soundboard && 'SBD', soundcheck && 'Soundcheck'].filter((mark): mark is string => Boolean(mark));

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

export function describeSearchRow(
  row: SearchCatalogRow,
  names: SearchArtistNames = NO_ARTIST_NAMES
): SearchRowView {
  if (row.kind === 'sequence') {
    // Passages carry only the artist's slug and the venue's name.
    return {
      title: searchDate(row.date),
      titleStyle: 'date',
      badges: [],
      byline: names.bySlug(row.artist_slug) ?? '',
      place: row.venue,
      note: joined(`Passage of ${row.song_ids.length} songs`, namedSet(row.set, false)),
      aside: [],
    };
  }

  // The device's spelling of the artist, which the rest of the app shows.
  const artist = (row.artist_id && names.byId(row.artist_id)) || row.artist_label || undefined;
  // Older indexes have only the city.
  const place = venuePlace(row.venue_label, row.location_label || row.city_label);
  const date = searchDate(row.date);
  const showLike = (note?: string): SearchRowView => ({
    title: date,
    titleStyle: 'date',
    badges: marks(row.soundboard, row.soundcheck),
    byline: artist ?? '',
    place,
    note,
    noteItalic: true,
    aside: [searchRating(row.avg_rating), searchPlays(row.track_plays)],
  });
  const named = (byline: string, namedPlace?: string): SearchRowView => ({
    title: row.label,
    titleStyle: 'name',
    badges: [],
    byline,
    place: namedPlace,
    aside: [],
  });

  switch (row.kind) {
    case 'artist':
      return named('Artist');
    case 'song':
      return named(joined(artist, 'Song'));
    case 'tour':
      return named(joined(artist, 'Tour'));
    case 'venue':
      return {
        ...named(
          joined(venueArtists(row, names), 'Venue'),
          row.location_label || row.city_label || undefined
        ),
        title: row.venue_label || row.label,
      };
    case 'show':
      return showLike();
    case 'recording':
      return showLike(recordingNote(row));
    case 'review':
      // Reviews have no title of their own; the matching passage tells them apart.
      return { ...showLike(reviewSnippet(row.highlights?.review_text)), badges: [] };
    case 'performance': {
      const { preview } = row;
      return {
        title: preview.label || row.label,
        titleStyle: 'track',
        badges: marks(preview.soundboard, preview.soundcheck),
        byline: joined(artist, date),
        place,
        aside: [
          preview.duration ? searchDuration(preview.duration) : undefined,
          namedSet(preview.set, preview.soundcheck),
          searchPlays(preview.plays),
        ],
      };
    }
  }
}

/**
 * What tells a recording apart from the show's others: the passage of its
 * notes the query matched, or else who taped and transferred it. Its
 * identifier says neither, so it isn't shown.
 */
function recordingNote(row: SearchCatalogRow & { kind: 'recording' }): string | undefined {
  const matched = plainSnippet(row.highlights?.notes);
  if (matched) {
    return `“${matched}”`;
  }

  return (
    joined(
      row.taper_label ? `Taper: ${row.taper_label}` : undefined,
      row.transferrer_label ? `Transfer: ${row.transferrer_label}` : undefined
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
    title: card.label,
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
