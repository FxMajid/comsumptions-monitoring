"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type BeneficiaryFormValues = {
  code: string;
  name: string;
  beneficiaryType: string;
  beneficiaryCategory: string;
  quantity: number;
  origin: string;
  areaId: string | null;
  picHbd: string | null;
  employeeGroup: string | null;
  sourceReference: string | null;
  isActive: boolean;
};

export function BeneficiaryForm({
  action,
  types,
  categories,
  origins,
  areas,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  types: Option[];
  categories: Option[];
  origins: Option[];
  areas: Option[];
  submitLabel: string;
  values?: BeneficiaryFormValues;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const [beneficiaryType, setBeneficiaryType] = useState(
    values?.beneficiaryType ?? "INDIVIDUAL",
  );
  const [quantity, setQuantity] = useState(String(values?.quantity ?? 1));
  const isGroup = beneficiaryType === "GROUP";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="code"
          label="Kode penerima"
          required
          maxLength={32}
          defaultValue={values?.code ?? ""}
          errors={state.fieldErrors?.code}
          hint="Nomor peserta, NIK panitia, atau kode grup."
        />
        <TextField
          name="name"
          label="Nama"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
          errors={state.fieldErrors?.name}
        />
        <SelectField
          name="beneficiaryType"
          label="Jenis"
          value={beneficiaryType}
          onChange={(event) => setBeneficiaryType(event.target.value)}
          errors={state.fieldErrors?.beneficiaryType}
          hint="Grup dihitung sebagai satu baris dengan jumlah porsi sendiri."
        >
          {types.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="quantity"
          label="Jumlah porsi"
          type="number"
          min={1}
          step={1}
          required
          readOnly={!isGroup}
          value={isGroup ? quantity : "1"}
          onChange={(event) => setQuantity(event.target.value)}
          errors={state.fieldErrors?.quantity}
          hint={
            isGroup
              ? "Berapa orang yang diwakili grup ini."
              : "Penerima individu selalu 1."
          }
        />
        <SelectField
          name="beneficiaryCategory"
          label="Kategori"
          defaultValue={values?.beneficiaryCategory ?? "COMMITTEE"}
          errors={state.fieldErrors?.beneficiaryCategory}
        >
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="origin"
          label="Asal"
          defaultValue={values?.origin ?? "INTERNAL"}
          errors={state.fieldErrors?.origin}
        >
          {origins.map((option) => (
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
          hint="Menentukan titik pengambilan yang wajar bagi penerima ini."
        >
          <option value="">— Tanpa area —</option>
          {areas.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="picHbd"
          label="PIC HBD"
          maxLength={120}
          defaultValue={values?.picHbd ?? ""}
          errors={state.fieldErrors?.picHbd}
          hint="Penanggung jawab dari sisi panitia. Boleh dikosongkan."
        />
        <TextField
          name="employeeGroup"
          label="Kelompok / divisi"
          maxLength={120}
          defaultValue={values?.employeeGroup ?? ""}
          errors={state.fieldErrors?.employeeGroup}
        />
        <TextField
          name="sourceReference"
          label="Acuan sumber"
          maxLength={120}
          defaultValue={values?.sourceReference ?? ""}
          errors={state.fieldErrors?.sourceReference}
          hint="Nama file atau baris daftar asalnya, untuk jejak audit."
        />
      </div>

      <CheckboxField
        name="isActive"
        label="Aktif"
        defaultChecked={values?.isActive ?? true}
        hint="Penerima nonaktif tidak ikut saat hak konsumsi diterbitkan dan QR-nya tidak berlaku."
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
