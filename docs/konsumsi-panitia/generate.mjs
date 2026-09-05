// Turns the committee sheet into src/lib/data/panitia-rows.ts.
//
// Run from this folder after replacing panitia.csv with a fresh export:
//
//   node generate.mjs
//
// The script prints the totals it computed so the emitted file can be checked
// against the spreadsheet before the change is committed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSV = join(HERE, "panitia.csv");
const OUT = join(HERE, "..", "..", "src", "lib", "data", "panitia-rows.ts");

/** Minimal RFC 4180 reader: the sheet quotes any role containing a comma. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// Three stacked header rows describe a flat 20-column layout. Attendance and the
// free-text activity beside it are read by index because the headers repeat the
// word SIANG four times and cannot address a column on their own.
const SLOTS = [
  { key: "h2_siang", col: 9, kegiatan: 10 },
  { key: "h1_siang", col: 11, kegiatan: 12 },
  { key: "h1_malam", col: 13, kegiatan: 14 },
  { key: "h_pagi", col: 15, kegiatan: null },
  { key: "h_siang", col: 16, kegiatan: null },
  { key: "h_malam", col: 17, kegiatan: null },
  { key: "hplus1", col: 18, kegiatan: 19 },
];

const clean = (value) => (value ?? "").trim();
const lower = (value) => clean(value).toLowerCase();

const rows = parseCsv(readFileSync(CSV, "utf8"))
  .slice(3)
  .filter((row) => clean(row[0]) !== "");

const people = rows.map((row) => {
  const kategori = clean(row[7]);
  const kegiatan = {};

  for (const slot of SLOTS) {
    if (slot.kegiatan !== null && clean(row[slot.kegiatan])) {
      kegiatan[slot.key] = clean(row[slot.kegiatan]);
    }
  }

  return {
    no: Number(clean(row[0])),
    nama: clean(row[1]),
    peran: clean(row[2]),
    asal: clean(row[3]),
    pic: clean(row[4]),
    kontak: clean(row[5]),
    qty: Number(clean(row[6])) || 0,
    kategori:
      lower(kategori) === "internal"
        ? "Internal"
        : lower(kategori) === "eksternal"
          ? "Eksternal"
          : "Kosong",
    makan: lower(row[8]) === "yes",
    // One character per slot in sheet order, so a row reads like its own line in
    // the spreadsheet: H hadir, T tidak hadir, - cell left empty.
    hadir: SLOTS.map((slot) => {
      const value = lower(row[slot.col]);
      return value === "hadir" ? "H" : value === "tidak hadir" ? "T" : "-";
    }).join(""),
    kegiatan,
  };
});

const ts = (value) => JSON.stringify(value);

const literals = people.map((person) => {
  const parts = [
    `no: ${person.no}`,
    `nama: ${ts(person.nama)}`,
    `peran: ${ts(person.peran)}`,
    `asal: ${ts(person.asal)}`,
    `pic: ${ts(person.pic)}`,
    `kontak: ${ts(person.kontak)}`,
    `qty: ${person.qty}`,
    `kategori: ${ts(person.kategori)}`,
    `makan: ${person.makan}`,
    `hadir: ${ts(person.hadir)}`,
  ];

  if (Object.keys(person.kegiatan).length) {
    const entries = Object.entries(person.kegiatan)
      .map(([key, value]) => `${key}: ${ts(value)}`)
      .join(", ");
    parts.push(`kegiatan: { ${entries} }`);
  }

  return `  { ${parts.join(", ")} },`;
});

writeFileSync(
  OUT,
  `// Dibuat otomatis oleh docs/konsumsi-panitia/generate.mjs — jangan diedit tangan.
// Sumber: docs/konsumsi-panitia/panitia.csv (${people.length} baris data).
//
// Ini snapshot sheet ancar-ancar, bukan data hidup. Setelah sheet berubah,
// ganti CSV-nya lalu jalankan ulang generator dari folder itu.
import type { PanitiaRow } from "@/lib/domain/panitia";

export const PANITIA_ROWS: PanitiaRow[] = [
${literals.join("\n")}
];
`,
);

// --- verification -----------------------------------------------------------
const porsi = (person, index) =>
  person.makan && person.hadir[index] === "H" ? person.qty : 0;
const totalPorsi = people.reduce(
  (sum, person) => sum + SLOTS.reduce((a, _slot, i) => a + porsi(person, i), 0),
  0,
);

console.log(`ditulis: ${OUT}`);
console.log(
  `baris: ${people.length} | orang: ${people.reduce((a, p) => a + p.qty, 0)}` +
    ` | dapat konsumsi: ${people.filter((p) => p.makan).reduce((a, p) => a + p.qty, 0)}` +
    ` | total porsi: ${totalPorsi}`,
);
console.table(
  SLOTS.map((slot, index) => ({
    slot: slot.key,
    porsi: people.reduce((a, p) => a + porsi(p, index), 0),
  })),
);
