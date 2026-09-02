"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";
import { transitionLabel } from "@/lib/domain/status";

/**
 * One button per legal next status. The current status rides along as `from` so
 * the action can match it in the WHERE clause and refuse to act on a stale page.
 */
export function StatusActions({
  action,
  from,
  transitions,
}: Readonly<{ action: FormAction; from: string; transitions: string[] }>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  if (transitions.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        Status ini final, tidak ada perubahan lanjutan.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((to) => (
          <form key={to} action={formAction}>
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <button
              type="submit"
              disabled={pending}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                to === "CANCELLED"
                  ? "border-alert/50 bg-alert/10 text-alert hover:bg-alert/20 focus-visible:outline-alert"
                  : "border-line bg-surface-raised hover:bg-surface-sunken focus-visible:outline-brand-600"
              }`}
            >
              {transitionLabel(to)}
            </button>
          </form>
        ))}
      </div>
      <FormMessage state={state} />
    </div>
  );
}
