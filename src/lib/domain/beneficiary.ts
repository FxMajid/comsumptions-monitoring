import { createSupabaseServerClient } from "@/lib/supabase/server";

export const BENEFICIARY_TYPES = ["INDIVIDUAL", "GROUP"] as const;
export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number];

export const BENEFICIARY_TYPE_LABELS: Record<BeneficiaryType, string> = {
  INDIVIDUAL: "Individu",
  GROUP: "Grup",
};

export function beneficiaryTypeLabel(value: string): string {
  return BENEFICIARY_TYPE_LABELS[value as BeneficiaryType] ?? value;
}

export const BENEFICIARY_CATEGORIES = [
  "PARTICIPANT",
  "COMMITTEE",
  "PIC",
  "GUEST",
  "OTHER",
] as const;
export type BeneficiaryCategory = (typeof BENEFICIARY_CATEGORIES)[number];

export const BENEFICIARY_CATEGORY_LABELS: Record<BeneficiaryCategory, string> = {
  PARTICIPANT: "Peserta",
  COMMITTEE: "Panitia",
  PIC: "PIC",
  GUEST: "Tamu",
  OTHER: "Lainnya",
};

export function beneficiaryCategoryLabel(value: string): string {
  return BENEFICIARY_CATEGORY_LABELS[value as BeneficiaryCategory] ?? value;
}

export const BENEFICIARY_ORIGINS = ["INTERNAL", "EXTERNAL"] as const;
export type BeneficiaryOrigin = (typeof BENEFICIARY_ORIGINS)[number];

export const BENEFICIARY_ORIGIN_LABELS: Record<BeneficiaryOrigin, string> = {
  INTERNAL: "Internal",
  EXTERNAL: "Eksternal",
};

export function beneficiaryOriginLabel(value: string): string {
  return BENEFICIARY_ORIGIN_LABELS[value as BeneficiaryOrigin] ?? value;
}

export type Beneficiary = {
  id: string;
  code: string;
  name: string;
  beneficiaryType: string;
  beneficiaryCategory: string;
  quantity: number;
  origin: string;
  areaId: string | null;
  picHbd: string | null;
  employeeGroup: string | null;
  sourceReference: string | null;
  isActive: boolean;
};

const BENEFICIARY_COLUMNS =
  "id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity, origin, area_id, pic_hbd, employee_group, source_reference, is_active";

type BeneficiaryRow = {
  id: string;
  beneficiary_code: string;
  name: string;
  beneficiary_type: string;
  beneficiary_category: string;
  quantity: number;
  origin: string;
  area_id: string | null;
  pic_hbd: string | null;
  employee_group: string | null;
  source_reference: string | null;
  is_active: boolean;
};

function toBeneficiary(row: BeneficiaryRow): Beneficiary {
  return {
    id: row.id,
    code: row.beneficiary_code,
    name: row.name,
    beneficiaryType: row.beneficiary_type,
    beneficiaryCategory: row.beneficiary_category,
    quantity: row.quantity,
    origin: row.origin,
    areaId: row.area_id,
    picHbd: row.pic_hbd,
    employeeGroup: row.employee_group,
    sourceReference: row.source_reference,
    isActive: row.is_active,
  };
}

/**
 * PostgREST reads `or` as a comma separated list of filters, so a search term
 * containing a comma would otherwise be parsed as a second filter. Wrapping the
 * value in double quotes makes it literal; only the quote and the backslash
 * still need escaping.
 */
function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (match) => `\\${match}`)}"`;
}

/** Kept low enough that the list page stays a single readable screen. */
export const BENEFICIARY_PAGE_SIZE = 100;

export type BeneficiaryQuery = {
  search?: string | null;
  areaId?: string | null;
  category?: string | null;
  limit?: number;
};

export async function getBeneficiaries(
  eventId: string,
  query: BeneficiaryQuery = {},
): Promise<Beneficiary[]> {
  const supabase = await createSupabaseServerClient();

  let request = supabase
    .from("beneficiaries")
    .select(BENEFICIARY_COLUMNS)
    .eq("event_id", eventId);

  const search = query.search?.trim();

  if (search) {
    const pattern = quoteFilterValue(`%${search}%`);

    request = request.or(
      `name.ilike.${pattern},beneficiary_code.ilike.${pattern}`,
    );
  }

  if (query.areaId) {
    request = request.eq("area_id", query.areaId);
  }

  if (query.category) {
    request = request.eq("beneficiary_category", query.category);
  }

  const { data } = await request
    .order("beneficiary_code", { ascending: true })
    .limit(query.limit ?? BENEFICIARY_PAGE_SIZE)
    .returns<BeneficiaryRow[]>();

  return (data ?? []).map(toBeneficiary);
}

export async function getBeneficiary(id: string): Promise<Beneficiary | null> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("beneficiaries")
    .select(BENEFICIARY_COLUMNS)
    .eq("id", id)
    .maybeSingle<BeneficiaryRow>();

  return data ? toBeneficiary(data) : null;
}

export type BeneficiaryTotals = {
  rows: number;
  activeRows: number;
  portions: number;
};

/**
 * Counted in Postgres rather than over a fetched page, because a group counts
 * as one row but many portions and the list is capped.
 */
export async function getBeneficiaryTotals(
  eventId: string,
): Promise<BeneficiaryTotals> {
  const supabase = await createSupabaseServerClient();

  const [all, active, quantities] = await Promise.all([
    supabase
      .from("beneficiaries")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    supabase
      .from("beneficiaries")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("is_active", true),
    supabase
      .from("beneficiaries")
      .select("quantity")
      .eq("event_id", eventId)
      .eq("is_active", true)
      .returns<{ quantity: number }[]>(),
  ]);

  return {
    rows: all.count ?? 0,
    activeRows: active.count ?? 0,
    portions: (quantities.data ?? []).reduce((sum, row) => sum + row.quantity, 0),
  };
}
