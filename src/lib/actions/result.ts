/**
 * The shape every server action returns and every form reads through
 * useActionState. Kept free of zod so importing it from a Client Component does
 * not pull a validation library into the browser bundle.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionState = {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
};

export const IDLE_STATE: ActionState = { status: "idle" };

export const UNAUTHORIZED_MESSAGE =
  "Sesi berakhir atau peran Anda tidak berhak mengubah data ini. Muat ulang halaman.";

export const NO_EVENT_MESSAGE =
  "Belum ada event. Tambahkan event lebih dulu sebelum mengisi data konsumsi.";

export function okState(message: string): ActionState {
  return { status: "ok", message };
}

export function errorState(
  message: string,
  fieldErrors?: FieldErrors,
): ActionState {
  return { status: "error", message, fieldErrors };
}

/** What a form receives after `.bind(null, id)` has supplied any row id. */
export type FormAction = (
  state: ActionState,
  formData: FormData,
) => Promise<ActionState>;
