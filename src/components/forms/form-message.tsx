import type { ActionState } from "@/lib/actions/result";

/**
 * aria-live so the outcome is announced without moving focus: the submit button
 * keeps focus and the message is read out where it appears.
 */
export function FormMessage({ state }: Readonly<{ state: ActionState }>) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const isError = state.status === "error";

  return (
    <p
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-sm ${
        isError
          ? "border-alert/40 bg-alert/10 text-alert"
          : "border-ok/40 bg-ok/10 text-ok"
      }`}
    >
      {state.message}
    </p>
  );
}
