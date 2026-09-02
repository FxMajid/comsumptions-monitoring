import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffProfile } from "@/lib/auth/server";
import { updateArea } from "@/lib/actions/master";
import { isUuid } from "@/lib/domain/ids";
import { AREA_TYPES, AREA_TYPE_LABELS, getArea } from "@/lib/domain/master";
import { AreaForm } from "@/components/forms/area-form";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/section";

export const metadata: Metadata = { title: "Ubah Area" };

const AREA_TYPE_OPTIONS = AREA_TYPES.map((value) => ({
  value,
  label: AREA_TYPE_LABELS[value],
}));

export default async function AreaDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  await requireStaffProfile("/master");

  const { id } = await params;

  if (!isUuid(id)) {
    notFound();
  }

  const area = await getArea(id);

  if (!area) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={area.name}
        description="Ubah area."
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
          <AreaForm
            action={updateArea.bind(null, area.id)}
            areaTypes={AREA_TYPE_OPTIONS}
            submitLabel="Simpan perubahan"
            values={{
              code: area.code,
              name: area.name,
              areaType: area.areaType,
              isActive: area.isActive,
            }}
          />
        </Card>
      </div>
    </>
  );
}
