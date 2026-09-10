/**
 * The committee consumption estimate ("ancar-ancar"). Every figure on /panitia
 * is derived here from the live roster rows, so the page only arranges the result.
 *
 * A row is one person or one whole block — "Panitia Community" carries 50 people
 * on a single line — which is why quantities are summed rather than counted.
 */
import { formatNumber } from "@/lib/format";

/** Sheet order, which is also chronological. The chart never re-sorts these. */
export const PANITIA_SLOTS = [
  { key: "h2_siang", day: "H-2", meal: "Siang", scheme: "voucher" },
  { key: "h1_siang", day: "H-1", meal: "Siang", scheme: "katering" },
  { key: "h1_malam", day: "H-1", meal: "Malam", scheme: "katering" },
  { key: "h_pagi", day: "H", meal: "Pagi", scheme: "katering" },
  { key: "h_siang", day: "H", meal: "Siang", scheme: "katering" },
  { key: "h_malam", day: "H", meal: "Malam", scheme: "katering" },
  { key: "hplus1", day: "H+1", meal: "Siang", scheme: "voucher" },
] as const;

export type PanitiaSlot = (typeof PANITIA_SLOTS)[number];
export type PanitiaSlotKey = PanitiaSlot["key"];

/** Blank in the sheet is its own value, not a default: it means nobody chose. */
export type PanitiaKategori = "Internal" | "Eksternal" | "Kosong";

export type PanitiaAttendance = "hadir" | "tidak" | "kosong";

export type PanitiaRow = {
  /** Stable database identifier; absent only on the legacy in-repo snapshot. */
  id?: string;
  no: number;
  nama: string;
  peran: string;
  /** The sheet's EMPLOYEE column: which dealer or outside body the row belongs to. */
  asal: string;
  /** Who physically collects the food. Empty on most rows, which is the gap. */
  pic: string;
  kontak: string;
  qty: number;
  kategori: PanitiaKategori;
  /** The sheet's Makan (YES/NO) column. A NO row draws no portion at all. */
  makan: boolean;
  /** One character per slot in `PANITIA_SLOTS` order: H, T, or "-" for empty. */
  hadir: string;
  kegiatan?: Partial<Record<PanitiaSlotKey, string>>;
};

/** Fixed by the sheet itself for H-2 and H+1, so it is not an assumption. */
export const VOUCHER_RATE = 25_000;

/** The sheet never states a catering price; this is only where the input starts. */
export const DEFAULT_CATERING_RATE = 25_000;

export const SLOT_LABELS: Record<PanitiaSlotKey, string> = {
  h2_siang: "H-2 · Siang",
  h1_siang: "H-1 · Siang",
  h1_malam: "H-1 · Malam",
  h_pagi: "H · Pagi",
  h_siang: "H · Siang",
  h_malam: "H · Malam",
  hplus1: "H+1 · Siang",
};

const SLOT_INDEX: Record<PanitiaSlotKey, number> = Object.fromEntries(
  PANITIA_SLOTS.map((slot, index) => [slot.key, index]),
) as Record<PanitiaSlotKey, number>;

export function attendanceOf(
  row: PanitiaRow,
  key: PanitiaSlotKey,
): PanitiaAttendance {
  const mark = row.hadir[SLOT_INDEX[key]];

  return mark === "H" ? "hadir" : mark === "T" ? "tidak" : "kosong";
}

/**
 * A slot only becomes portions when the row eats at all and is marked present.
 * An empty attendance cell counts as absent, which is the conservative reading:
 * the order comes out low rather than over.
 */
export function porsiOf(row: PanitiaRow, key: PanitiaSlotKey): number {
  return row.makan && attendanceOf(row, key) === "hadir" ? row.qty : 0;
}

export function totalPorsiOf(row: PanitiaRow): number {
  return PANITIA_SLOTS.reduce((sum, slot) => sum + porsiOf(row, slot.key), 0);
}

const sumQty = (rows: PanitiaRow[]) => rows.reduce((sum, row) => sum + row.qty, 0);
const sumPorsi = (rows: PanitiaRow[]) =>
  rows.reduce((sum, row) => sum + totalPorsiOf(row), 0);

export type PanitiaSlotBreakdown = {
  slot: PanitiaSlot;
  label: string;
  internal: number;
  eksternal: number;
  /** Portions from rows whose Kategori cell was never filled in. */
  kosong: number;
  total: number;
  /** How many sheet rows attend this slot, block rows included. */
  rows: number;
};

