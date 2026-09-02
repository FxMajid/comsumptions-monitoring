import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { claimPath, isClaimToken } from "@/lib/domain/claim-link";
import { EVENT_UTC_OFFSET, toDateTimeInputValue } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 32 random bytes, base64url encoded. Long enough that guessing is hopeless and
 * short enough to stay inside a QR code that still scans from a printed sheet.
 */
const TOKEN_BYTES = 32;

export function generateClaimToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Only the hash is stored. A dump of `beneficiary_access_tokens` therefore
 * yields nothing scannable: the raw token exists in the printed QR and nowhere
 * else, which is also why a lost link can only be replaced, never looked up.
 */
export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The absolute origin printed into a QR code. `APP_URL` wins because a scanned
 * sheet outlives the deployment it was printed from; the forwarded host is only
 * a development fallback and is attacker controlled in principle.
 */
export async function getAppOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  if (productionUrl) {
    return `https://${productionUrl.replace(/\/+$/, "")}`;
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    return "";
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function buildClaimUrl(token: string): Promise<string> {
  const origin = await getAppOrigin();

  return `${origin}${claimPath(token)}`;
}

export type ClaimTokenRecord = {
  id: string;
  beneficiaryId: string;
  expiresAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
};

const TOKEN_COLUMNS =
  "id, beneficiary_id, expires_at, revoked_at, revocation_reason, created_at";

type TokenRow = {
  id: string;
  beneficiary_id: string;
  expires_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
};

function toClaimTokenRecord(row: TokenRow): ClaimTokenRecord {
  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revocationReason: row.revocation_reason,
    createdAt: row.created_at,
  };
}

/** Live means not revoked. An expired-but-unrevoked token still blocks a reissue. */
export async function getLiveClaimTokens(
  eventId: string,
): Promise<ClaimTokenRecord[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("beneficiary_access_tokens")
    .select(TOKEN_COLUMNS)
    .eq("event_id", eventId)
    .is("revoked_at", null)
    .returns<TokenRow[]>();

  return (data ?? []).map(toClaimTokenRecord);
}

export async function getLiveClaimToken(
  beneficiaryId: string,
): Promise<ClaimTokenRecord | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("beneficiary_access_tokens")
    .select(TOKEN_COLUMNS)
    .eq("beneficiary_id", beneficiaryId)
    .is("revoked_at", null)
    .maybeSingle<TokenRow>();

  return data ? toClaimTokenRecord(data) : null;
}

export async function getClaimTokenHistory(
  beneficiaryId: string,
): Promise<ClaimTokenRecord[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("beneficiary_access_tokens")
    .select(TOKEN_COLUMNS)
    .eq("beneficiary_id", beneficiaryId)
    .order("created_at", { ascending: false })
    .returns<TokenRow[]>();

  return (data ?? []).map(toClaimTokenRecord);
}

/**
 * The staff side of a scan. Operators may read this table, so a token that fails
 * can be explained — revoked, expired, or never issued — instead of showing them
 * an empty screen while a penerima waits at the counter.
 */
export async function findClaimToken(
  token: string,
): Promise<ClaimTokenRecord | null> {
  if (!isClaimToken(token)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("beneficiary_access_tokens")
    .select(TOKEN_COLUMNS)
    .eq("token_hash", hashClaimToken(token))
    .maybeSingle<TokenRow>();

  return data ? toClaimTokenRecord(data) : null;
}

export function isTokenExpired(record: ClaimTokenRecord): boolean {
  return new Date(record.expiresAt).getTime() <= Date.now();
}

const DEFAULT_VALIDITY_DAYS = 30;

/**
 * Prefills the expiry input with the end of the event day, falling back to a
 * month out when the event has no date or has already passed. It is only a
 * default: the committee decides how long a link should live.
 */
export function defaultClaimExpiryInput(eventDate: string | null): string {
  if (eventDate) {
    const endOfEventDay = new Date(`${eventDate}T23:59:00${EVENT_UTC_OFFSET}`);

    if (endOfEventDay.getTime() > Date.now()) {
      return toDateTimeInputValue(endOfEventDay.toISOString());
    }
  }

  return toDateTimeInputValue(
    new Date(Date.now() + DEFAULT_VALIDITY_DAYS * 86_400_000).toISOString(),
  );
}
