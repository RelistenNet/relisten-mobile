import { normalizedVenueLocation } from '@/relisten/components/venue_presenters';
import type { Show } from '@/relisten/realm/models/show';
import type { RelistenTabGroupSegment } from '@/relisten/util/routes';
import type { Href } from 'expo-router';

/** The name of a show's venue, from the artist's import or the shared venue. */
export function showVenueName(show: Show): string | undefined {
  return show.venue?.name ?? show.artistVenue?.venue.name;
}

/** Where a show's venue is: the artist's import, or the shared venue's place. */
export function showVenueLocation(show: Show): string | undefined {
  return show.venue?.location ?? normalizedVenueLocation(show.artistVenue?.venue);
}

/** Venue and city, as show rows print them. */
export function showVenueLabel(show: Show): string {
  return [showVenueName(show), showVenueLocation(show)].filter(Boolean).join(', ');
}

/**
 * The page for a show's venue. A venue the catalog has normalized gets the
 * shared page, which lists every artist's shows there; otherwise the page
 * lists this artist's shows at the venue as imported.
 */
export function showVenueRoute(
  show: Show,
  groupSegment: RelistenTabGroupSegment
): Href | undefined {
  if (show.artistVenue) {
    return {
      pathname: `/relisten/tabs/${groupSegment}/venue/[venueId]/` as const,
      params: { venueId: show.artistVenue.venue.id },
    };
  }

  if (show.venueUuid) {
    return {
      pathname: `/relisten/tabs/${groupSegment}/[artistUuid]/venue/[venueUuid]/` as const,
      params: {
        artistUuid: show.artistUuid,
        venueUuid: show.venueUuid,
        venueKind: 'imported_venue',
      },
    };
  }

  return undefined;
}
