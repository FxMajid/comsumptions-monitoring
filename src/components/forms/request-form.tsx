"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { SelectField, TextAreaField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export function RequestForm({
  action,
  vendors,
  submitLabel,
  values,
}: Readonly<{
  action: FormAction;
  vendors: Option[];
  submitLabel: string;
  values?: { vendorId: string; notes: string | null };
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        name="vendorId"
        label="Vendor"
        required
        defaultValue={values?.vendorId ?? ""}
        errors={state.fieldErrors?.vendorId}
      >
        <option value="">Pilih vendor…</option>
        {vendors.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        name="notes"
        label="Catatan pesanan"
        maxLength={1000}
        defaultValue={values?.notes ?? ""}
        errors={state.fieldErrors?.notes}
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
