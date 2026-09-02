"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type ItemFormValues = {
  code: string;
  name: string;
  itemType: string;
  unitOfMeasure: string;
  isActive: boolean;
};

export function ItemForm({
  action,
  itemTypes,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  itemTypes: Option[];
  submitLabel: string;
  values?: ItemFormValues;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="code"
          label="Kode"
          required
          maxLength={32}
          defaultValue={values?.code ?? ""}
          errors={state.fieldErrors?.code}
          hint="Dipakai sebagai kunci, otomatis jadi huruf besar."
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
          name="itemType"
          label="Jenis"
          defaultValue={values?.itemType ?? "MEAL"}
          errors={state.fieldErrors?.itemType}
        >
          {itemTypes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField
          name="unitOfMeasure"
          label="Satuan"
          required
          maxLength={16}
          defaultValue={values?.unitOfMeasure ?? "PCS"}
          errors={state.fieldErrors?.unitOfMeasure}
          hint="Contoh: BOX, PCS, BTL."
        />
      </div>

      <CheckboxField
        name="isActive"
        label="Aktif"
        defaultChecked={values?.isActive ?? true}
        hint="Item nonaktif tetap tersimpan tetapi tidak ditawarkan saat merencanakan."
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
