import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isClaimToken } from "@/lib/domain/claim-link";
import { hashClaimToken } from "@/lib/domain/claim-token";

/**
 * The participant side of the app. A holder of a claim link has no account, so
 * `anon` reaches the data through two security definer functions and nothing
 * else: both filter on one token row, and neither accepts a beneficiary id, so
 * there is no parameter to bend towards somebody else's entitlements.
 *
 * Both results are parsed rather than cast. A set returning function has no
 * generated type here, and this is the one surface an unauthenticated visitor
 * reaches, so the shape is checked instead of assumed.
 */

const IdentityRowSchema = z.object({
  beneficiary_id: z.uuid(),
  event_code: z.string().nullable(),
  event_name: z.string(),
  beneficiary_code: z.string(),
  beneficiary_name: z.string(),
  beneficiary_type: z.string(),
  beneficiary_category: z.string(),
  beneficiary_quantity: z.number().int(),
  area_name: z.string().nullable(),
  token_expires_at: z.string(),
});

const EntitlementRowSchema = z.object({
  entitlement_id: z.uuid(),
  item_code: z.string(),
  item_name: z.string(),
  unit_of_measure: z.string(),
  slot_code: z.string(),
  slot_name: z.string(),
  slot_date: z.string(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  pickup_deadline: z.string().nullable(),
  slot_status: z.string(),
  entitlement_quantity: z.number().int(),
  picked_quantity: z.number().int(),
  remaining_quantity: z.number().int(),
  status: z.string(),
});

const IdentityListSchema = z.array(IdentityRowSchema);
const EntitlementListSchema = z.array(EntitlementRowSchema);

export type ClaimIdentity = {
  beneficiaryId: string;
  eventCode: string | null;
  eventName: string;
  beneficiaryCode: string;
  beneficiaryName: string;
  beneficiaryType: string;
  beneficiaryCategory: string;
  beneficiaryQuantity: number;
  areaName: string | null;
  tokenExpiresAt: string;
};

export type ClaimEntitlement = {
  id: string;
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  slotCode: string;
  slotName: string;
  slotDate: string;
  startsAt: string | null;
  endsAt: string | null;
  pickupDeadline: string | null;
  slotStatus: string;
  quantity: number;
  pickedQuantity: number;
  remainingQuantity: number;
  status: string;
};

export type Claim = {
  identity: ClaimIdentity;
  entitlements: ClaimEntitlement[];
};

/**
 * Resolves a raw token from a link or QR code. Returns null for anything the
 * database refuses to match — unknown, revoked, expired, or belonging to an
 * inactive beneficiary — so the caller cannot tell those cases apart.
 */
export async function resolveClaim(token: string): Promise<Claim | null> {
  if (!isClaimToken(token)) {
    return null;
  }

  const tokenHash = hashClaimToken(token);
  const supabase = await createSupabaseServerClient();

  const [identityResult, entitlementResult] = await Promise.all([
    supabase.rpc("resolve_claim_token", { p_token_hash: tokenHash }),
    supabase.rpc("get_claim_entitlements", { p_token_hash: tokenHash }),
  ]);

  const identity = IdentityListSchema.safeParse(identityResult.data ?? []);
  const row = identity.success ? identity.data[0] : undefined;

  if (!row) {
    return null;
  }

  const entitlements = EntitlementListSchema.safeParse(
    entitlementResult.data ?? [],
  );

  return {
    identity: {
      beneficiaryId: row.beneficiary_id,
      eventCode: row.event_code,
      eventName: row.event_name,
      beneficiaryCode: row.beneficiary_code,
      beneficiaryName: row.beneficiary_name,
      beneficiaryType: row.beneficiary_type,
      beneficiaryCategory: row.beneficiary_category,
      beneficiaryQuantity: row.beneficiary_quantity,
      areaName: row.area_name,
      tokenExpiresAt: row.token_expires_at,
    },
    entitlements: (entitlements.success ? entitlements.data : []).map((item) => ({
      id: item.entitlement_id,
      itemCode: item.item_code,
      itemName: item.item_name,
      unitOfMeasure: item.unit_of_measure,
      slotCode: item.slot_code,
      slotName: item.slot_name,
      slotDate: item.slot_date,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      pickupDeadline: item.pickup_deadline,
      slotStatus: item.slot_status,
      quantity: item.entitlement_quantity,
      pickedQuantity: item.picked_quantity,
      remainingQuantity: item.remaining_quantity,
      status: item.status,
    })),
  };
}
