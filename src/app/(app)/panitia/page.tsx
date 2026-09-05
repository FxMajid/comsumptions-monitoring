import type { Metadata } from "next";
import { requireStaffProfile } from "@/lib/auth/server";
import { PANITIA_ROWS } from "@/lib/data/panitia-rows";
import {
  PANITIA_SLOTS,
  VOUCHER_RATE,
  dataIssues,
  pickupBySlot,
  pickupMatrix,
  slotBreakdowns,
  summarizePanitia,
  topContributors,
  totalPorsiOf,
  worstPickupSlot,
} from "@/lib/domain/panitia";
import { formatNumber, formatRupiah, formatShare } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Section, TableShell } from "@/components/ui/section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/status-badge";
import { KategoriBar } from "@/components/panitia/kategori-bar";
import {
  JadwalPengambilan,
  MatriksPengambilan,
} from "@/components/panitia/pengambilan";
import { ChartLegend, SlotChart } from "@/components/panitia/slot-chart";
import { KalkulatorBiaya } from "@/components/panitia/kalkulator-biaya";
import { AttendanceKey, RincianBaris } from "@/components/panitia/rincian-baris";

export const metadata: Metadata = { title: "Ancar-ancar Panitia" };

const SOURCE_FILE = "ancer ancer budget UPDATE-panitia in dan exs.csv";

