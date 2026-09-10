import { parseCsv, unprotectCsvFormula } from "./csv";
import { normalizeKey } from "./normalize";
import {
  PANITIA_IMPORT_SLOTS,
  PanitiaImportRecordSchema,
  normalizedImportText,
  normalizedNullableImportText,
  parseAttendance,
  parseOrigin,
  parsePositiveInteger,
  parseYesNo,
  type PanitiaImportActivities,
  type PanitiaImportRecord,
  type PanitiaImportSlots,
  type PanitiaValidationIssue,
} from "./schema";

export type PanitiaCsvFormat = "legacy" | "legacy-docs" | "canonical";
export type PanitiaAreaSnapshot = { id: string; code: string; name: string };
export type PanitiaCsvImportResult = {
  format: PanitiaCsvFormat | null;
  records: PanitiaImportRecord[];
  issues: PanitiaValidationIssue[];
};

const LEGACY_21_HEADERS = [
  "", "NAMA", "PIC HBD", "EMPLOYEE", "AREA KERJA",
  "NAMA PIC PENANGGUNG JAWAB PENGAMBILAN KONSUMSI", "KONTAK WA PIC",
  "QTY", "KATEGORI", "MAKAN (YES/NO)", "SIANG H-2", "KEGIATAN",
  "SIANG H-1", "KEGIATAN", "MALAM-1", "KEGIATAN", "PAGI H",
  "SIANG H", "MALAM H", "H+1", "KEGIATAN",
] as const;
const LEGACY_21_SLOT_COLUMNS = [
  { key: "h2Siang", attendance: 10, activity: 11 },
  { key: "h1Siang", attendance: 12, activity: 13 },
  { key: "h1Malam", attendance: 14, activity: 15 },
  { key: "hPagi", attendance: 16, activity: null },
  { key: "hSiang", attendance: 17, activity: null },
  { key: "hMalam", attendance: 18, activity: null },
  { key: "hPlus1", attendance: 19, activity: 20 },
] as const;

const LEGACY_DOCS_WIDTH = 20;
const LEGACY_DOCS_HEADER = [
  "NO", "NAMA", "PIC HBD", "EMPLOYEE",
  "NAMA PIC PENANGGUNG JAWAB PENGAMBILAN KONSUMSI", "KONTAK WA PIC",
  "QTY", "KATEGORI", "MAKAN (YES/NO)", "KEHADIRAN PANITIA DI VENUE",
  "", "", "", "", "", "", "", "", "", "",
] as const;
const LEGACY_DOCS_SLOT_COLUMNS = [
  { key: "h2Siang", attendance: 9, activity: 10 },
  { key: "h1Siang", attendance: 11, activity: 12 },
  { key: "h1Malam", attendance: 13, activity: 14 },
  { key: "hPagi", attendance: 15, activity: null },
  { key: "hSiang", attendance: 16, activity: null },
  { key: "hMalam", attendance: 17, activity: null },
  { key: "hPlus1", attendance: 18, activity: 19 },
] as const;

export const PANITIA_CANONICAL_HEADERS = [
  "ID PENERIMA", "NO", "NAMA", "PIC HBD", "EMPLOYEE",
  "NAMA PIC PENANGGUNG JAWAB PENGAMBILAN KONSUMSI", "KONTAK WA PIC",
  "QTY", "KATEGORI", "MAKAN (YES/NO)", "AREA",
  ...PANITIA_IMPORT_SLOTS.flatMap((slot) =>
    slot.activityHeader ? [slot.attendanceHeader, slot.activityHeader] : [slot.attendanceHeader],
  ),
] as const;

type RawRecord = Omit<PanitiaImportRecord, "origin" | "eats" | "quantity" | "attendance"> & {
  origin: PanitiaImportRecord["origin"] | null;
  eats: boolean | null;
  quantity: number | null;
  attendance: Partial<PanitiaImportSlots>;
};

function issue(row: number, column: string | null, message: string): PanitiaValidationIssue {
  return { row, column, message };
}

