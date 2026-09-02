"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import {
  CheckboxField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

/**
 * One key per attempt, kept until that attempt succeeds. A pickup moves stock,
 * so a retry after a timeout must land on the same key and be answered with the
 * transaction that already exists rather than a second handover.
 */
function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function PickupForm({
  action,
  locations,
  remaining,
  unitOfMeasure,
  canOverride,
  defaultLocationId,
}: Readonly<{
  action: FormAction;
  locations: Option[];
  remaining: number;
  unitOfMeasure: string;
  canOverride: boolean;
  defaultLocationId?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  const attemptKey = useRef<string | null>(null);
  // A pickup form renders per entitlement row, so ids are namespaced per instance
  // instead of taken from the field name, which repeats.
  const fieldId = useId();

  useEffect(() => {
    if (state.status === "ok") {
      attemptKey.current = null;
    }
  }, [state]);

  // The key is attached here instead of in a hidden input: generating it during
  // render would differ between server and client markup.
  function submit(formData: FormData) {
    attemptKey.current ??= newAttemptKey();
    formData.set("idempotencyKey", attemptKey.current);
    formAction(formData);
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${fieldId}-quantity`}
          name="quantity"
          label={`Jumlah (${unitOfMeasure})`}
          type="number"
          min={1}
          max={remaining}
          step={1}
          required
          defaultValue={remaining}
          errors={state.fieldErrors?.quantity}
          hint={`Sisa hak: ${remaining} ${unitOfMeasure}.`}
        />
        <SelectField
          id={`${fieldId}-inventoryLocationId`}
          name="inventoryLocationId"
          label="Lokasi pengambilan"
          required
          defaultValue={defaultLocationId ?? ""}
          errors={state.fieldErrors?.inventoryLocationId}
          hint="Stok akan dikurangi dari lokasi ini."
        >
          <option value="">— Pilih lokasi —</option>
          {locations.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <TextAreaField
        id={`${fieldId}-notes`}
        name="notes"
        label="Catatan"
        maxLength={1000}
        errors={state.fieldErrors?.notes}
        hint="Opsional. Contoh: diambil oleh perwakilan grup."
      />

      {canOverride ? (
        <CheckboxField
          id={`${fieldId}-manualOverride`}
          name="manualOverride"
          label="Penimpaan manual"
          hint="Melewati batas stok dan masa berlaku. Terekam sebagai override di audit log."
        />
      ) : null}

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Mencatat…">
          Catat pengambilan
        </SubmitButton>
      </div>
    </form>
  );
}
