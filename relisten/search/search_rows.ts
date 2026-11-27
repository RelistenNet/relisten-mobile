import { playlistAudienceLabel } from '@/relisten/playlists/playlist_audience';
import { decodeUuidCatalogId } from '@/relisten/api/catalog/identity';
import type { ShowSummaryResource, SourceSummaryResource } from '@/relisten/api/catalog/resources';
import type { ShowRowFields } from '@/relisten/components/shows_list';
import type { TrackWithArtistFields } from '@/relisten/components/source/source_track_with_artist';
import { normalizedVenueLocation } from '@/relisten/components/venue_presenters';
import { playlistSizeLine } from '@/relisten/playlists/playlist_format';
import { duration, trackDuration } from '@/relisten/util/duration';
import type { SearchCatalogRow, SearchPerformanceRow, SearchPlaylistCard } from './search_types';

/*
 * Search results render with the app's own rows: shows as the show list's
 * `ShowRow`, files as the download list's `TrackWithArtistRow`, artists as
 * the Artists tab's `ArtistRow`, and names (songs, tours, venues, playlists)
 * as the library's `ListRow`. These functions turn the catalog's response
 * into what those rows print.
 */

/** Venue and location, as show rows print them; a venue name that contains its city keeps one. */
export function showPlace(show: ShowSummaryResource): string {
  const venue = show.imported_venue;
  const canonical = show.artist_venue?.venue;
  const name = venue?.name ?? canonical?.name;
  const location = venue?.location ?? normalizedVenueLocation(canonical);
  return name && location && name.toLowerCase().includes(location.toLowerCase())
    ? name
    : [name, location].filter(Boolean).join(', ');
}

/**
 * A show row for a show, recording or review result. A result that names a
 * recording reports that recording's soundboard mark and rating.
 */
export function searchShowFields(
  show: ShowSummaryResource,
  source?: SourceSummaryResource
): ShowRowFields {
  return {
    uuid: decodeUuidCatalogId(show.id, 'show'),
    displayDate: show.display_date,
    hasSoundboardSource: source?.is_soundboard ?? show.has_soundboard_source,
    avgRating: source?.avg_rating || show.avg_rating,
    venueLabel: showPlace(show),
    sourceCount: show.source_count,
    avgDurationLabel: show.avg_duration ? duration(show.avg_duration) : undefined,
  };
}

/**
 * A performance's file as a track row. One file can hold several songs
 * (Scarlet > Fire), and then the row names them all; a file whose title
 * matches no catalog song keeps its own title.
 */
export function searchTrackFields(row: SearchPerformanceRow): TrackWithArtistFields {
  const track = row.preview_track;
  const title =
    row.songs && row.songs.length > 1
      ? row.songs.map((song) => song.name).join(' → ')
      : (row.performance?.song ?? track.title);

  return {
    title,
    isSoundboard: false,
    isPlayableOffline: false,
    artistName: row.artist.name,
    displayDate: row.show.display_date,
    durationLabel: track.duration ? trackDuration(track.duration) : undefined,
  };
}

/** A passage (songs played in sequence, such as Scarlet > Fire) as a track row. */
export function searchPassageFields(
  row: Extract<SearchCatalogRow, { kind: 'sequence' }>
): TrackWithArtistFields {
  const seconds = row.passage.tracks.reduce((total, track) => total + (track.duration ?? 0), 0);
  return {
    title: row.passage.parts.map((part) => part.song.name).join(' → '),
    isSoundboard: false,
    isPlayableOffline: false,
    artistName: row.artist.name,
    displayDate: row.show.display_date,
    durationLabel: seconds > 0 ? trackDuration(seconds) : undefined,
  };
}

/** The title of a song, tour or venue result, which open as plain list rows. */
export function namedRowTitle(
  row: Extract<SearchCatalogRow, { kind: 'song' | 'tour' | 'venue' }>
): string {
  switch (row.kind) {
    case 'song':
      return row.song.name;
    case 'tour':
      return row.tour.name;
    case 'venue':
      return row.venue.name ?? 'Unknown venue';
  }
}

