export interface Year {
  /** Format: date-time */
  created_at: string;
  /** Format: date-time */
  updated_at: string;
  /** Format: int32 */
  show_count: number;
  /** Format: int32 */
  source_count: number;
  /** Format: int32 */
  duration: number | null;
  /** Format: float */
  avg_duration: number | null;
  /** Format: float */
  avg_rating: number;
  year: string;
  /** Format: uuid */
  artist_uuid: string;
  /** Format: uuid */
  uuid: string;
}
