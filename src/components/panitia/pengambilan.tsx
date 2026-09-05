import { Fragment } from "react";
import {
  PANITIA_SLOTS,
  type PanitiaPickup,
  type PanitiaSlotPickup,
} from "@/lib/domain/panitia";
import { formatNumber, formatShare } from "@/lib/format";
import { TableShell } from "@/components/ui/section";

/**
 * Pickup is not one event per PIC, it is one event per meal slot. Both views
 * below read the same matrix from opposite sides: the schedule asks how ready a
 * slot is, the matrix asks how many trips a person has to make.
 */

/** Groups consecutive slots by event day, so H-1 keeps its two meals together. */
function byDay<T extends { slot: { day: string } }>(items: T[]) {
  const days: Array<{ day: string; items: T[] }> = [];

  for (const item of items) {
    const last = days.at(-1);

    if (last?.day === item.slot.day) last.items.push(item);
    else days.push({ day: item.slot.day, items: [item] });
  }

  return days;
}

/**
 * Coverage as a two-part bar: what already has a collector, and what does not.
 * Assigned against unassigned is a readiness state rather than a category, which
 * is why it wears the status colours instead of the categorical chart hues.
 */
function CoverageBar({
  assigned,
  total,
}: Readonly<{ assigned: number; total: number }>) {
  const share = total === 0 ? 0 : (assigned / total) * 100;

  return (
    <div
      aria-hidden="true"
      className="flex h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-warn"
    >
      {/* The hairline is a border rather than a gap, so the two parts still add
          up to the full width of the track. */}
      <div
        className="border-r border-surface-raised bg-ok last:border-r-0"
        style={{ width: `${share}%` }}
      />
    </div>
  );
}

/**
 * Per slot, and grouped by day: the spine of the pickup. A slot is one moment at
 * the counter, so its own coverage is what says whether that moment can run.
 */
export function JadwalPengambilan({
  slots,
}: Readonly<{ slots: PanitiaSlotPickup[] }>) {
  const days = byDay(slots);

  return (
    <TableShell
      caption="Kesiapan pengambilan pada setiap slot makan, dikelompokkan per hari"
      minWidth="52rem"
      head={
        <tr>
          <th scope="col" className="px-4 py-2.5 text-left font-medium">
            Hari
          </th>
          <th scope="col" className="px-4 py-2.5 text-left font-medium">
            Slot
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            Total porsi
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            Sudah ada PIC
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            Tanpa PIC
          </th>
          <th scope="col" className="px-4 py-2.5 text-left font-medium">
            Kesiapan
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            PIC datang
          </th>
        </tr>
      }
    >
      {days.map((day) => (
        <Fragment key={day.day}>
          {day.items.map((item, index) => (
            <tr
              key={item.slot.key}
              // A thicker rule opens each day, so the grouping reads without a
              // separate heading row breaking the columns.
              className={
                index === 0 ? "border-t-2 border-line" : "border-t border-line"
              }
            >
              {index === 0 ? (
                <th
                  scope="rowgroup"
                  rowSpan={day.items.length}
                  className="px-4 py-2.5 text-left align-top font-semibold"
                >
                  {day.day}
                  {item.slot.scheme === "voucher" ? (
                    <span className="mt-1 block font-mono text-[10px] font-normal text-ink-muted">
                      voucher
                    </span>
                  ) : null}
                </th>
              ) : null}
              <td className="px-4 py-2.5">{item.slot.meal}</td>
              <td className="numeric px-4 py-2.5 text-right font-semibold">
                {formatNumber(item.total)}
              </td>
              <td className="numeric px-4 py-2.5 text-right">
                {formatNumber(item.assigned)}
              </td>
              <td
                className={`numeric px-4 py-2.5 text-right ${
                  item.unassigned > 0 ? "font-semibold text-warn" : "text-ink-muted"
                }`}
              >
                {item.unassigned > 0 ? formatNumber(item.unassigned) : "—"}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <CoverageBar assigned={item.assigned} total={item.total} />
                  <span className="numeric shrink-0 text-xs text-ink-muted">
                    {formatShare(
                      item.total === 0 ? 0 : (item.assigned / item.total) * 100,
                    )}
                  </span>
                </div>
              </td>
              <td className="numeric px-4 py-2.5 text-right">
                {formatNumber(item.pics)}
              </td>
            </tr>
          ))}
        </Fragment>
      ))}
    </TableShell>
  );
}

