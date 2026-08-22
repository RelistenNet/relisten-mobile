const UUID_TEXT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Matches PostgreSQL's UUID text format without imposing RFC version or variant bits.
 * Relisten's older catalog UUIDs predate UUIDv7 and include deterministic values that
 * PostgreSQL accepts but strict RFC validators reject.
 */
export function isPostgresUuid(value: unknown): value is string {
  return typeof value === 'string' && value !== EMPTY_UUID && UUID_TEXT_PATTERN.test(value);
}
