"use client";

import { useActionState } from "react";
import { confirmPanitiaImport } from "@/lib/actions/panitia-import";
import { IDLE_STATE } from "@/lib/actions/result";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

export function PanitiaImportConfirmForm({
  batchId,
  confirmationKey,
}: Readonly<{ batchId: string; confirmationKey: string }>) {
  const action = confirmPanitiaImport.bind(null, batchId, confirmationKey);
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="grid gap-4">
      <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-sunken p-4 text-sm">
        <input
          type="checkbox"
          name="acknowledgement"
          value="yes"
          required
          className="mt-0.5 size-4 accent-brand-600"
        />
        <span>
          Saya sudah memeriksa perubahan. Data yang tidak ada di CSV tetap disimpan,
          dan impor ini tidak menerbitkan atau mengubah QR maupun hak konsumsi.
        </span>
      </label>

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Menerapkan impor…">
          Konfirmasi impor
        </SubmitButton>
      </div>
    </form>
  );
}