export function namedRowSubtitle(
  row: Extract<SearchCatalogRow, { kind: 'song' | 'tour' | 'venue' }>
): string {
  switch (row.kind) {
    case 'song':
      return joined(row.artist.name, 'Song');
    case 'tour':
      return joined(row.artist.name, 'Tour');
    case 'venue': {
      const venue = row.venue;
      const location = 'artist_id' in venue ? venue.location : normalizedVenueLocation(venue);
      return joined('Venue', row.artist?.name, location || undefined);
    }
  }
}

/** A playlist result's subtitle, worded as playlist rows word it. */
export function playlistCardSubtitle(card: SearchPlaylistCard): string {
  return joined(
    playlistSizeLine(card.track_count, 0),
    playlistAudienceLabel(card),
    card.curator ? `@${card.curator}` : card.owned ? 'Yours' : undefined
  );
}

/**
 * What tells a recording apart from the show's others: the passage of its
 * notes the query matched, or else who taped and transferred it (with the
 * match marked when the query named them). Its upstream identifier says
 * neither, so it isn't shown.
 */
export function recordingNote(
  row: Extract<SearchCatalogRow, { kind: 'show' | 'recording' }>
): string | undefined {
  const highlights = row.match?.highlights;
  const matched = SOURCE_NOTE_FIELDS.map((field) => highlights?.[field]).find(Boolean);
  if (matched) {
    return quotedSnippet(matched);
  }

  const taper = highlights?.['source.taper'] ?? row.source?.taper;
  const transferrer = highlights?.['source.transferrer'] ?? row.source?.transferrer;
  return (
    joined(
      taper ? `Taper: ${taper}` : undefined,
      transferrer ? `Transfer: ${transferrer}` : undefined
    ) || undefined
  );
}

/** A review's matching passage, else its title, else its text. */
export function reviewNote(row: Extract<SearchCatalogRow, { kind: 'review' }>): string | undefined {
  const highlights = row.match?.highlights;
  return quotedSnippet(
    highlights?.['review.review'] ??
      highlights?.['review.title'] ??
      row.review.title ??
      row.review.review
  );
}

/** Source fields whose matching passage identifies a recording, most telling first. */
const SOURCE_NOTE_FIELDS = ['source.description', 'source.taper_notes', 'source.source'] as const;

/**
 * Highlighted text with its `<mark>` tags kept for the row to emphasize, and
 * whitespace collapsed. The text is listener-written, so it is never parsed
 * as HTML: the row splits on the two tags and renders everything else as text.
 */
function quotedSnippet(text: string | undefined): string | undefined {
  const snippet = text?.replace(/\s+/g, ' ').trim();
  return snippet ? `“${snippet}”` : undefined;
}

/** What VoiceOver reads for a show row: "SBD" spelled out, marks dropped. */
export function showRowAccessibilityLabel(
  fields: ShowRowFields,
  byline: string | undefined,
  note: string | undefined
): string {
  return [
    fields.displayDate,
    fields.hasSoundboardSource ? 'Soundboard' : undefined,
    byline,
    fields.venueLabel,
    fields.avgRating > 0 ? `rated ${fields.avgRating.toFixed(2)}` : undefined,
    note ? withoutMarks(note) : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

/** What VoiceOver reads for a track row. */
export function trackRowAccessibilityLabel(
  fields: TrackWithArtistFields,
  place: string | undefined
): string {
  return [fields.title, fields.artistName, fields.displayDate, place, fields.durationLabel]
    .filter(Boolean)
    .join(', ');
}

const withoutMarks = (text: string) => text.replace(/<\/?mark>/g, '');

/** Splits highlighted text into plain and matched runs, in order. */
export function markedRuns(text: string): { text: string; marked: boolean }[] {
  return text
    .split(/(<mark>[\s\S]*?<\/mark>)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('<mark>') && part.endsWith('</mark>')
        ? { text: part.slice(6, -7), marked: true }
        : { text: withoutMarks(part), marked: false }
    );
}

const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
