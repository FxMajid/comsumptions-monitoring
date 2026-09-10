import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffProfile } from "@/lib/auth/server";
import { getActiveEvent } from "@/lib/domain/event";
import { PanitiaImportForm } from "@/components/panitia/impor-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Card, Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "Impor Roster Panitia" };

export default async function PanitiaImportPage() {
  await requireStaffProfile("/panitia/impor");
  const event = await getActiveEvent();

  return (
    <>
      <PageHeader
        title="Impor roster panitia"
        description="Validasi dan tinjau perubahan dari CSV sebelum data perencanaan panitia diperbarui."
        meta={
          <Link
            href="/panitia"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Kembali ke Panitia
          </Link>
        }
      />

      {!event ? (
        <Notice title="Belum ada event">
          Tambahkan atau aktifkan event sebelum mengimpor roster panitia.
        </Notice>
      ) : (
        <>
          <Section
            title="Unggah CSV"
            description={`Roster akan ditautkan ke ${event.name}. Unggahan ini hanya membuat pratinjau.`}
          >
            <Card>
              <PanitiaImportForm />
            </Card>
          </Section>

          <Section title="Aturan pembaruan">
            <div className="grid gap-3 md:grid-cols-2">
              <Notice title="Upsert, bukan ganti seluruh daftar">
                Baris yang cocok diperbarui dan baris baru ditambahkan. Penerima yang
                tidak ada di file tidak dihapus atau dinonaktifkan.
              </Notice>
              <Notice title="Identitas stabil">
                Template sistem menyertakan ID penerima. File lama tanpa ID dicocokkan
                melalui nama, PIC HBD, dan employee; konflik harus diperbaiki dahulu.
              </Notice>
              <Notice title="Rombongan tetap satu baris">
                Qty lebih dari satu disimpan sebagai satu penerima grup dengan jumlah
                asli, bukan dipecah menjadi orang anonim.
              </Notice>
              <Notice title="QR tidak berubah">
                Impor hanya memperbarui perencanaan roster. Hak konsumsi, QR, klaim,
                stok, dan transaksi tetap melalui alur operasional terpisah.
              </Notice>
            </div>
          </Section>

          <p className="text-sm text-ink-muted">
            Sudah pernah mengimpor? Gunakan{" "}
            <Link
              href="/panitia/impor/template"
              className="font-medium text-brand-600 underline-offset-2 hover:underline"
            >
              template roster terkini
            </Link>{" "}
            agar ID penerima tetap terbawa pada pembaruan berikutnya.
          </p>
        </>
      )}
    </>
  );
}
