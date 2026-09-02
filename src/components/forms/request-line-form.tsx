"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

/**
 * A line is always attached to a plan, so item and slot are derived server-side
 * from the chosen plan rather than picked separately and possibly mismatched.
 */
export function RequestLineForm({
  action,
  plans,
}: Readonly<{ action: FormAction; plans: Option[] }>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        name="planId"
        label="Rencana konsumsi"
        required
        defaultValue=""
        errors={state.fieldErrors?.planId}
        hint="Item dan slot diambil dari rencana yang dipilih."
      >
        <option value="">Pilih rencana…</option>
        {plans.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="requestedQuantity"
          label="Jumlah dipesan"
          type="number"
          min={1}
          step={1}
          required
          errors={state.fieldErrors?.requestedQuantity}
        />
        <TextField
          name="unitPrice"
          label="Harga satuan (Rp)"
          type="number"
          min={0}
          step={1}
          errors={state.fieldErrors?.unitPrice}
          hint="Kosong berarti pakai harga satuan pada rencana."
        />
      </div>

      <TextAreaField
        name="notes"
        label="Catatan baris"
        maxLength={1000}
        errors={state.fieldErrors?.notes}
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>Tambah baris</SubmitButton>
      </div>
    </form>
  );
}
