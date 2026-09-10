import { normalizeKey, normalizeText } from "../import/normalize";
import type { PanitiaImportRecord, PanitiaImportOrigin } from "../import/schema";

export type PanitiaBeneficiarySnapshot = {
  id: string;
  name: string;
  picHbd: string | null;
  employeeGroup: string | null;
  quantity: number;
  origin: PanitiaImportOrigin;
  areaId: string | null;
  isActive?: boolean;
};

export type PanitiaImportConflictCode =
  | "DUPLICATE_STABLE_ID"
  | "DUPLICATE_IDENTITY"
  | "AMBIGUOUS_EXISTING_IDENTITY"
  | "IDENTITY_POINTS_TO_OTHER_RECORD"
  | "UNKNOWN_STABLE_ID";

export type PanitiaImportConflict = {
  code: PanitiaImportConflictCode;
  rows: number[];
  stableId: string | null;
  identityKey: string;
  existingIds: string[];
  message: string;
};

export type PanitiaImportChange = {
  field: "name" | "picHbd" | "employeeGroup" | "quantity" | "origin" | "areaId" | "isActive";
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};

export type PanitiaImportCreate = { kind: "create"; record: PanitiaImportRecord };
export type PanitiaImportUpdate = {
  kind: "update";
  record: PanitiaImportRecord;
  existing: PanitiaBeneficiarySnapshot;
  changes: PanitiaImportChange[];
};
export type PanitiaImportUnchanged = {
  kind: "unchanged";
  record: PanitiaImportRecord;
  existing: PanitiaBeneficiarySnapshot;
};

export type PanitiaImportDiff = {
  creates: PanitiaImportCreate[];
  updates: PanitiaImportUpdate[];
  unchanged: PanitiaImportUnchanged[];
  conflicts: PanitiaImportConflict[];
};

const IDENTITY_SEPARATOR = "";

/** Human identity used only when a stable ID is absent. */
export function panitiaIdentityKey(
  value: Pick<PanitiaImportRecord, "name" | "picHbd" | "employeeGroup">,
): string {
  return [value.name, value.picHbd, value.employeeGroup]
    .map((part) => normalizeKey(part ?? ""))
    .join(IDENTITY_SEPARATOR);
}

function existingIdentityKey(value: PanitiaBeneficiarySnapshot): string {
  return [value.name, value.picHbd ?? "", value.employeeGroup ?? ""]
    .map(normalizeKey)
    .join(IDENTITY_SEPARATOR);
}

function stableKey(value: string): string {
  return normalizeKey(value);
}

function addToIndex<T>(index: Map<string, T[]>, key: string, value: T): void {
  const current = index.get(key);
  if (current) current.push(value);
  else index.set(key, [value]);
}

function compareRecord(
  record: PanitiaImportRecord,
  existing: PanitiaBeneficiarySnapshot,
): PanitiaImportChange[] {
  const changes: PanitiaImportChange[] = [];
  const candidates: readonly [PanitiaImportChange["field"], PanitiaImportChange["before"], PanitiaImportChange["after"]][] = [
    ["name", existing.name, record.name],
    ["picHbd", existing.picHbd, record.picHbd],
    ["employeeGroup", existing.employeeGroup, record.employeeGroup],
    ["quantity", existing.quantity, record.quantity],
    ["origin", existing.origin, record.origin],
    ["areaId", existing.areaId, record.areaId],
    ["isActive", existing.isActive ?? true, true],
  ];
  for (const [field, before, after] of candidates) {
    const equal = typeof before === "string" && typeof after === "string"
      ? normalizeText(before) === normalizeText(after)
      : before === after;
    if (!equal) changes.push({ field, before, after });
  }
  return changes;
}

