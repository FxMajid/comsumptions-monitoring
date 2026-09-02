"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getManagerProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  NO_EVENT_MESSAGE,
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
  type ClaimActionState,
  type IssuedClaim,
} from "@/lib/actions/result";
import {
  codeField,
  dateTimeField,
  flagField,
  invalidState,
  nameField,
  quantityField,
  shortTextField,
  toTimestamptz,
} from "@/lib/actions/validation";
import { requireActiveEventId } from "@/lib/domain/event";
import { isUuid } from "@/lib/domain/ids";
import {
  BENEFICIARY_CATEGORIES,
  BENEFICIARY_ORIGINS,
  BENEFICIARY_TYPES,
} from "@/lib/domain/beneficiary";
import { claimPath } from "@/lib/domain/claim-link";
import {
  generateClaimToken,
  getAppOrigin,
  hashClaimToken,
} from "@/lib/domain/claim-token";
import { toQrMatrix } from "@/lib/qr";

const DUPLICATE_CODE = "Kode penerima itu sudah dipakai pada event ini.";

const optionalUuidField = z
  .union([z.literal(""), z.uuid("Pilihan tidak sah")])
  .transform((value) => (value === "" ? null : value));

/**
 * `quantity = 1` for an individual is a database constraint, not a preference:
 * a group carries its own head count instead of being expanded into fictional
 * people. Normalising here turns a 23514 into a field message.
 */
const BeneficiarySchema = z
  .object({
    code: codeField,
    name: nameField,
    beneficiaryType: z.enum(BENEFICIARY_TYPES, { error: "Jenis penerima tidak sah" }),
    beneficiaryCategory: z.enum(BENEFICIARY_CATEGORIES, {
      error: "Kategori tidak sah",
    }),
    quantity: quantityField,
    origin: z.enum(BENEFICIARY_ORIGINS, { error: "Asal penerima tidak sah" }),
    areaId: optionalUuidField,
    picHbd: shortTextField,
    employeeGroup: shortTextField,
    sourceReference: shortTextField,
    isActive: flagField,
  })
  .refine(
    (value) => value.beneficiaryType === "GROUP" || value.quantity === 1,
    { error: "Penerima individu selalu berjumlah 1", path: ["quantity"] },
  );

function readBeneficiary(formData: FormData) {
  return BeneficiarySchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    beneficiaryType: formData.get("beneficiaryType"),
    beneficiaryCategory: formData.get("beneficiaryCategory"),
    quantity: formData.get("quantity"),
    origin: formData.get("origin"),
    areaId: formData.get("areaId"),
    picHbd: formData.get("picHbd"),
    employeeGroup: formData.get("employeeGroup"),
    sourceReference: formData.get("sourceReference"),
    isActive: formData.get("isActive"),
  });
}

function revalidateBeneficiaries(beneficiaryId?: string): void {
  revalidatePath("/master/penerima");
  revalidatePath("/pengambilan");

  if (beneficiaryId) {
    revalidatePath(`/master/penerima/${beneficiaryId}`);
    revalidatePath(`/pengambilan/penerima/${beneficiaryId}`);
  }
}

export async function createBeneficiary(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = readBeneficiary(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("beneficiaries").insert({
    event_id: eventId,
    beneficiary_code: parsed.data.code,
    name: parsed.data.name,
    beneficiary_type: parsed.data.beneficiaryType,
    beneficiary_category: parsed.data.beneficiaryCategory,
    quantity: parsed.data.quantity,
    origin: parsed.data.origin,
    area_id: parsed.data.areaId,
    pic_hbd: parsed.data.picHbd,
    employee_group: parsed.data.employeeGroup,
    source_reference: parsed.data.sourceReference,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  revalidateBeneficiaries();

  return okState(`Penerima ${parsed.data.code} ditambahkan.`);
}

export async function updateBeneficiary(
  beneficiaryId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(beneficiaryId)) {
    return errorState("Penerima tidak ditemukan.");
  }

  const parsed = readBeneficiary(formData);

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("beneficiaries")
    .update({
      beneficiary_code: parsed.data.code,
      name: parsed.data.name,
      beneficiary_type: parsed.data.beneficiaryType,
      beneficiary_category: parsed.data.beneficiaryCategory,
      quantity: parsed.data.quantity,
      origin: parsed.data.origin,
      area_id: parsed.data.areaId,
      pic_hbd: parsed.data.picHbd,
      employee_group: parsed.data.employeeGroup,
      source_reference: parsed.data.sourceReference,
      is_active: parsed.data.isActive,
    })
    .eq("id", beneficiaryId)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error, { duplicate: DUPLICATE_CODE });
  }

  if (!data) {
    return errorState("Penerima tidak ditemukan atau Anda tidak berhak mengubahnya.");
  }

  revalidateBeneficiaries(beneficiaryId);

  return okState("Penerima diperbarui.");
}

