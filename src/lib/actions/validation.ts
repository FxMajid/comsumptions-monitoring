import { z } from "zod";
import { errorState, type ActionState } from "@/lib/actions/result";

/** Turns a failed parse into the state the form renders. */
export function invalidState(error: z.ZodError<unknown>): ActionState {
  const flattened = z.flattenError(error);

  return errorState(
    flattened.formErrors[0] ?? "Periksa kembali isian yang ditandai.",
    flattened.fieldErrors,
  );
}

/**
 * Codes are the human key in every unique constraint (event_id, code), so they
 * are normalised to upper case rather than left to whoever typed the form.
 */
export const codeField = z
  .string()
  .trim()
  .min(1, "Kode wajib diisi")
  .max(32, "Kode maksimal 32 karakter")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Kode hanya boleh huruf, angka, garis bawah, dan tanda hubung",
  )
  .transform((value) => value.toUpperCase());

export const nameField = z
  .string()
  .trim()
  .min(1, "Nama wajib diisi")
  .max(120, "Nama maksimal 120 karakter");

export const shortTextField = z
  .string()
  .trim()
  .max(120, "Maksimal 120 karakter")
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const notesField = z
  .string()
  .trim()
  .max(1000, "Catatan maksimal 1000 karakter")
  .transform((value) => (value === "" ? null : value))
  .nullable();

export const quantityField = z.coerce
  .number("Jumlah harus berupa angka")
  .int("Jumlah harus bilangan bulat")
  .min(1, "Jumlah harus lebih dari 0")
  .max(1_000_000, "Jumlah maksimal 1.000.000");

/** Money is optional almost everywhere; an empty input means "not known yet". */
export const optionalMoneyField = z
  .union([
    z.literal(""),
    z.coerce
      .number("Nilai harus berupa angka")
      .nonnegative("Nilai tidak boleh negatif")
      .max(1_000_000_000_000, "Nilai terlalu besar"),
  ])
  .transform((value) => (value === "" ? null : value));

/** HTML date and time inputs, or empty when the field was left blank. */
export const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal wajib diisi");

export const optionalTimeField = z
  .union([z.literal(""), z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Jam tidak sah")])
  .transform((value) => (value === "" ? null : value));

export const optionalDateTimeField = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Waktu tidak sah"),
  ])
  .transform((value) => (value === "" ? null : value));

export const optionalIntegerField = z
  .union([
    z.literal(""),
    z.coerce
      .number("Nilai harus berupa angka")
      .int("Nilai harus bilangan bulat")
      .min(-365, "Terlalu kecil")
      .max(365, "Terlalu besar"),
  ])
  .transform((value) => (value === "" ? null : value));

export const flagField = z
  .union([z.literal("on"), z.literal("true"), z.null(), z.literal("")])
  .transform((value) => value === "on" || value === "true");
