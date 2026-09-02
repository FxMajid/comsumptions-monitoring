import { createSupabaseServerClient } from "@/lib/supabase/server";

export type EntitlementCounts = {
  pending: number;
  partiallyPicked: number;
  pickedUp: number;
};

export async function getEntitlementCounts(
  eventId: string,
): Promise<EntitlementCounts> {
  const supabase = await createSupabaseServerClient();

  async function countByStatus(status: string): Promise<number> {
    const { count } = await supabase
      .from("entitlement_statuses")
      .select("entitlement_id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", status);

    return count ?? 0;
  }

  const [pending, partiallyPicked, pickedUp] = await Promise.all([
    countByStatus("PENDING"),
    countByStatus("PARTIALLY_PICKED"),
    countByStatus("PICKED_UP"),
  ]);

  return { pending, partiallyPicked, pickedUp };
}