function conflict(
  code: PanitiaImportConflictCode,
  records: readonly PanitiaImportRecord[],
  existingIds: readonly string[],
  message: string,
): PanitiaImportConflict {
  const first = records[0];
  return {
    code,
    rows: records.map((record) => record.rowNumber).sort((left, right) => left - right),
    stableId: first?.stableId ?? null,
    identityKey: first ? panitiaIdentityKey(first) : "",
    existingIds: [...existingIds].sort(),
    message,
  };
}

/**
 * Produces an apply-ready deterministic diff. A supplied stable ID must resolve;
 * identity fallback is deliberately used only for rows without one.
 */
export function diffPanitiaImport(
  imported: readonly PanitiaImportRecord[],
  existing: readonly PanitiaBeneficiarySnapshot[],
): PanitiaImportDiff {
  const byStableId = new Map<string, PanitiaImportRecord[]>();
  const byIdentity = new Map<string, PanitiaImportRecord[]>();
  const existingById = new Map(existing.map((record) => [stableKey(record.id), record]));
  const existingByIdentity = new Map<string, PanitiaBeneficiarySnapshot[]>();
  const rejectedRows = new Set<number>();
  const conflicts: PanitiaImportConflict[] = [];

  for (const record of imported) {
    if (record.stableId) addToIndex(byStableId, stableKey(record.stableId), record);
    addToIndex(byIdentity, panitiaIdentityKey(record), record);
  }
  for (const record of existing) addToIndex(existingByIdentity, existingIdentityKey(record), record);

  for (const records of byStableId.values()) {
    if (records.length > 1) {
      records.forEach((record) => rejectedRows.add(record.rowNumber));
      conflicts.push(conflict("DUPLICATE_STABLE_ID", records, [], "ID PENERIMA muncul lebih dari sekali"));
    }
  }
  for (const records of byIdentity.values()) {
    if (records.length > 1) {
      records.forEach((record) => rejectedRows.add(record.rowNumber));
      conflicts.push(conflict("DUPLICATE_IDENTITY", records, [], "Identitas NAMA + PIC HBD + EMPLOYEE muncul lebih dari sekali"));
    }
  }

  const creates: PanitiaImportCreate[] = [];
  const updates: PanitiaImportUpdate[] = [];
  const unchanged: PanitiaImportUnchanged[] = [];

  for (const record of [...imported].sort((left, right) => left.rowNumber - right.rowNumber)) {
    if (rejectedRows.has(record.rowNumber)) continue;
    const identity = panitiaIdentityKey(record);
    const identityMatches = existingByIdentity.get(identity) ?? [];
    let matched: PanitiaBeneficiarySnapshot | null = null;

    if (record.stableId) {
      matched = existingById.get(stableKey(record.stableId)) ?? null;
      if (!matched) {
        conflicts.push(conflict("UNKNOWN_STABLE_ID", [record], [], `ID PENERIMA "${record.stableId}" tidak ditemukan`));
        continue;
      }
      const otherIdentityMatches = identityMatches.filter((candidate) => candidate.id !== matched?.id);
      if (otherIdentityMatches.length > 0) {
        conflicts.push(conflict("IDENTITY_POINTS_TO_OTHER_RECORD", [record], otherIdentityMatches.map((item) => item.id), "Identitas baris sudah dimiliki penerima lain"));
        continue;
      }
    } else if (identityMatches.length > 1) {
      conflicts.push(conflict("AMBIGUOUS_EXISTING_IDENTITY", [record], identityMatches.map((item) => item.id), "Identitas cocok dengan lebih dari satu penerima tersimpan"));
      continue;
    } else {
      matched = identityMatches[0] ?? null;
    }

    if (!matched) {
      creates.push({ kind: "create", record });
      continue;
    }
    const changes = compareRecord(record, matched);
    if (changes.length === 0) unchanged.push({ kind: "unchanged", record, existing: matched });
    else updates.push({ kind: "update", record, existing: matched, changes });
  }

  conflicts.sort((left, right) => (left.rows[0] ?? 0) - (right.rows[0] ?? 0) || left.code.localeCompare(right.code));
  return { creates, updates, unchanged, conflicts };
}
