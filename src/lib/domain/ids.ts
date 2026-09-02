const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route params and form fields arrive as arbitrary strings. Postgres rejects a
 * malformed uuid with error 22P02, which surfaces as a blank page instead of a
 * 404, so ids are checked before they reach a query.
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