/**
 * An expiry is mandatory on the table. It is validated here as well so a date
 * already in the past comes back as a field message instead of as constraint
 * `beneficiary_access_tokens_expiry_after_creation`.
 */
const ExpirySchema = z.object({
  expiresAt: dateTimeField.refine(
    (value) => new Date(toTimestamptz(value)).getTime() > Date.now(),
    "Masa berlaku harus di masa depan",
  ),
});

const ReasonSchema = z.object({ reason: shortTextField });

const BulkIssueSchema = ExpirySchema.extend({
  category: z
    .union([z.literal(""), z.enum(BENEFICIARY_CATEGORIES)])
    .transform((value) => (value === "" ? null : value)),
  areaId: optionalUuidField,
});

/**
 * One run issues at most this many links. The action returns every raw token it
 * created, and that response is the only copy, so a run that is too large to
 * read back is worse than two runs.
 */
const BULK_ISSUE_LIMIT = 500;

type LiveTokenRow = { id: string };

type BeneficiaryIdentityRow = {
  id: string;
  event_id: string;
  beneficiary_code: string;
  name: string;
  is_active: boolean;
};

export async function issueClaimToken(
  beneficiaryId: string,
  _prev: ClaimActionState,
  formData: FormData,
): Promise<ClaimActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(beneficiaryId)) {
    return errorState("Penerima tidak ditemukan.");
  }

  const parsed = ExpirySchema.safeParse({ expiresAt: formData.get("expiresAt") });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const replace = formData.get("replace") === "on";
  const supabase = await createSupabaseServerClient();

  const { data: beneficiary } = await supabase
    .from("beneficiaries")
    .select("id, event_id, beneficiary_code, name, is_active")
    .eq("id", beneficiaryId)
    .maybeSingle<BeneficiaryIdentityRow>();

  if (!beneficiary) {
    return errorState("Penerima tidak ditemukan.");
  }

  if (!beneficiary.is_active) {
    return errorState(
      "Penerima nonaktif tidak bisa diberi QR. Aktifkan dulu penerimanya.",
    );
  }

  const { data: live } = await supabase
    .from("beneficiary_access_tokens")
    .select("id")
    .eq("beneficiary_id", beneficiaryId)
    .is("revoked_at", null)
    .maybeSingle<LiveTokenRow>();

  if (live && !replace) {
    return errorState(
      "Penerima ini masih punya QR aktif. Pakai tombol cabut dan terbitkan ulang bila QR lamanya hilang.",
    );
  }

  // Revoking first is what makes the reissue safe: the partial unique index
  // allows one live token per penerima, so an already printed QR can never stay
  // valid beside its replacement.
  if (live) {
    const { error: revokeError } = await supabase
      .from("beneficiary_access_tokens")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: profile.id,
        revocation_reason: "Diganti QR baru",
      })
      .eq("id", live.id)
      .is("revoked_at", null);

    if (revokeError) {
      return describeWriteError(revokeError);
    }
  }

  const token = generateClaimToken();
  const expiresAt = toTimestamptz(parsed.data.expiresAt);

  const { error } = await supabase.from("beneficiary_access_tokens").insert({
    event_id: beneficiary.event_id,
    beneficiary_id: beneficiary.id,
    token_hash: hashClaimToken(token),
    expires_at: expiresAt,
    created_by: profile.id,
  });

  if (error) {
    return describeWriteError(error, {
      duplicate: "Penerima ini sudah punya QR aktif. Muat ulang halaman.",
    });
  }

  const claimUrl = `${await getAppOrigin()}${claimPath(token)}`;

  revalidateBeneficiaries(beneficiaryId);

  return {
    ...okState(
      live
        ? `QR ${beneficiary.beneficiary_code} diterbitkan ulang. QR lama tidak berlaku lagi.`
        : `QR ${beneficiary.beneficiary_code} diterbitkan.`,
    ),
    issued: [
      {
        beneficiaryCode: beneficiary.beneficiary_code,
        beneficiaryName: beneficiary.name,
        claimUrl,
        expiresAt,
        qr: toQrMatrix(claimUrl),
      },
    ],
  };
}

