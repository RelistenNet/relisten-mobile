import type { NormalizedVenue } from '@/relisten/realm/models/v4_catalog';

export function normalizedVenueLocation(venue?: NormalizedVenue | null) {
  return [venue?.city, venue?.region, venue?.country].filter(Boolean).join(', ');
}

export function normalizedVenueAliases(venue?: NormalizedVenue | null) {
  return venue ? [...venue.names].map((name) => name.name).join(' ') : '';
}
