export interface VenueWithShowCounts {
  /** Format: date-time */
  created_at: string;
  /** Format: date-time */
  updated_at: string;
  /** Format: uuid */
  artist_uuid: string;
  /** Format: double */
  latitude: number | null;
  /** Format: double */
  longitude: number | null;
  name: string;
  location: string;
  upstream_identifier: string;
  slug: string;
  past_names: string | null;
  sortName: string;
  /** Format: uuid */
  uuid: string;
  /** Format: int32 */
  shows_at_venue: number;
}