export async function revokeClaimToken(
  beneficiaryId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(beneficiaryId)) {
    return errorState("Penerima tidak ditemukan.");
  }

  const parsed = ReasonSchema.safeParse({ reason: formData.get("reason") });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("beneficiary_access_tokens")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: profile.id,
      revocation_reason: parsed.data.reason,
    })
    .eq("beneficiary_id", beneficiaryId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error);
  }

  if (!data) {
    return errorState("Tidak ada QR aktif untuk dicabut.");
  }

  revalidateBeneficiaries(beneficiaryId);

  return okState("QR dicabut. Tautan lamanya langsung tidak berlaku.");
}

/**
 * Issues links for every matching active penerima that has none yet. Penerima
 * who already hold a live QR are skipped rather than replaced: a bulk run must
 * never invalidate sheets that are already printed and handed out.
 */
export async function issueClaimTokens(
  _prev: ClaimActionState,
  formData: FormData,
): Promise<ClaimActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  const eventId = await requireActiveEventId();

  if (!eventId) {
    return errorState(NO_EVENT_MESSAGE);
  }

  const parsed = BulkIssueSchema.safeParse({
    expiresAt: formData.get("expiresAt"),
    category: formData.get("category"),
    areaId: formData.get("areaId"),
  });

  if (!parsed.success) {
    return invalidState(parsed.error);
  }

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("beneficiaries")
    .select("id, event_id, beneficiary_code, name, is_active")
    .eq("event_id", eventId)
    .eq("is_active", true);

  if (parsed.data.category) {
    query = query.eq("beneficiary_category", parsed.data.category);
  }

  if (parsed.data.areaId) {
    query = query.eq("area_id", parsed.data.areaId);
  }

  const [{ data: candidates, error: candidateError }, { data: liveTokens }] =
    await Promise.all([
      query.order("beneficiary_code").returns<BeneficiaryIdentityRow[]>(),
      supabase
        .from("beneficiary_access_tokens")
        .select("beneficiary_id")
        .eq("event_id", eventId)
        .is("revoked_at", null)
        .returns<{ beneficiary_id: string }[]>(),
    ]);

  if (candidateError) {
    return describeWriteError(candidateError);
  }

  const alreadyIssued = new Set((liveTokens ?? []).map((row) => row.beneficiary_id));
  const pending = (candidates ?? []).filter((row) => !alreadyIssued.has(row.id));

  if (pending.length === 0) {
    return okState(
      candidates && candidates.length > 0
        ? "Semua penerima yang cocok sudah punya QR aktif."
        : "Tidak ada penerima aktif yang cocok dengan filter itu.",
    );
  }

  const batch = pending.slice(0, BULK_ISSUE_LIMIT);
  const expiresAt = toTimestamptz(parsed.data.expiresAt);
  const origin = await getAppOrigin();

  const issued: IssuedClaim[] = [];
  const rows = batch.map((row) => {
    const token = generateClaimToken();

    issued.push({
      beneficiaryCode: row.beneficiary_code,
      beneficiaryName: row.name,
      claimUrl: `${origin}${claimPath(token)}`,
      expiresAt,
    });

    return {
      event_id: eventId,
      beneficiary_id: row.id,
      token_hash: hashClaimToken(token),
      expires_at: expiresAt,
      created_by: profile.id,
    };
  });

  const { error } = await supabase.from("beneficiary_access_tokens").insert(rows);

  if (error) {
    return describeWriteError(error, {
      duplicate:
        "Ada penerima yang baru saja diberi QR oleh orang lain. Muat ulang halaman lalu jalankan lagi.",
    });
  }

  revalidateBeneficiaries();

  const remaining = pending.length - batch.length;

  return {
    ...okState(
      remaining > 0
        ? `${batch.length} QR diterbitkan. Sisa ${remaining} penerima, jalankan sekali lagi.`
        : `${batch.length} QR diterbitkan.`,
    ),
    issued,
  };
}
