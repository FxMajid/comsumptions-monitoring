"use client";

import { useActionState } from "react";
import { createPanitiaImportPreview } from "@/lib/actions/panitia-import";
import { IDLE_STATE } from "@/lib/actions/result";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";

export function PanitiaImportForm() {
  const [state, formAction, pending] = useActionState(
    createPanitiaImportPreview,
    IDLE_STATE,
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div>
        <label htmlFor="roster-csv" className="text-sm font-medium">
          File roster CSV
        </label>
        <input
          id="roster-csv"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          aria-describedby="roster-csv-hint"
          className="mt-1.5 block w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:font-semibold file:text-brand-700 hover:file:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        />
        <p id="roster-csv-hint" className="mt-1.5 text-xs text-ink-muted">
          Maksimal 512 KiB. Gunakan CSV UTF-8 dari template sistem atau format
          spreadsheet lama yang dikenali.
        </p>
      </div>

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Memeriksa CSV…">
          Unggah dan lihat pratinjau
        </SubmitButton>
      </div>
    </form>
  );
}