export default async function PanitiaPage() {
  await requireStaffProfile("/panitia");

  // Everything on this page comes from one in-repo file, so there is nothing to
  // await and nothing that can fail: no event, no query, no empty state.
  const rows = PANITIA_ROWS;
  const summary = summarizePanitia(rows);
  const breakdowns = slotBreakdowns(rows);
  const pickups = pickupMatrix(rows);
  const slotPickups = pickupBySlot(rows);
  const worst = worstPickupSlot(rows);
  const unassigned = pickups.find((pickup) => !pickup.assigned);
  const issues = dataIssues(rows);
  const contributors = topContributors(rows, 10);
  const blokShare = summary.totalPorsi
    ? (summary.blokPorsi / summary.totalPorsi) * 100
    : 0;
  const warnings = issues.filter((issue) => issue.tone === "warn").length;

  return (
    <>
      <PageHeader
        title="Ancar-ancar Konsumsi Panitia"
        description="Perkiraan porsi dan biaya konsumsi panitia Honda Bikers Day 2026, dihitung ulang dari file ancar-ancar. Angka di sini belum menjadi hak konsumsi di database, jadi belum ada QR yang bisa diklaim."
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="rounded-md border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-xs">
              {SOURCE_FILE}
            </span>
            <span>{formatNumber(summary.rows)} baris</span>
            <Badge tone={warnings > 0 ? "warn" : "ok"}>
              {warnings > 0
                ? `${formatNumber(warnings)} hal perlu dibereskan`
                : "Data sudah bersih"}
            </Badge>
          </div>
        }
      />

      <Section
        id="porsi"
        title="Kebutuhan porsi"
        description="Satu porsi adalah satu orang pada satu slot makan, bukan satu orang untuk seluruh event."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <article className="rounded-xl border border-line bg-surface-raised p-5 shadow-panel sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Total porsi seluruh event
            </p>
            <p className="numeric mt-2 text-3xl font-semibold sm:text-4xl">
              {formatNumber(summary.totalPorsi)}
            </p>
            <p className="mt-2 max-w-prose text-sm text-pretty text-ink-muted">
              Dari {formatNumber(summary.orangMakan)} orang yang berhak konsumsi
              menghadiri {PANITIA_SLOTS.length} slot makan, H-2 sampai H+1. Sel
              kehadiran yang dibiarkan kosong dihitung sebagai tidak hadir, jadi
              angka ini lantai — bukan plafon.
            </p>

            <dl className="mt-6 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-ink-muted">
                  Slot paling padat
                </dt>
                <dd className="mt-1 text-sm font-semibold">
                  {summary.puncak.label}{" "}
                  <span className="numeric font-normal text-ink-muted">
                    · {formatNumber(summary.puncak.total)} porsi
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-muted">
                  Skema pembagian
                </dt>
                <dd className="numeric mt-1 text-sm font-semibold">
                  {formatNumber(summary.kateringPorsi)} katering
                  <span className="font-normal text-ink-muted">
                    {" "}
                    · {formatNumber(summary.voucherPorsi)} voucher
                  </span>
                </dd>
              </div>
            </dl>
          </article>

          <div className="grid gap-3 sm:grid-cols-2">
            <StatCard
              label="Orang di file"
              value={formatNumber(summary.orang)}
              hint={`Tersebar di ${formatNumber(summary.rows)} baris, karena satu baris bisa mewakili rombongan`}
            />
            <StatCard
              label="Berhak konsumsi"
              value={formatNumber(summary.orangMakan)}
              hint="Baris dengan kolom Makan = YES"
            />
            <StatCard
              label="Tanpa hak konsumsi"
              value={formatNumber(summary.orangTanpaMakan)}
              hint="Makan = NO, jadi nol porsi di semua slot"
            />
            <StatCard
              label="Porsi puncak"
              value={formatNumber(summary.puncak.total)}
              hint={`Kapasitas yang harus ada sekaligus pada ${summary.puncak.label}`}
            />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-card sm:p-6">
          <h3 className="text-sm font-semibold">Porsi menurut kategori</h3>
          <p className="mt-1 mb-5 max-w-prose text-sm text-pretty text-ink-muted">
            Internal dan Eksternal menentukan siapa yang menanggung biayanya.
            Baris yang kategorinya belum diisi belum masuk ke mana pun.
          </p>
          <KategoriBar
            segments={[
              {
                label: "Internal",
                porsi: summary.internal,
                className: "bg-chart-internal",
                hint: "Panitia main dealer dan dealer",
              },
              {
                label: "Eksternal",
                porsi: summary.eksternal,
                className: "bg-chart-external",
                hint: "Vendor, komunitas, dan pihak luar",
              },
              {
                label: "Kategori kosong",
                porsi: summary.kategoriKosong,
                className: "hatch border border-chart-gap",
                hint: "Sel kategori dibiarkan kosong di file",
              },
            ]}
          />
        </div>
      </Section>

      <Section
        id="slot"
        title="Porsi per slot makan"
        description="Tinggi kolom adalah kebutuhan pada satu waktu makan, bukan akumulasi."
        action={<ChartLegend />}
      >
        <div className="grid gap-4">
          <SlotChart breakdowns={breakdowns} />
          <KalkulatorBiaya summary={summary} breakdowns={breakdowns} />
        </div>
      </Section>

      <Section
        id="penyumbang"
        title="Dari mana porsinya datang"
        description="Sepuluh baris penyumbang porsi terbesar. Ranking-nya baris, bukan orang — dan itulah masalahnya."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <TableShell
            caption="Sepuluh baris dengan porsi terbanyak"
            minWidth="36rem"
            head={
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Baris
                </th>
                <th scope="col" className="px-4 py-2.5 text-left font-medium">
                  Kategori
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Orang
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Porsi
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Porsi terhadap total
                </th>
              </tr>
            }
          >
            {contributors.map((row) => {
              const porsi = totalPorsiOf(row);
              const share = (porsi / summary.totalPorsi) * 100;

              return (
                <tr key={row.no} className="border-t border-line">
                  <th scope="row" className="px-4 py-2.5 text-left font-medium">
                    {row.nama}
                    <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                      {row.peran || row.asal || "—"}
                    </span>
                  </th>
                  <td className="px-4 py-2.5">
                    {row.kategori === "Kosong" ? (
                      <Badge tone="warn">Belum diisi</Badge>
                    ) : (
                      <Badge tone="neutral">{row.kategori}</Badge>
                    )}
                  </td>
                  <td className="numeric px-4 py-2.5 text-right">
                    {formatNumber(row.qty)}
                  </td>
                  <td className="numeric px-4 py-2.5 text-right font-semibold">
                    {formatNumber(porsi)}
                  </td>
                  <td className="numeric px-4 py-2.5 text-right text-ink-muted">
                    {formatShare(share)}
                  </td>
                </tr>
              );
            })}
          </TableShell>

          <article className="rounded-xl border border-line bg-surface-raised p-5 shadow-card">
            <h3 className="text-sm font-semibold">Rombongan tanpa nama</h3>
            <p className="numeric mt-3 text-2xl font-semibold">
              {formatShare(blokShare)}
            </p>
            <p className="mt-1.5 text-sm text-pretty text-ink-muted">
              dari seluruh porsi datang dari {formatNumber(summary.blokRows)} baris
              yang mewakili {formatNumber(summary.blokOrang)} orang tanpa nama per
              individu.
            </p>
            <p className="mt-4 border-t border-line pt-4 text-xs text-pretty text-ink-muted">
              Selama jumlah riilnya belum dikonfirmasi, sebagian besar estimasi ini
              bergerak mengikuti angka yang belum diverifikasi siapa pun. Hak
              konsumsinya juga hanya bisa diterbitkan ke PIC rombongan, bukan ke
              orangnya.
            </p>
          </article>
        </div>
      </Section>

      <Section
        id="pengambilan"
        title="Siapa yang mengambil"
        description="Pengambilan terjadi per slot makan, bukan sekali per orang, jadi angkanya dipecah H-2, H-1, H, sampai H+1."
      >
        {unassigned ? (
          <div className="mb-4 rounded-xl border border-warn/40 bg-warn/5 p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h3 className="text-sm font-semibold">Belum punya PIC pengambilan</h3>
              <p className="numeric text-sm font-semibold text-warn">
                {formatNumber(unassigned.porsi)} porsi ·{" "}
                {formatShare((unassigned.porsi / summary.totalPorsi) * 100)}
              </p>
            </div>
            <p className="mt-2 max-w-prose text-sm text-pretty text-ink-muted">
              {formatNumber(unassigned.rows)} baris — setara{" "}
              {formatNumber(unassigned.orang)} orang — tidak punya nama penanggung
              jawab. Tanpa PIC, tautan klaim tidak punya tujuan pengiriman. Paling
              berat di {worst.label}: {formatNumber(worst.unassigned)} dari{" "}
              {formatNumber(worst.total)} porsi belum ada yang mengambil.
            </p>
          </div>
        ) : null}

        <h3 className="mb-2 mt-6 text-sm font-semibold">Kesiapan tiap slot</h3>
        <JadwalPengambilan slots={slotPickups} />

        <h3 className="mb-2 mt-6 text-sm font-semibold">Porsi per PIC per slot</h3>
        <MatriksPengambilan pickups={pickups} />
        <p className="mt-3 max-w-prose text-xs text-pretty text-ink-muted">
          Baris dibaca ke samping adalah jadwal satu PIC — kolom{" "}
          <strong className="font-semibold text-ink">Datang</strong> menghitung
          berapa kali ia harus ke titik pengambilan. Kolom dibaca ke bawah adalah
          daftar pengambil untuk satu slot.
        </p>
      </Section>

      <Section
        id="rincian"
        title="Rincian per baris"
        description="Seluruh isi file, apa adanya. Filter dan pencarian jalan di browser."
        action={<AttendanceKey />}
      >
        <RincianBaris rows={rows} />
      </Section>

      <Section
        id="catatan"
        title="Catatan data"
        description="Yang harus dibereskan di file sebelum angka di atas dipakai untuk memesan."
      >
        <ol className="grid gap-3">
          {issues.map((issue) => (
            <li
              key={issue.id}
              className="rounded-xl border border-line bg-surface-raised p-4 shadow-card"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
                <h3 className="text-sm font-semibold">{issue.title}</h3>
                <Badge tone={issue.tone === "warn" ? "warn" : "neutral"}>
                  {issue.count}
                </Badge>
              </div>
              <p className="mt-2 max-w-prose text-sm text-pretty text-ink-muted">
                {issue.detail}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-xs text-pretty text-ink-muted">
          Daftar ini dihitung dari barisnya, bukan ditulis manual, jadi entrinya
          hilang sendiri begitu filenya diperbaiki. Harga voucher{" "}
          {formatRupiah(VOUCHER_RATE)} sudah dipatok di file; harga katering
          masih asumsi yang bisa diubah di kalkulator.
        </p>
      </Section>
    </>
  );
}
