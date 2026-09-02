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

/**
 * What a claim link looks like at the moment it is issued. Only the hash of a
 * token is stored, so this payload is the one and only time the link can be
 * read; a lost link is replaced, never recovered.
 */
export type IssuedClaim = {
  beneficiaryCode: string;
  beneficiaryName: string;
  claimUrl: string;
  expiresAt: string;
  /** Present for a single issue, omitted in bulk to keep the response small. */
  qr?: { size: number; path: string };
};

export type ClaimActionState = ActionState & { issued?: IssuedClaim[] };

export const CLAIM_IDLE_STATE: ClaimActionState = { status: "idle" };

export type ClaimFormAction = (
  state: ClaimActionState,
  formData: FormData,
) => Promise<ClaimActionState>;
