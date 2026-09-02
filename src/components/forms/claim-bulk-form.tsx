"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { IssuedClaims } from "@/components/forms/issued-claims";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { SelectField, TextField } from "@/components/ui/field";
import { CLAIM_IDLE_STATE, type ClaimFormAction } from "@/lib/actions/result";

/**
 * Bulk issue only fills the gaps: penerima who already hold a live QR are
 * skipped, so running this twice never invalidates sheets already handed out.
 */
export function ClaimBulkForm({
  action,
  categories,
  areas,
  defaultExpiresAt,
}: Readonly<{
  action: ClaimFormAction;
  categories: Option[];
  areas: Option[];
  defaultExpiresAt: string;
}>) {
  const [state, formAction, pending] = useActionState(action, CLAIM_IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          name="expiresAt"
          label="Berlaku sampai"
          type="datetime-local"
          required
          defaultValue={defaultExpiresAt}
          errors={state.fieldErrors?.expiresAt}
          hint="Waktu Jakarta (WIB)."
        />
        <SelectField
          name="category"
          label="Kategori"
          defaultValue=""
          errors={state.fieldErrors?.category}
        >
          <option value="">— Semua kategori —</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="areaId"
          label="Area"
          defaultValue=""
          errors={state.fieldErrors?.areaId}
        >
          <option value="">— Semua area —</option>
          {areas.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <FormMessage state={state} />
      {state.issued ? <IssuedClaims issued={state.issued} /> : null}

      <div>
        <SubmitButton pending={pending} pendingLabel="Menerbitkan…">
          Terbitkan QR yang belum ada
        </SubmitButton>
      </div>
    </form>
  );
}