function rowIsEmpty(row: readonly string[]): boolean {
  return row.every((cell) => normalizedImportText(cell) === "");
}

function headersEqual(row: readonly string[], expected: readonly string[]): boolean {
  return row.length === expected.length && row.every((cell, index) => normalizeKey(cell) === expected[index]);
}

function buildAreaIndex(areas: readonly PanitiaAreaSnapshot[]): {
  values: Map<string, string | null>;
  duplicateKeys: Set<string>;
} {
  const values = new Map<string, string | null>();
  const duplicateKeys = new Set<string>();
  for (const area of areas) {
    for (const label of [area.id, area.code, area.name]) {
      const key = normalizeKey(label);
      const existing = values.get(key);
      if (existing !== undefined && existing !== area.id) {
        values.set(key, null);
        duplicateKeys.add(key);
      } else if (!duplicateKeys.has(key)) {
        values.set(key, area.id);
      }
    }
  }
  return { values, duplicateKeys };
}

function resolveArea(
  value: string,
  rowNumber: number,
  areaIndex: ReturnType<typeof buildAreaIndex>,
  issues: PanitiaValidationIssue[],
): string | null {
  const label = normalizedImportText(value);
  if (label === "") return null;
  const key = normalizeKey(label);
  if (areaIndex.duplicateKeys.has(key)) {
    issues.push(issue(rowNumber, "AREA", `Area "${label}" ambigu; gunakan ID atau kode area yang unik`));
    return null;
  }
  const areaId = areaIndex.values.get(key);
  if (!areaId) {
    issues.push(issue(rowNumber, "AREA", `Area "${label}" tidak ditemukan pada snapshot`));
    return null;
  }
  return areaId;
}

function collectZodIssues(raw: RawRecord, rowNumber: number, issues: PanitiaValidationIssue[]): PanitiaImportRecord | null {
  const parsed = PanitiaImportRecordSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const zodIssue of parsed.error.issues) {
    issues.push(issue(rowNumber, zodIssue.path.map(String).join(".") || null, zodIssue.message));
  }
  return null;
}

function parseCommon(
  row: readonly string[], rowNumber: number, identityOffset: number, detailOffset: number,
  attendanceColumns: readonly { key: keyof PanitiaImportSlots; attendance: number; activity: number | null }[],
  areaValue: string, areaIndex: ReturnType<typeof buildAreaIndex>, issues: PanitiaValidationIssue[],
  stableIdColumn: number | null = null,
): PanitiaImportRecord | null {
  const quantity = parsePositiveInteger(row[6 + detailOffset] ?? "");
  const origin = parseOrigin(row[7 + detailOffset] ?? "");
  const eats = parseYesNo(row[8 + detailOffset] ?? "");
  if (quantity === null) issues.push(issue(rowNumber, "QTY", "Qty harus bilangan bulat positif"));
  if (origin === null) issues.push(issue(rowNumber, "KATEGORI", "Kategori harus Internal atau Eksternal"));
  if (eats === null) issues.push(issue(rowNumber, "MAKAN (YES/NO)", "Makan harus YES atau NO"));

  const attendance: Partial<PanitiaImportSlots> = {};
  const activities: PanitiaImportActivities = {};
  for (const slot of attendanceColumns) {
    const parsed = parseAttendance(row[slot.attendance] ?? "");
    if (parsed === null) {
      issues.push(issue(rowNumber, PANITIA_IMPORT_SLOTS.find((item) => item.key === slot.key)?.attendanceHeader ?? String(slot.key), "Kehadiran harus Hadir, Tidak Hadir, atau kosong"));
    } else {
      attendance[slot.key] = parsed;
    }
    if (slot.activity !== null) {
      const activity = normalizedNullableImportText(row[slot.activity] ?? "");
      if (activity) activities[slot.key] = activity;
    }
  }

  const raw: RawRecord = {
    rowNumber,
    stableId: stableIdColumn === null ? null : normalizedNullableImportText(row[stableIdColumn] ?? ""),
    number: parsePositiveInteger(row[identityOffset] ?? ""),
    name: normalizedImportText(row[1 + identityOffset] ?? ""),
    picHbd: normalizedNullableImportText(row[2 + identityOffset] ?? ""),
    employeeGroup: normalizedNullableImportText(row[3 + identityOffset] ?? ""),
    pickupPicName: normalizedNullableImportText(row[4 + detailOffset] ?? ""),
    pickupPicPhone: normalizedNullableImportText(row[5 + detailOffset] ?? ""),
    quantity,
    beneficiaryType: quantity !== null && quantity > 1 ? "GROUP" : "INDIVIDUAL",
    origin,
    eats,
    attendance,
    activities,
    areaId: resolveArea(areaValue, rowNumber, areaIndex, issues),
  };
  if (quantity === null || origin === null || eats === null || Object.keys(attendance).length !== PANITIA_IMPORT_SLOTS.length) return null;
  return collectZodIssues(raw, rowNumber, issues);
}

