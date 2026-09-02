"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { IssuedClaims } from "@/components/forms/issued-claims";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/ui/field";
import {
  CLAIM_IDLE_STATE,
  IDLE_STATE,
  type ClaimFormAction,
  type FormAction,
} from "@/lib/actions/result";

/**
 * Issuing and reissuing are the same action; `replace` is what separates them.
 * The reissue path sits behind a disclosure because it silently kills a QR that
 * may already be printed and handed out.
 */
export function ClaimTokenForm({
  action,
  hasLiveToken,
  defaultExpiresAt,
}: Readonly<{
  action: ClaimFormAction;
  hasLiveToken: boolean;
  defaultExpiresAt: string;
}>) {
  const [state, formAction, pending] = useActionState(action, CLAIM_IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        name="expiresAt"
        label="Berlaku sampai"
        type="datetime-local"
        required
        defaultValue={defaultExpiresAt}
        errors={state.fieldErrors?.expiresAt}
        hint="Dibaca sebagai waktu Jakarta (WIB). Setelah lewat, tautan tidak membuka apa pun."
      />

      {hasLiveToken ? <input type="hidden" name="replace" value="on" /> : null}

      <FormMessage state={state} />
      {state.issued ? <IssuedClaims issued={state.issued} /> : null}

      <div>
        <SubmitButton
          pending={pending}
          pendingLabel="Menerbitkan…"
          variant={hasLiveToken ? "danger" : "primary"}
        >
          {hasLiveToken ? "Cabut & terbitkan ulang" : "Terbitkan QR"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function RevokeClaimTokenForm({ action }: Readonly<{ action: FormAction }>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <TextField
        name="reason"
        label="Alasan pencabutan"
        maxLength={120}
        placeholder="Contoh: QR peserta hilang"
        errors={state.fieldErrors?.reason}
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Mencabut…" variant="danger">
          Cabut QR
        </SubmitButton>
      </div>
    </form>
  );
}