export function slotBreakdowns(rows: PanitiaRow[]): PanitiaSlotBreakdown[] {
  return PANITIA_SLOTS.map((slot) => {
    const breakdown = {
      slot,
      label: SLOT_LABELS[slot.key],
      internal: 0,
      eksternal: 0,
      kosong: 0,
      total: 0,
      rows: 0,
    };

    for (const row of rows) {
      const porsi = porsiOf(row, slot.key);

      if (porsi === 0) {
        continue;
      }

      breakdown.rows += 1;
      breakdown.total += porsi;

      if (row.kategori === "Internal") breakdown.internal += porsi;
      else if (row.kategori === "Eksternal") breakdown.eksternal += porsi;
      else breakdown.kosong += porsi;
    }

    return breakdown;
  });
}

export type PanitiaDay = { day: string; porsi: number; slots: number };

/**
 * The same portions rolled up to the day. Grouping is by adjacency rather than by
 * key, because `PANITIA_SLOTS` is already chronological and its days are
 * contiguous — so the result keeps the sheet's order without a sort.
 */
export function porsiByDay(rows: PanitiaRow[]): PanitiaDay[] {
  const days: PanitiaDay[] = [];

  for (const breakdown of slotBreakdowns(rows)) {
    const current = days.at(-1);

    if (current && current.day === breakdown.slot.day) {
      current.porsi += breakdown.total;
      current.slots += 1;
      continue;
    }

    days.push({ day: breakdown.slot.day, porsi: breakdown.total, slots: 1 });
  }

  return days;
}

export type PanitiaSummary = {
  /** Sheet rows, which is smaller than the number of people. */
  rows: number;
  orang: number;
  orangMakan: number;
  orangTanpaMakan: number;
  totalPorsi: number;
  /** Portions on the two slots the sheet already priced at VOUCHER_RATE. */
  voucherPorsi: number;
  kateringPorsi: number;
  internal: number;
  eksternal: number;
  kategoriKosong: number;
  /** The busiest single slot: the capacity that has to exist at one moment. */
  puncak: PanitiaSlotBreakdown;
  /** Rows standing for more than one person, and their share of the portions. */
  blokRows: number;
  blokOrang: number;
  blokPorsi: number;
};

export function summarizePanitia(rows: PanitiaRow[]): PanitiaSummary {
  const breakdowns = slotBreakdowns(rows);
  const blok = rows.filter((row) => row.qty > 1);
  const makan = rows.filter((row) => row.makan);

  const voucherPorsi = breakdowns
    .filter((breakdown) => breakdown.slot.scheme === "voucher")
    .reduce((sum, breakdown) => sum + breakdown.total, 0);
  const totalPorsi = breakdowns.reduce((sum, breakdown) => sum + breakdown.total, 0);

  // reduce() with no seed throws on an empty list, and an empty sheet is a state
  // the page has to survive, so the first slot seeds the comparison.
  const puncak = breakdowns.reduce(
    (best, breakdown) => (breakdown.total > best.total ? breakdown : best),
    breakdowns[0],
  );

  return {
    rows: rows.length,
    orang: sumQty(rows),
    orangMakan: sumQty(makan),
    orangTanpaMakan: sumQty(rows) - sumQty(makan),
    totalPorsi,
    voucherPorsi,
    kateringPorsi: totalPorsi - voucherPorsi,
    internal: breakdowns.reduce((sum, breakdown) => sum + breakdown.internal, 0),
    eksternal: breakdowns.reduce((sum, breakdown) => sum + breakdown.eksternal, 0),
    kategoriKosong: breakdowns.reduce((sum, breakdown) => sum + breakdown.kosong, 0),
    puncak,
    blokRows: blok.length,
    blokOrang: sumQty(blok),
    blokPorsi: sumPorsi(blok),
  };
}

/**
 * Only the catering slots move with the rate: the sheet already fixed H-2 and
 * H+1 at VOUCHER_RATE, so quoting them at anything else would misread it.
 */
export function estimateCost(
  summary: PanitiaSummary,
  cateringRate: number,
): number {
  return summary.kateringPorsi * cateringRate + summary.voucherPorsi * VOUCHER_RATE;
}

export function slotCost(
  breakdown: PanitiaSlotBreakdown,
  cateringRate: number,
): number {
  return (
    breakdown.total *
    (breakdown.slot.scheme === "voucher" ? VOUCHER_RATE : cateringRate)
  );
}

export type PanitiaPickup = {
  /** The PIC's name, or `UNASSIGNED` for the rows that never got one. */
  name: string;
  kontak: string;
  assigned: boolean;
  rows: number;
  orang: number;
  /** Portions to collect at each slot, in `PANITIA_SLOTS` order. */
  perSlot: number[];
  /** How many slots this PIC actually has to show up for. */
  slots: number;
  porsi: number;
};

