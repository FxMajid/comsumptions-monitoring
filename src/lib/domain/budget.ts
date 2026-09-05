import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toNumber } from "@/lib/format";

export type BudgetSummary = {
  allocatedAmount: string;
  invoicedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  remainingAmount: string;
};

export type BudgetRealization = {
  budgetId: string;
  code: string;
  name: string;
  status: string;
  allocatedAmount: string;
  invoicedAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  remainingAmount: string;
  utilizationPercent: string | null;
};

export const BUDGET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  ACTIVE: "Aktif",
  LOCKED: "Terkunci",
  CANCELLED: "Dibatalkan",
};

export async function getBudgetSummary(eventId: string): Promise<BudgetSummary> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("event_budget_summary")
    .select(
      "allocated_amount, invoiced_amount, paid_amount, outstanding_amount, remaining_amount",
    )
    .eq("event_id", eventId)
    .maybeSingle<{
      allocated_amount: string;
      invoiced_amount: string;
      paid_amount: string;
      outstanding_amount: string;
      remaining_amount: string;
    }>();

  return {
    allocatedAmount: data?.allocated_amount ?? "0",
    invoicedAmount: data?.invoiced_amount ?? "0",
    paidAmount: data?.paid_amount ?? "0",
    outstandingAmount: data?.outstanding_amount ?? "0",
    remainingAmount: data?.remaining_amount ?? "0",
  };
}

export async function getBudgetRealizations(
  eventId: string,
): Promise<BudgetRealization[]> {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from("budget_realizations")
    .select(
      "budget_id, code, name, status, allocated_amount, invoiced_amount, paid_amount, outstanding_amount, remaining_amount, utilization_percent",
    )
    .eq("event_id", eventId)
    .order("code", { ascending: true })
    .returns<
      {
        budget_id: string;
        code: string;
        name: string;
        status: string;
        allocated_amount: string;
        invoiced_amount: string;
        paid_amount: string;
        outstanding_amount: string;
        remaining_amount: string;
        utilization_percent: string | null;
      }[]
    >();

  return (data ?? []).map((row) => ({
    budgetId: row.budget_id,
    code: row.code,
    name: row.name,
    status: row.status,
    allocatedAmount: row.allocated_amount,
    invoicedAmount: row.invoiced_amount,
    paidAmount: row.paid_amount,
    outstandingAmount: row.outstanding_amount,
    remainingAmount: row.remaining_amount,
    utilizationPercent: row.utilization_percent,
  }));
}

/**
 * Share of the pagu already invoiced. Null when there is no pagu to measure
 * against, which is a different statement from 0%.
 */
export function budgetUtilizationPercent(summary: BudgetSummary): number | null {
  const allocated = toNumber(summary.allocatedAmount);

  if (allocated === 0) {
    return null;
  }

  return (toNumber(summary.invoicedAmount) / allocated) * 100;
}
