import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serializeCsv } from "./csv";
import {
  PANITIA_CANONICAL_HEADERS,
  importPanitiaCsv,
  type PanitiaAreaSnapshot,
} from "./panitia-csv";

const LEGACY_HEADER = [
  "", "NAMA", "PIC HBD", "EMPLOYEE", "Area kerja",
  "NAMA PIC PENANGGUNG JAWAB PENGAMBILAN KONSUMSI", "KONTAK WA PIC",
  "Qty", "Kategori", "Makan (YES/NO)", "SIANG H-2", "KEGIATAN",
  "SIANG H-1", "KEGIATAN", "MALAM-1", "KEGIATAN", "PAGI H",
  "SIANG H", "MALAM H", "H+1", "KEGIATAN",
];

const LEGACY_AREAS: PanitiaAreaSnapshot[] = [
  "mobile", "SERVICE MOTOR", "REGISTRASI", "KONSUMSI", "PERLENGKAPAN",
  "backstage", "Second Stage", "UMKM", "MODIFIKASI", "BOOTH GAMES",
  "FOTO BOOTH", "RIDING TEST", "MOTORAN", "WP", "OB",
].map((name, index) => ({ id: `legacy-area-${index + 1}`, code: `L${index + 1}`, name }));

const AREAS: PanitiaAreaSnapshot[] = [
  { id: "area-1", code: "ZONE-1", name: "Zone Satu" },
  { id: "area-2", code: "ZONE-2", name: "Zone Dua" },
];

function canonicalRow(overrides: Readonly<Record<number, string>> = {}): string[] {
  const row = [
    "beneficiary-1", "1", "  José  Panitia ", "PIC  Acara", "Main Dealer",
    "Budi", "+62 812-3456-789", "1", "Internal", "YES", "zone-1",
    "Hadir", "Persiapan", "Tidak Hadir", "", "Hadir", "Briefing",
    "Hadir", "Hadir", "Hadir", "Tidak Hadir", "Pulang",
  ];
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value;
  return row;
}

function canonicalCsv(row: readonly string[]): string {
  return serializeCsv([PANITIA_CANONICAL_HEADERS, row], { protectFormulas: false });
}

describe("importPanitiaCsv", () => {
  it("imports representative single-header legacy rows and preserves group quantities", () => {
    const individual = [
      "1", "KRIS KURNIANTO", "STEERING COMMITTEE", "MAIN DEALER", "mobile",
      "KRIS", "08123456789", "1", "Internal", "YES", "Hadir", "Persiapan",
      "Hadir", "", "Hadir", "Briefing", "Hadir", "Hadir", "Hadir", "Tidak Hadir", "Pulang",
    ];
    const group = [
      "2", "Security", "", "", "OB", "Diana", "08123450000", "50",
      "Eksternal", "YES", "Hadir", "4 orang menginap", "Hadir", "",
      "Hadir", "", "Hadir", "Hadir", "Hadir", "Tidak Hadir", "",
    ];
    const result = importPanitiaCsv(
      serializeCsv([LEGACY_HEADER, individual, group], { protectFormulas: false }),
      LEGACY_AREAS,
    );

    expect(result.format).toBe("legacy");
    expect(result.issues).toEqual([]);
    expect(result.records[0]).toMatchObject({
      areaId: "legacy-area-1",
      areaLabel: "mobile",
      name: "KRIS KURNIANTO",
    });
    expect(result.records[1]).toMatchObject({ beneficiaryType: "GROUP", quantity: 50 });
  });

  it("retains compatibility with the old three-header docs fixture", () => {
    const csv = readFileSync("docs/konsumsi-panitia/panitia.csv", "utf8");
    const result = importPanitiaCsv(csv);

    expect(result.format).toBe("legacy-docs");
    expect(result.records.length).toBeGreaterThan(100);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ column: "pickupPicPhone", message: expect.stringContaining("notasi ilmiah") }),
    ]));
  });

  it("parses canonical headers, normalizes Unicode/whitespace, and matches area snapshots", () => {
    const decomposedName = "José​   Panitia";
    const result = importPanitiaCsv(canonicalCsv(canonicalRow({ 2: decomposedName, 10: " zone satu " })), AREAS);

    expect(result.issues).toEqual([]);
    expect(result.records[0]).toMatchObject({
      stableId: "beneficiary-1",
      name: "José Panitia",
      picHbd: "PIC Acara",
      quantity: 1,
      beneficiaryType: "INDIVIDUAL",
      origin: "INTERNAL",
      eats: true,
      areaId: "area-1",
      areaLabel: "zone satu",
      attendance: { h2Siang: "HADIR", h1Siang: "TIDAK_HADIR", hPlus1: "TIDAK_HADIR" },
    });
  });

  it("round-trips formula-protected canonical values", () => {
    const exported = serializeCsv([
      PANITIA_CANONICAL_HEADERS,
      canonicalRow({ 2: "=Koordinator", 5: "@PIC", 6: "+628123456789" }),
    ]);
    const result = importPanitiaCsv(exported, AREAS);

    expect(result.issues).toEqual([]);
    expect(result.records[0]).toMatchObject({
      name: "=Koordinator",
      pickupPicName: "@PIC",
      pickupPicPhone: "+628123456789",
    });
  });

  it("rejects scientific-notation phone text and invalid constrained values", () => {
    const result = importPanitiaCsv(canonicalCsv(canonicalRow({
      6: "8.96E+11", 7: "0", 8: "vendor", 9: "maybe", 11: "perhaps",
    })), AREAS);

    expect(result.records).toEqual([]);
    expect(result.issues.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      "Qty harus bilangan bulat positif",
      "Kategori harus Internal atau Eksternal",
      "Makan harus YES atau NO",
      "Kehadiran harus Hadir, Tidak Hadir, atau kosong",
    ]));
  });

  it("preserves unknown area labels for server-side creation and still blocks ambiguous areas", () => {
    const ambiguous = [...AREAS, { id: "area-3", code: "ALT", name: "Zone Satu" }];
    const unknown = importPanitiaCsv(canonicalCsv(canonicalRow({ 10: "  Tidak   Ada  " })), AREAS);
    const duplicate = importPanitiaCsv(canonicalCsv(canonicalRow({ 10: "Zone Satu" })), ambiguous);

    expect(unknown.issues).toEqual([]);
    expect(unknown.records[0]).toMatchObject({
      areaId: null,
      areaLabel: "Tidak Ada",
    });
    expect(duplicate.records[0]).toMatchObject({
      areaId: null,
      areaLabel: "Zone Satu",
    });
    expect(duplicate.issues).toEqual([
      expect.objectContaining({ column: "AREA", message: expect.stringContaining("ambigu") }),
    ]);
  });

  it("requires the exact canonical or legacy header width", () => {
    expect(importPanitiaCsv("NAMA,QTY\r\nA,1").format).toBeNull();
    expect(importPanitiaCsv(serializeCsv([[...PANITIA_CANONICAL_HEADERS, "EXTRA"], canonicalRow()])).format).toBeNull();
  });
});