/**
 * The same numbers per person: one row per collector, one column per slot.
 *
 * Read across, a row is one person's schedule — several of them collect at all
 * seven slots while others appear once. Read down, a column is the manifest for
 * that slot. Listing the collectors under each slot instead would repeat the
 * same names seven times over.
 */
export function MatriksPengambilan({
  pickups,
}: Readonly<{ pickups: PanitiaPickup[] }>) {
  const perSlot = PANITIA_SLOTS.map((_slot, index) =>
    pickups.reduce((sum, pickup) => sum + pickup.perSlot[index], 0),
  );
  const total = perSlot.reduce((sum, porsi) => sum + porsi, 0);

  return (
    <TableShell
      caption="Porsi yang diambil setiap PIC pada masing-masing slot makan"
      minWidth="64rem"
      head={
        <tr>
          <th scope="col" className="px-4 py-2 text-left font-medium">
            PIC
          </th>
          <th scope="col" className="px-3 py-2 text-left font-medium">
            Kontak WA
          </th>
          {PANITIA_SLOTS.map((slot) => (
            <th
              key={slot.key}
              scope="col"
              className="px-2 py-2 text-center font-medium"
            >
              {slot.day}
              <span className="block text-[10px] font-normal normal-case">
                {slot.meal}
              </span>
            </th>
          ))}
          <th scope="col" className="px-3 py-2 text-right font-medium">
            Datang
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            Total
          </th>
        </tr>
      }
    >
      {pickups.map((pickup) => (
        <tr
          key={pickup.name}
          className={`border-t border-line ${pickup.assigned ? "" : "bg-warn/5"}`}
        >
          <th scope="row" className="px-4 py-2.5 text-left font-medium">
            {pickup.assigned ? (
              pickup.name
            ) : (
              <span className="text-warn">Belum ditentukan</span>
            )}
            <span className="mt-0.5 block text-xs font-normal text-ink-muted">
              {formatNumber(pickup.rows)} baris · {formatNumber(pickup.orang)} orang
            </span>
          </th>
          <td className="numeric px-3 py-2.5 text-xs">
            {pickup.kontak || <span className="text-ink-muted">—</span>}
          </td>
          {pickup.perSlot.map((porsi, index) => (
            <td
              key={PANITIA_SLOTS[index].key}
              className={`numeric px-2 py-2.5 text-center ${
                porsi === 0 ? "text-ink-muted" : "font-medium"
              }`}
            >
              {porsi === 0 ? "—" : formatNumber(porsi)}
            </td>
          ))}
          <td className="numeric px-3 py-2.5 text-right text-xs text-ink-muted">
            {formatNumber(pickup.slots)}×
          </td>
          <td className="numeric px-4 py-2.5 text-right font-semibold">
            {formatNumber(pickup.porsi)}
          </td>
        </tr>
      ))}

      {/* The column totals close the table, so each slot's figure can be checked
          against the schedule above without leaving the page. */}
      <tr className="border-t-2 border-line bg-surface-sunken font-semibold">
        <th scope="row" className="px-4 py-2.5 text-left">
          Total
        </th>
        <td />
        {perSlot.map((porsi, index) => (
          <td
            key={PANITIA_SLOTS[index].key}
            className="numeric px-2 py-2.5 text-center"
          >
            {formatNumber(porsi)}
          </td>
        ))}
        <td />
        <td className="numeric px-4 py-2.5 text-right">{formatNumber(total)}</td>
      </tr>
    </TableShell>
  );
}
