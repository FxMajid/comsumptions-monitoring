import { errorState, type ActionState } from "@/lib/actions/result";

type SupabaseError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * Turns a Postgres error into something a committee member can act on.
 *
 * P0001 is raised by our own triggers — those messages are written for this
 * audience, so they are shown as-is. Everything else is mapped, because raw
 * constraint text names internal columns and helps nobody.
 */
export function describeWriteError(
  error: SupabaseError | null,
  context: { duplicate?: string; blocked?: string } = {},
): ActionState {
  if (!error) {
    return errorState("Perubahan gagal disimpan.");
  }

  switch (error.code) {
    case "P0001":
      return errorState(error.message ?? "Perubahan ditolak oleh aturan data.");
    case "23505":
      return errorState(
        context.duplicate ?? "Kode itu sudah dipakai pada event ini.",
      );
    case "23503":
      return errorState(
        context.blocked ??
          "Data ini masih dipakai baris lain, atau acuan yang dipilih tidak ada.",
      );
    case "23514":
      return errorState("Ada nilai yang di luar batas yang diizinkan.");
    case "22P02":
      return errorState("Ada isian dengan format yang tidak dikenali.");
    case "42501":
      return errorState(
        "Peran Anda tidak diizinkan menulis data ini oleh kebijakan database.",
      );
    default:
      return errorState("Perubahan gagal disimpan. Coba lagi.");
  }
}
