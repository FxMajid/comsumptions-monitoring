import { z } from "zod";
import { normalizeKey, normalizeText, nullableText } from "./normalize";

export const PANITIA_ATTENDANCE_VALUES = ["HADIR", "TIDAK_HADIR", "KOSONG"] as const;
export type PanitiaImportAttendance = (typeof PANITIA_ATTENDANCE_VALUES)[number];
export type PanitiaImportOrigin = "INTERNAL" | "EXTERNAL";

export const PANITIA_IMPORT_SLOTS = [
  { key: "h2Siang", attendanceHeader: "KEHADIRAN H-2 SIANG", activityHeader: "KEGIATAN H-2 SIANG" },
  { key: "h1Siang", attendanceHeader: "KEHADIRAN H-1 SIANG", activityHeader: "KEGIATAN H-1 SIANG" },
  { key: "h1Malam", attendanceHeader: "KEHADIRAN H-1 MALAM", activityHeader: "KEGIATAN H-1 MALAM" },
  { key: "hPagi", attendanceHeader: "KEHADIRAN H PAGI", activityHeader: null },
  { key: "hSiang", attendanceHeader: "KEHADIRAN H SIANG", activityHeader: null },
  { key: "hMalam", attendanceHeader: "KEHADIRAN H MALAM", activityHeader: null },
  { key: "hPlus1", attendanceHeader: "KEHADIRAN H+1", activityHeader: "KEGIATAN H+1" },
] as const;

export type PanitiaImportSlotKey = (typeof PANITIA_IMPORT_SLOTS)[number]["key"];
export type PanitiaImportSlots = Record<PanitiaImportSlotKey, PanitiaImportAttendance>;
export type PanitiaImportActivities = Partial<Record<PanitiaImportSlotKey, string>>;

export type PanitiaImportRecord = {
  rowNumber: number;
  stableId: string | null;
  number: number | null;
  name: string;
  picHbd: string | null;
  employeeGroup: string | null;
  pickupPicName: string | null;
  pickupPicPhone: string | null;
  quantity: number;
  beneficiaryType: "INDIVIDUAL" | "GROUP";
  origin: PanitiaImportOrigin;
  eats: boolean;
  attendance: PanitiaImportSlots;
  activities: PanitiaImportActivities;
  areaId: string | null;
};

export type PanitiaValidationIssue = {
  row: number;
  column: string | null;
  message: string;
};

const NonEmptyTextSchema = z.string().min(1, "Wajib diisi").max(120, "Maksimal 120 karakter");
const OptionalTextSchema = z.string().max(120, "Maksimal 120 karakter").nullable();
const StableIdSchema = z.string().max(120, "ID maksimal 120 karakter").nullable();
const PhoneSchema = z
  .string()
  .max(32, "Nomor telepon maksimal 32 karakter")
  .refine((value) => !/[eE][+-]?\d/u.test(value), "Nomor telepon tidak boleh berupa notasi ilmiah")
  .regex(/^\+?[0-9][0-9() .-]*$/u, "Nomor telepon hanya boleh memuat angka dan pemisah telepon")
  .refine((value) => {
    const compact = value.replace(/[() .-]/gu, "");
    const normalized = compact.startsWith("+")
      ? compact
      : compact.replace(/^0/u, "62");
    return /^\+?[0-9]{9,15}$/u.test(normalized);
  }, "Nomor telepon harus menjadi 9-15 digit setelah dinormalisasi")
  .nullable();
const SlotKeySchema = z.enum(PANITIA_IMPORT_SLOTS.map((slot) => slot.key));

export const PanitiaImportRecordSchema = z.object({
  rowNumber: z.number().int().positive(),
  stableId: StableIdSchema,
  number: z.number().int().positive().nullable(),
  name: NonEmptyTextSchema,
  picHbd: OptionalTextSchema,
  employeeGroup: OptionalTextSchema,
  pickupPicName: OptionalTextSchema,
  pickupPicPhone: PhoneSchema,
  quantity: z.number().int("Qty harus bilangan bulat").positive("Qty harus lebih dari 0"),
  beneficiaryType: z.enum(["INDIVIDUAL", "GROUP"]),
  origin: z.enum(["INTERNAL", "EXTERNAL"]),
  eats: z.boolean(),
  attendance: z.record(SlotKeySchema, z.enum(PANITIA_ATTENDANCE_VALUES)),
  activities: z.partialRecord(SlotKeySchema, z.string().min(1).max(1000)),
  areaId: z.string().min(1).nullable(),
});

export function parseOrigin(value: string): PanitiaImportOrigin | null {
  const key = normalizeKey(value);
  if (key === "INTERNAL") return "INTERNAL";
  if (key === "EKSTERNAL" || key === "EXTERNAL") return "EXTERNAL";
  return null;
}

export function parseYesNo(value: string): boolean | null {
  const key = normalizeKey(value);
  if (key === "YES") return true;
  if (key === "NO") return false;
  return null;
}

export function parseAttendance(value: string): PanitiaImportAttendance | null {
  const key = normalizeKey(value).replaceAll("_", " ");
  if (key === "HADIR") return "HADIR";
  if (key === "TIDAK HADIR") return "TIDAK_HADIR";
  if (key === "" || key === "KOSONG") return "KOSONG";
  return null;
}

export function parsePositiveInteger(value: string): number | null {
  const normalized = normalizeText(value);
  if (!/^[1-9]\d*$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function normalizedImportText(value: string): string {
  return normalizeText(value);
}

export function normalizedNullableImportText(value: string): string | null {
  return nullableText(value);
}