const UNASSIGNED = "(belum ditentukan)";

/**
 * Every collector against every slot.
 *
 * This is the operational shape of the pickup: a PIC does not collect "their
 * portions" once, they collect once per meal slot, and a total alone hides
 * whether that means one trip or seven. The rows that never got a PIC are kept
 * as a single entry rather than dropped, so the gap is counted in the same
 * table as the assignments instead of only in a warning.
 */
export function pickupMatrix(rows: PanitiaRow[]): PanitiaPickup[] {
  const pics = new Map<string, PanitiaPickup>();

  for (const row of rows) {
    const name = row.pic || UNASSIGNED;
    const pickup: PanitiaPickup = pics.get(name) ?? {
      name,
      kontak: "",
      assigned: name !== UNASSIGNED,
      rows: 0,
      orang: 0,
      perSlot: PANITIA_SLOTS.map(() => 0),
      slots: 0,
      porsi: 0,
    };

    pickup.rows += 1;
    pickup.orang += row.qty;
    // The sheet repeats one PIC across rows and only fills the contact on some
    // of them, so the first number found stands for the whole group. The
    // unassigned bucket is excluded: a number on a row with no PIC belongs to
    // nobody in particular, and showing it would imply the gap has a contact.
    if (pickup.assigned && !pickup.kontak && row.kontak) pickup.kontak = row.kontak;

    PANITIA_SLOTS.forEach((slot, index) => {
      pickup.perSlot[index] += porsiOf(row, slot.key);
    });

    pics.set(name, pickup);
  }

  for (const pickup of pics.values()) {
    pickup.porsi = pickup.perSlot.reduce((sum, porsi) => sum + porsi, 0);
    pickup.slots = pickup.perSlot.filter((porsi) => porsi > 0).length;
  }

  // The unassigned bucket leads. It is the largest entry in this sheet, and the
  // one thing on the page that blocks issuing a single claim.
  return [...pics.values()].sort(
    (a, b) => Number(a.assigned) - Number(b.assigned) || b.porsi - a.porsi,
  );
}

export type PanitiaSlotPickup = {
  slot: PanitiaSlot;
  label: string;
  total: number;
  /** Portions that already have a named collector. */
  assigned: number;
  unassigned: number;
  /** How many collectors have to be at the counter for this slot. */
  pics: number;
};

/** The same matrix read the other way: how ready each slot is on its own. */
export function pickupBySlot(rows: PanitiaRow[]): PanitiaSlotPickup[] {
  const matrix = pickupMatrix(rows);

  return PANITIA_SLOTS.map((slot, index) => {
    let assigned = 0;
    let unassigned = 0;
    let pics = 0;

    for (const pickup of matrix) {
      const porsi = pickup.perSlot[index];

      if (porsi === 0) {
        continue;
      }

      if (pickup.assigned) {
        assigned += porsi;
        pics += 1;
      } else {
        unassigned += porsi;
      }
    }

    return {
      slot,
      label: SLOT_LABELS[slot.key],
      total: assigned + unassigned,
      assigned,
      unassigned,
      pics,
    };
  });
}

/** The slot where the missing PICs hurt most, for the headline of the warning. */
export function worstPickupSlot(rows: PanitiaRow[]): PanitiaSlotPickup {
  const slots = pickupBySlot(rows);

  return slots.reduce(
    (worst, slot) => (slot.unassigned > worst.unassigned ? slot : worst),
    slots[0],
  );
}

/**
 * The rows contributing the most portions. Ranking rows rather than people is
 * the point: the top of this list is almost entirely block rows, which is what
 * makes the estimate sensitive to a headcount nobody has confirmed yet.
 */
export function topContributors(rows: PanitiaRow[], limit: number): PanitiaRow[] {
  return rows
    .filter((row) => totalPorsiOf(row) > 0)
    .sort((a, b) => totalPorsiOf(b) - totalPorsiOf(a) || a.no - b.no)
    .slice(0, limit);
}

export type PanitiaIssue = {
  id: string;
  tone: "warn" | "info";
  title: string;
  detail: string;
  /** The figure that says how big the gap is, already formatted for display. */
  count: string;
};

/** A phone number that cannot be dialled as written, so no QR can be sent. */
function isUnusableKontak(kontak: string): boolean {
  return kontak !== "" && (/[a-zA-Z]/.test(kontak) || kontak.replace(/\D/g, "").length < 9);
}

const listNos = (rows: PanitiaRow[]) => rows.map((row) => row.no).join(", ");

/**
 * What has to be fixed in the sheet before these numbers can be ordered against,
 * ranked by how much it blocks. Every entry is counted from the rows rather than
 * written down, so it disappears on its own once the sheet is corrected.
 */
