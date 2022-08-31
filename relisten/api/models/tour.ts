export interface TourWithShowCount {
    /** Format: date-time */
    created_at: string;
    /** Format: date-time */
    updated_at: string;
    /** Format: uuid */
    artist_uuid: string;
    /** Format: date-time */
    start_date: string;
    /** Format: date-time */
    end_date: string;
    name: string;
    slug: string;
    upstream_identifier: string;
    /** Format: uuid */
    uuid: string;
    /** Format: int32 */
    shows_on_tour: number;
}
