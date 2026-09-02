"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type LocationFormValues = {
  code: string;
  name: string;
  locationType: string;
  areaId: string | null;
  isActive: boolean;
};

export function LocationForm({
  action,
  locationTypes,
  areas,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  locationTypes: Option[];
  areas: Option[];
  submitLabel: string;
  values?: LocationFormValues;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="code"
          label="Kode lokasi"
          required
          maxLength={32}
          defaultValue={values?.code ?? ""}
          errors={state.fieldErrors?.code}
          hint="Contoh: GUDANG_PUSAT, POS_A."
        />
        <TextField
          name="name"
          label="Nama lokasi"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
          errors={state.fieldErrors?.name}
        />
        <SelectField
          name="locationType"
          label="Jenis"
          defaultValue={values?.locationType ?? "PICKUP_POINT"}
          errors={state.fieldErrors?.locationType}
        >
          {locationTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="areaId"
          label="Area"
          defaultValue={values?.areaId ?? ""}
          errors={state.fieldErrors?.areaId}
        >
          <option value="">— Tanpa area —</option>
          {areas.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <CheckboxField
        name="isActive"
        label="Aktif"
        defaultChecked={values?.isActive ?? true}
        hint="Lokasi nonaktif tetap punya riwayat stok, hanya tidak ditawarkan lagi."
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
