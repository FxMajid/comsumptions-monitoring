"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type AreaFormValues = {
  code: string;
  name: string;
  areaType: string;
  isActive: boolean;
};

export function AreaForm({
  action,
  areaTypes,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  areaTypes: Option[];
  submitLabel: string;
  values?: AreaFormValues;
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
          name="areaType"
          label="Jenis"
          defaultValue={values?.areaType ?? "AREA"}
          errors={state.fieldErrors?.areaType}
        >
          {areaTypes.map((option) => (
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
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