function detectFormat(rows: readonly (readonly string[])[]): PanitiaCsvFormat | null {
  const first = rows[0] ?? [];
  if (headersEqual(first, LEGACY_21_HEADERS)) return "legacy";
  if (headersEqual(first, LEGACY_DOCS_HEADER)) return "legacy-docs";
  if (headersEqual(first, PANITIA_CANONICAL_HEADERS)) return "canonical";
  return null;
}

export function importPanitiaCsv(text: string, areas: readonly PanitiaAreaSnapshot[] = []): PanitiaCsvImportResult {
  const parsedRows = parseCsv(text);
  const rows = parsedRows.map((row, index) =>
    index === 0 ? row : row.map(unprotectCsvFormula),
  );
  const issues: PanitiaValidationIssue[] = [];
  const format = detectFormat(rows);
  if (!format) return { format: null, records: [], issues: [issue(1, null, "Header CSV tidak cocok dengan format legacy 21 kolom atau canonical")] };

  let dataStart = 1;
  if (format === "legacy-docs") {
    if (rows.length < 3 || rows[1]?.length !== LEGACY_DOCS_WIDTH || rows[2]?.length !== LEGACY_DOCS_WIDTH) {
      return { format, records: [], issues: [issue(2, null, "Format legacy docs wajib memiliki tiga baris header dan tepat 20 kolom")] };
    }
    dataStart = 3;
  }

  const areaIndex = buildAreaIndex(areas);
  const records: PanitiaImportRecord[] = [];
  const canonicalSlotColumns = PANITIA_IMPORT_SLOTS.map((slot) => ({
    key: slot.key,
    attendance: PANITIA_CANONICAL_HEADERS.indexOf(slot.attendanceHeader),
    activity: slot.activityHeader ? PANITIA_CANONICAL_HEADERS.indexOf(slot.activityHeader) : null,
  }));
  for (let index = dataStart; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (rowIsEmpty(row)) continue;
    const expectedWidth = format === "legacy-docs"
      ? LEGACY_DOCS_WIDTH
      : format === "legacy"
        ? LEGACY_21_HEADERS.length
        : PANITIA_CANONICAL_HEADERS.length;
    if (row.length !== expectedWidth) {
      issues.push(issue(index + 1, null, `Jumlah kolom ${row.length}; seharusnya ${expectedWidth}`));
      continue;
    }
    const parsed = format === "legacy"
      ? parseCommon(row, index + 1, 0, 1, LEGACY_21_SLOT_COLUMNS, row[4] ?? "", areaIndex, issues)
      : format === "legacy-docs"
        ? parseCommon(row, index + 1, 0, 0, LEGACY_DOCS_SLOT_COLUMNS, "", areaIndex, issues)
        : parseCommon(row, index + 1, 1, 1, canonicalSlotColumns, row[10] ?? "", areaIndex, issues, 0);
    if (parsed) records.push(parsed);
  }
  return { format, records, issues };
}
