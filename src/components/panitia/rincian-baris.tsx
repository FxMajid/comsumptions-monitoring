"use client";

import { useMemo, useState } from "react";
import {
  PANITIA_SLOTS,
  SLOT_LABELS,
  attendanceOf,
  totalPorsiOf,
  type PanitiaRow,
  type PanitiaSlotKey,
} from "@/lib/domain/panitia";
import { formatNumber } from "@/lib/format";
import { TableShell } from "@/components/ui/section";
import { Badge } from "@/components/ui/status-badge";

const CONTROL_CLASS =
  "rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25";

const ATTENDANCE_LABELS = {
  hadir: "hadir",
  tidak: "tidak hadir",
  kosong: "sel kosong di file",
} as const;

/** Filled by category when present; outlined when absent; ringed when unfilled. */
function attendanceDotClass(row: PanitiaRow, key: PanitiaSlotKey): string {
  const state = attendanceOf(row, key);

  if (state === "kosong") {
    return "bg-transparent ring-1 ring-chart-gap ring-inset";
  }

  if (state === "tidak") {
    return "bg-surface-sunken ring-1 ring-line ring-inset";
  }

  if (row.kategori === "Internal") return "bg-chart-internal";
  if (row.kategori === "Eksternal") return "bg-chart-external";

  return "hatch ring-1 ring-chart-gap ring-inset";
}

function AttendanceDots({ row }: Readonly<{ row: PanitiaRow }>) {
  const hadir = PANITIA_SLOTS.filter(
    (slot) => attendanceOf(row, slot.key) === "hadir",
  ).map((slot) => SLOT_LABELS[slot.key]);

  return (
    <>
      {/* The dots are a glance, not the record: a reader gets the slots in words. */}
      <span className="sr-only">
        {hadir.length ? `Hadir pada ${hadir.join(", ")}.` : "Tidak hadir di slot mana pun."}
      </span>
      <div aria-hidden="true" className="flex gap-1">
        {PANITIA_SLOTS.map((slot) => (
          <span
            key={slot.key}
            title={`${SLOT_LABELS[slot.key]}: ${ATTENDANCE_LABELS[attendanceOf(row, slot.key)]}${
              row.kegiatan?.[slot.key] ? ` — ${row.kegiatan[slot.key]}` : ""
            }`}
            className={`size-2.5 shrink-0 rounded-sm ${attendanceDotClass(row, slot.key)}`}
          />
        ))}
      </div>
    </>
  );
}

/** Spells out the dot order once, so the strip is readable without hovering. */
export function AttendanceKey() {
  return (
    <p className="text-xs text-ink-muted">
      Urutan kotak:{" "}
      <span className="font-medium text-ink">
        {PANITIA_SLOTS.map((slot) => `${slot.day} ${slot.meal}`).join(" · ")}
      </span>
    </p>
  );
}

/**
 * Roster rows, filtered in the browser. The expected committee roster is small
 * enough to ship, so looking for one name does not require a round trip.
 */
export function RincianBaris({ rows }: Readonly<{ rows: PanitiaRow[] }>) {
  const [query, setQuery] = useState("");
  const [kategori, setKategori] = useState("semua");
  const [slot, setSlot] = useState("semua");
  const [makan, setMakan] = useState("semua");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        needle &&
        ![row.nama, row.peran, row.pic, row.asal]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }

      if (kategori !== "semua" && row.kategori !== kategori) return false;
      if (makan === "yes" && !row.makan) return false;
      if (makan === "no" && row.makan) return false;

      if (
        slot !== "semua" &&
        attendanceOf(row, slot as PanitiaSlotKey) !== "hadir"
      ) {
        return false;
      }

      return true;
    });
  }, [rows, query, kategori, slot, makan]);

  const porsi = shown.reduce((sum, row) => sum + totalPorsiOf(row), 0);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cari nama, peran, atau PIC…"
          aria-label="Cari baris panitia"
          className={`${CONTROL_CLASS} min-w-0 flex-1 sm:max-w-72`}
        />
        <select
          value={kategori}
          onChange={(event) => setKategori(event.target.value)}
          aria-label="Filter kategori"
          className={CONTROL_CLASS}
        >
          <option value="semua">Semua kategori</option>
          <option value="Internal">Internal</option>
          <option value="Eksternal">Eksternal</option>
          <option value="Kosong">Kategori kosong</option>
        </select>
        <select
          value={slot}
          onChange={(event) => setSlot(event.target.value)}
          aria-label="Filter kehadiran slot"
          className={CONTROL_CLASS}
        >
          <option value="semua">Semua slot</option>
          {PANITIA_SLOTS.map((item) => (
            <option key={item.key} value={item.key}>
              Hadir di {SLOT_LABELS[item.key]}
            </option>
          ))}
        </select>
        <select
          value={makan}
          onChange={(event) => setMakan(event.target.value)}
          aria-label="Filter hak konsumsi"
          className={CONTROL_CLASS}
        >
          <option value="semua">Makan: semua</option>
          <option value="yes">Makan: YES</option>
          <option value="no">Makan: NO</option>
        </select>

        <p aria-live="polite" className="numeric ml-auto text-xs text-ink-muted">
          {formatNumber(shown.length)} dari {formatNumber(rows.length)} baris ·{" "}
          {formatNumber(porsi)} porsi
        </p>
      </div>

      <TableShell
        caption="Rincian setiap baris panitia beserta kehadiran per slot makan"
        minWidth="56rem"
        head={
          <tr>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              No
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Nama & peran
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Kategori
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Orang
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Kehadiran
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Porsi
            </th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              PIC pengambilan
            </th>
          </tr>
        }
      >
        {shown.length === 0 ? (
          <tr>
            <td colSpan={7} className="px-3 py-10 text-center text-ink-muted">
              Tidak ada baris yang cocok dengan filter ini.
            </td>
          </tr>
        ) : (
          shown.map((row) => (
            <tr key={row.id ?? row.no} className="border-t border-line align-top">
              <td className="numeric px-3 py-2.5 text-right text-ink-muted">
                {row.no}
              </td>
              <th scope="row" className="px-3 py-2.5 text-left font-medium">
                {row.nama}
                <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                  {[row.peran, row.asal].filter(Boolean).join(" · ") || "—"}
                </span>
              </th>
              <td className="px-3 py-2.5">
                {row.kategori === "Kosong" ? (
                  <Badge tone="warn">Belum diisi</Badge>
                ) : (
                  <Badge tone="neutral">{row.kategori}</Badge>
                )}
              </td>
              <td className="numeric px-3 py-2.5 text-right">
                {formatNumber(row.qty)}
                {row.qty > 1 ? (
                  <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                    rombongan
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2.5">
                <AttendanceDots row={row} />
              </td>
              <td className="numeric px-3 py-2.5 text-right font-semibold">
                {row.makan ? formatNumber(totalPorsiOf(row)) : "—"}
                {row.makan ? null : (
                  <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                    Makan: NO
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5">
                {row.pic ? (
                  <>
                    {row.pic}
                    {row.kontak ? (
                      <span className="numeric mt-0.5 block text-xs text-ink-muted">
                        {row.kontak}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-ink-muted">belum ditentukan</span>
                )}
              </td>
            </tr>
          ))
        )}
      </TableShell>
    </div>
  );
}
