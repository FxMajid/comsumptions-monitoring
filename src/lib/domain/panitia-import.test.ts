import { describe, expect, it } from "vitest";
import {
  diffPanitiaImport,
  panitiaIdentityKey,
  type PanitiaBeneficiarySnapshot,
} from "./panitia-import";
import type { PanitiaImportRecord } from "../import/schema";

function imported(overrides: Partial<PanitiaImportRecord> = {}): PanitiaImportRecord {
  return {
    rowNumber: 2,
    stableId: null,
    number: 1,
    name: "Budi Santoso",
    picHbd: "PIC Acara",
    employeeGroup: "Main Dealer",
    pickupPicName: null,
    pickupPicPhone: null,
    quantity: 1,
    beneficiaryType: "INDIVIDUAL",
    origin: "INTERNAL",
    eats: true,
    attendance: {
      h2Siang: "HADIR", h1Siang: "HADIR", h1Malam: "HADIR", hPagi: "HADIR",
      hSiang: "HADIR", hMalam: "HADIR", hPlus1: "TIDAK_HADIR",
    },
    activities: {},
    areaId: "area-1",
    areaLabel: "ZONE-1",
    ...overrides,
  };
}

function existing(overrides: Partial<PanitiaBeneficiarySnapshot> = {}): PanitiaBeneficiarySnapshot {
  return {
    id: "id-1",
    name: "Budi Santoso",
    picHbd: "PIC Acara",
    employeeGroup: "Main Dealer",
    quantity: 1,
    origin: "INTERNAL",
    areaId: "area-1",
    isActive: true,
    ...overrides,
  };
}

describe("panitiaIdentityKey", () => {
  it("normalizes NAMA + PIC HBD + EMPLOYEE deterministically", () => {
    expect(panitiaIdentityKey(imported({ name: "  budi   santoso " }))).toBe(
      panitiaIdentityKey(imported({ name: "BUDI SANTOSO" })),
    );
  });
});

describe("diffPanitiaImport", () => {
  it("uses stable ID before identity and detects changes", () => {
    const result = diffPanitiaImport([
      imported({ stableId: "ID-1", name: "Budi Baru", quantity: 10, beneficiaryType: "GROUP" }),
    ], [existing()]);

    expect(result.conflicts).toEqual([]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]?.existing.id).toBe("id-1");
    expect(result.updates[0]?.changes).toEqual(expect.arrayContaining([
      { field: "name", before: "Budi Santoso", after: "Budi Baru" },
      { field: "quantity", before: 1, after: 10 },
    ]));
  });

  it("falls back to identity only without a stable ID", () => {
    const result = diffPanitiaImport([imported()], [existing()]);
    expect(result.unchanged).toHaveLength(1);
    expect(result.creates).toEqual([]);
  });

  it("rejects unknown stable IDs instead of silently identity-matching", () => {
    const result = diffPanitiaImport([imported({ stableId: "missing" })], [existing()]);
    expect(result.conflicts).toEqual([expect.objectContaining({ code: "UNKNOWN_STABLE_ID" })]);
    expect(result.unchanged).toEqual([]);
  });

  it("detects duplicate IDs and duplicate import identities", () => {
    const result = diffPanitiaImport([
      imported({ rowNumber: 2, stableId: "id-1" }),
      imported({ rowNumber: 3, stableId: "ID-1" }),
    ], []);
    expect(result.conflicts.map((entry) => entry.code)).toEqual([
      "DUPLICATE_IDENTITY", "DUPLICATE_STABLE_ID",
    ]);
    expect(result.creates).toEqual([]);
  });

  it("detects ambiguous existing identities and stable-ID identity collisions", () => {
    const ambiguous = diffPanitiaImport([imported()], [existing(), existing({ id: "id-2" })]);
    expect(ambiguous.conflicts[0]?.code).toBe("AMBIGUOUS_EXISTING_IDENTITY");

    const collision = diffPanitiaImport(
      [imported({ stableId: "id-1", name: "Orang Lain" })],
      [existing(), existing({ id: "id-2", name: "Orang Lain" })],
    );
    expect(collision.conflicts[0]?.code).toBe("IDENTITY_POINTS_TO_OTHER_RECORD");
  });

  it("keeps output order stable by source row", () => {
    const result = diffPanitiaImport([
      imported({ rowNumber: 9, name: "Zeta" }),
      imported({ rowNumber: 4, name: "Alpha" }),
    ], []);
    expect(result.creates.map((entry) => entry.record.rowNumber)).toEqual([4, 9]);
  });
});
