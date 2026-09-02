import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getManagerProfile } from "@/lib/actions/guard";
import { describeWriteError } from "@/lib/actions/errors";
import {
  UNAUTHORIZED_MESSAGE,
  errorState,
  okState,
  type ActionState,
} from "@/lib/actions/result";
import { isUuid } from "@/lib/domain/ids";
import { isTransitionAllowed, statusLabel, type StatusEntity } from "@/lib/domain/status";

const StatusSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

const STALE =
  "Status sudah berubah di sisi lain, atau Anda tidak berhak mengubahnya. Muat ulang halaman.";

/**
 * Shared by the slot, plan, and request status buttons.
 *
 * Not exported from a "use server" module on purpose: only the three thin
 * wrappers are reachable as endpoints, and each passes its own entity name.
 *
 * The `from` status travels with the form and is matched in the WHERE clause, so
 * a button clicked on a stale page changes nothing instead of overwriting
 * someone else's decision. The database trigger stays the authority on which
 * transitions are legal at all; the mirror here only produces a better message.
 */
export async function changeStatus(
  entity: StatusEntity,
  rowId: string,
  formData: FormData,
  paths: (id: string) => string[],
): Promise<ActionState> {
  const profile = await getManagerProfile();

  if (!profile) {
    return errorState(UNAUTHORIZED_MESSAGE);
  }

  if (!isUuid(rowId)) {
    return errorState("Baris tidak ditemukan.");
  }

  const parsed = StatusSchema.safeParse({
    from: formData.get("from"),
    to: formData.get("to"),
  });

  if (!parsed.success) {
    return errorState("Permintaan perubahan status tidak lengkap.");
  }

  const { from, to } = parsed.data;

  if (!isTransitionAllowed(entity, from, to)) {
    return errorState(
      `Perpindahan status dari ${statusLabel(entity, from)} ke ${statusLabel(entity, to)} tidak diizinkan.`,
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from(entity)
    .update({ status: to })
    .eq("id", rowId)
    .eq("status", from)
    .select("id")
    .maybeSingle();

  if (error) {
    return describeWriteError(error);
  }

  if (!data) {
    return errorState(STALE);
  }

  paths(rowId).forEach((path) => revalidatePath(path));

  return okState(`Status menjadi ${statusLabel(entity, to)}.`);
}
