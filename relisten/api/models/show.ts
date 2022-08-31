export interface Show {
    /** Format: date-time */
    created_at: string;
    /** Format: date-time */
    updated_at: string;
    /** Format: uuid */
    artist_uuid: string;
    /** Format: uuid */
    venue_uuid: string | null;
    /** Format: uuid */
    tour_uuid: string | null;
    /** Format: uuid */
    year_uuid: string;
    /** Format: date-time */
    date: string;
    /** Format: float */
    avg_rating: number;
    /** Format: float */
    avg_duration: number | null;
    display_date: string;
    /** Format: date-time */
    most_recent_source_updated_at: string;
    has_soundboard_source: boolean;
    has_streamable_flac_source: boolean;
    /** Format: int32 */
    source_count: number;
    /** Format: uuid */
    uuid: string;
}
