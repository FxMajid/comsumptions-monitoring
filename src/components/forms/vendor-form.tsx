"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  CheckboxField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type VendorFormValues = {
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
};

export function VendorForm({
  action,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  submitLabel: string;
  values?: VendorFormValues;
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
          label="Nama vendor"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
          errors={state.fieldErrors?.name}
        />
        <TextField
          name="contactName"
          label="Nama kontak"
          maxLength={120}
          defaultValue={values?.contactName ?? ""}
          errors={state.fieldErrors?.contactName}
        />
        <TextField
          name="phone"
          label="Telepon"
          type="tel"
          maxLength={120}
          defaultValue={values?.phone ?? ""}
          errors={state.fieldErrors?.phone}
        />
      </div>

      <TextAreaField
        name="notes"
        label="Catatan"
        maxLength={1000}
        defaultValue={values?.notes ?? ""}
        errors={state.fieldErrors?.notes}
      />

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
