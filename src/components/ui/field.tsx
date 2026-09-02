const CONTROL_CLASS =
  "rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:opacity-60 aria-invalid:border-alert";

type FieldShell = {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
  /**
   * The element id, defaulting to the field name. A form rendered once per row
   * repeats its names, so those instances pass a value from useId() to keep each
   * label pointing at its own control.
   */
  id?: string;
};

/**
 * Wraps a control with its label, hint, and server-side errors. The error id is
 * wired through aria-describedby so a screen reader announces why a submit
 * bounced, not just that it did.
 */
function Shell({
  controlId,
  label,
  hint,
  errors,
  children,
}: Readonly<{
  controlId: string;
  label: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={controlId} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${controlId}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${controlId}-error`} role="alert" className="text-xs text-alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(controlId: string, hint?: string, errors?: string[]) {
  const ids = [
    hint ? `${controlId}-hint` : null,
    errors?.length ? `${controlId}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return ids === "" ? undefined : ids;
}

export function TextField({
  name,
  label,
  hint,
  errors,
  id,
  ...input
}: Readonly<FieldShell & Omit<React.ComponentProps<"input">, "name" | "id">>) {
  const controlId = id ?? name;

  return (
    <Shell controlId={controlId} label={label} hint={hint} errors={errors}>
      <input
        {...input}
        id={controlId}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(controlId, hint, errors)}
        className={CONTROL_CLASS}
      />
    </Shell>
  );
}

export function SelectField({
  name,
  label,
  hint,
  errors,
  id,
  children,
  ...select
}: Readonly<FieldShell & Omit<React.ComponentProps<"select">, "name" | "id">>) {
  const controlId = id ?? name;

  return (
    <Shell controlId={controlId} label={label} hint={hint} errors={errors}>
      <select
        {...select}
        id={controlId}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(controlId, hint, errors)}
        className={CONTROL_CLASS}
      >
        {children}
      </select>
    </Shell>
  );
}

export function TextAreaField({
  name,
  label,
  hint,
  errors,
  id,
  ...textarea
}: Readonly<FieldShell & Omit<React.ComponentProps<"textarea">, "name" | "id">>) {
  const controlId = id ?? name;

  return (
    <Shell controlId={controlId} label={label} hint={hint} errors={errors}>
      <textarea
        {...textarea}
        id={controlId}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(controlId, hint, errors)}
        className={`${CONTROL_CLASS} min-h-20 resize-y`}
      />
    </Shell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  id,
  ...input
}: Readonly<
  Omit<FieldShell, "errors"> &
    Omit<React.ComponentProps<"input">, "name" | "id" | "type">
>) {
  const controlId = id ?? name;

  return (
    <div className="flex items-start gap-2">
      <input
        {...input}
        type="checkbox"
        id={controlId}
        name={name}
        aria-describedby={hint ? `${controlId}-hint` : undefined}
        className="mt-0.5 size-4 accent-brand-600"
      />
      <div>
        <label htmlFor={controlId} className="text-sm font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${controlId}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
