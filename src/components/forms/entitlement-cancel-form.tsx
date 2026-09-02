"use client";

import { useActionState, useId } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

/** Void with a reason. The row stays so the correction has a trail. */
export function EntitlementCancelForm({ action }: Readonly<{ action: FormAction }>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);
  // One of these renders per entitlement row, so the id cannot be the field name.
  const reasonId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField
        id={reasonId}
        name="reason"
        label="Alasan pembatalan"
        required
        maxLength={1000}
        placeholder="Contoh: penerima tidak hadir, diterbitkan dobel"
        errors={state.fieldErrors?.reason}
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Membatalkan…" variant="danger">
          Batalkan hak konsumsi
        </SubmitButton>
      </div>
    </form>
  );
}
