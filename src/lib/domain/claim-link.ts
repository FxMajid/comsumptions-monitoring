/**
 * The shape of a claim link, with no Node dependency, so the scanner running in
 * the browser and the server that issues the link agree on one definition.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;

/** Route params arrive as arbitrary strings; a malformed one never hits the RPC. */
export function isClaimToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function claimPath(token: string): string {
  return `/klaim/${token}`;
}

export function operatorClaimPath(token: string): string {
  return `/pengambilan/t/${token}`;
}

/**
 * What a scanner hands over is whatever was printed: usually the full claim URL,
 * sometimes a bare token typed by hand. Both reduce to the last path segment.
 */
export function extractClaimToken(input: string): string | null {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  const candidate = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";

  return isClaimToken(candidate) ? candidate : null;
}
