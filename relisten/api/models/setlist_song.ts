export interface SetlistSongWithPlayCount {
    /** Format: date-time */
    created_at: string;
    /** Format: date-time */
    updated_at: string;
    /** Format: uuid */
    artist_uuid: string;
    name: string;
    slug: string;
    upstream_identifier: string;
    sortName: string;
    /** Format: uuid */
    uuid: string;
    /** Format: int32 */
    shows_played_at: number;
}
