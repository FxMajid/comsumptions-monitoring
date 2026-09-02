"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type PlanFormValues = {
  itemId: string;
  slotId: string;
  plannedQuantity: number;
  unitCost: string | null;
  notes: string | null;
};

export function PlanForm({
  action,
  items,
  slots,
  submitLabel,
  values,
  lockedSlotId,
}: Readonly<{
  action: FormAction;
  items: Option[];
  slots: Option[];
  submitLabel: string;
  values?: PlanFormValues;
  lockedSlotId?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="itemId"
          label="Item konsumsi"
          required
          defaultValue={values?.itemId ?? ""}
          errors={state.fieldErrors?.itemId}
        >
          <option value="">Pilih item…</option>
          {items.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </SelectField>

        {lockedSlotId ? (
          <input type="hidden" name="slotId" value={lockedSlotId} />
        ) : (
          <SelectField
            name="slotId"
            label="Slot"
            required
            defaultValue={values?.slotId ?? ""}
            errors={state.fieldErrors?.slotId}
          >
            <option value="">Pilih slot…</option>
            {slots.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </SelectField>
        )}

        <TextField
          name="plannedQuantity"
          label="Jumlah rencana"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={values?.plannedQuantity ?? ""}
          errors={state.fieldErrors?.plannedQuantity}
        />
        <TextField
          name="unitCost"
          label="Harga satuan (Rp)"
          type="number"
          min={0}
          step={1}
          defaultValue={values?.unitCost ?? ""}
          errors={state.fieldErrors?.unitCost}
          hint="Untuk proyeksi biaya. Boleh dikosongkan."
        />
      </div>

      <TextAreaField
        name="notes"
        label="Catatan"
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
