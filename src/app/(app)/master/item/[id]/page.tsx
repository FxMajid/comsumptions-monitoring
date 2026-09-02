import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { updateConsumptionItem } from "@/lib/actions/master";
import { isUuid } from "@/lib/domain/ids";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  getConsumptionItem,
} from "@/lib/domain/master";
import { ItemForm } from "@/components/forms/item-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/section";

export const metadata: Metadata = { title: "Ubah Item" };

const ITEM_TYPE_OPTIONS = ITEM_TYPES.map((value) => ({
  value,
  label: ITEM_TYPE_LABELS[value],
}));

/** `params` is a promise in Next 16 and has to be awaited before use. */
export default async function ItemDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/master");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const item = await getConsumptionItem(id);

  if (!item) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={item.name}
        description="Ubah item konsumsi."
        meta={
          <Link
            href="/master"
            className="text-brand-600 underline-offset-2 hover:underline"
          >
            ← Data Master
          </Link>
        }
      />

      <div className="max-w-2xl">
        <Card>
          <ItemForm
            action={updateConsumptionItem.bind(null, item.id)}
            itemTypes={ITEM_TYPE_OPTIONS}
            submitLabel="Simpan perubahan"
            values={{
              code: item.code,
              name: item.name,
              itemType: item.itemType,
              unitOfMeasure: item.unitOfMeasure,
              isActive: item.isActive,
            }}
          />
        </Card>

        <p className="mt-4 text-xs text-ink-muted">
          Mengubah kode ikut mengubah semua tampilan yang memakainya. Rencana dan
          pesanan menunjuk lewat id, jadi kaitannya tetap utuh.
        </p>
      </div>
    </>
  );
}