export function dataIssues(rows: PanitiaRow[]): PanitiaIssue[] {
  const unassigned = pickupMatrix(rows).find((pickup) => !pickup.assigned);
  const noKategori = rows.filter((row) => row.kategori === "Kosong");
  const badKontak = rows.filter((row) => isUnusableKontak(row.kontak));
  const mismatch = rows.filter(
    (row) => row.kategori === "Internal" && row.asal.toLowerCase() === "eksternal",
  );
  const blankCells = rows.filter(
    (row) =>
      row.makan &&
      PANITIA_SLOTS.some((slot) => attendanceOf(row, slot.key) === "kosong"),
  );
  const blankCellCount = blankCells.reduce(
    (sum, row) =>
      sum +
      PANITIA_SLOTS.filter((slot) => attendanceOf(row, slot.key) === "kosong").length,
    0,
  );
  const tanpaMakan = rows.filter((row) => !row.makan);
  const blok = rows.filter((row) => row.qty > 1);

  const issues: PanitiaIssue[] = [];

  if (unassigned) {
    issues.push({
      id: "pic",
      tone: "warn",
      title: "Porsi tanpa PIC pengambilan",
      detail: `${formatNumber(unassigned.rows)} dari ${formatNumber(rows.length)} baris — setara ${formatNumber(unassigned.orang)} orang — tidak punya nama penanggung jawab pengambilan. Termasuk rombongan besar seperti Panitia Community, Security, dan Volunteer. Tanpa PIC, QR klaim tidak punya tujuan.`,
      count: `${formatNumber(unassigned.porsi)} porsi`,
    });
  }

  if (badKontak.length) {
    issues.push({
      id: "kontak",
      tone: "warn",
      title: "Kontak WA PIC tidak bisa dihubungi apa adanya",
      detail: `Baris ${listNos(badKontak)}: sebagian berisi nama, sebagian tersimpan sebagai notasi ilmiah Excel (8.96E+11), satu hanya tiga digit. Nomor harus utuh sebelum tautan klaim dikirim.`,
      count: `${formatNumber(badKontak.length)} baris`,
    });
  }

  if (noKategori.length) {
    issues.push({
      id: "kategori",
      tone: "warn",
      title: "Kategori dibiarkan kosong",
      detail: `Baris ${listNos(noKategori)} tidak diisi Internal maupun Eksternal, sehingga ${formatNumber(sumPorsi(noKategori))} porsinya tidak masuk kelompok mana pun pada grafik.`,
      count: `${formatNumber(noKategori.length)} baris`,
    });
  }

  if (mismatch.length) {
    issues.push({
      id: "mismatch",
      tone: "warn",
      title: "Kategori bertabrakan dengan kolom employee",
      detail: `Baris ${listNos(mismatch)} (${mismatch.map((row) => row.nama).join(", ")}) ditandai Internal tetapi kolom employee-nya Eksternal. Keduanya menyumbang ${formatNumber(sumPorsi(mismatch))} porsi — cukup besar untuk menggeser pembagian Internal terhadap Eksternal.`,
      count: `${formatNumber(sumQty(mismatch))} orang`,
    });
  }

  if (blankCellCount) {
    issues.push({
      id: "sel-kosong",
      tone: "warn",
      title: "Sel kehadiran dibiarkan kosong",
      detail: `${formatNumber(blankCellCount)} sel pada baris ${listNos(blankCells)} tidak diisi Hadir maupun Tidak Hadir. Di sini dihitung sebagai tidak hadir, jadi angka porsi bisa naik kalau ternyata mereka ikut makan.`,
      count: `${formatNumber(blankCellCount)} sel`,
    });
  }

  if (tanpaMakan.length) {
    issues.push({
      id: "tanpa-makan",
      tone: "info",
      title: "Baris tanpa hak konsumsi",
      detail: `Baris ${listNos(tanpaMakan)} bertanda Makan = NO dan kolom kehadirannya kosong, jadi nol porsi. Pastikan ini memang keputusan, bukan baris yang belum diisi.`,
      count: `${formatNumber(sumQty(tanpaMakan))} orang`,
    });
  }

  if (blok.length) {
    issues.push({
      id: "rombongan",
      tone: "info",
      title: "Rombongan tercatat sebagai satu baris",
      detail: `${formatNumber(blok.length)} baris mewakili ${formatNumber(sumQty(blok))} orang tanpa nama per individu. Hak konsumsinya hanya bisa diterbitkan ke PIC rombongan, dan jumlah riilnya baru terlihat saat klaim.`,
      count: `${formatNumber(sumPorsi(blok))} porsi`,
    });
  }

  return issues;
}
