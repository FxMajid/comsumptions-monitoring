const CONTROL_CLASS =
  "rounded-md border border-line bg-surface-raised px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:opacity-60 aria-invalid:border-alert";

type FieldShell = {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
};

/**
 * Wraps a control with its label, hint, and server-side errors. The error id is
 * wired through aria-describedby so a screen reader announces why a submit
 * bounced, not just that it did.
 */
function Shell({
  name,
  label,
  hint,
  errors,
  children,
}: Readonly<FieldShell & { children: React.ReactNode }>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${name}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${name}-error`} role="alert" className="text-xs text-alert">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(name: string, hint?: string, errors?: string[]) {
  const ids = [hint ? `${name}-hint` : null, errors?.length ? `${name}-error` : null]
    .filter(Boolean)
    .join(" ");

  return ids === "" ? undefined : ids;
}

export function TextField({
  name,
  label,
  hint,
  errors,
  ...input
}: Readonly<FieldShell & Omit<React.ComponentProps<"input">, "name" | "id">>) {
  return (
    <Shell name={name} label={label} hint={hint} errors={errors}>
      <input
        {...input}
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, hint, errors)}
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
  children,
  ...select
}: Readonly<FieldShell & Omit<React.ComponentProps<"select">, "name" | "id">>) {
  return (
    <Shell name={name} label={label} hint={hint} errors={errors}>
      <select
        {...select}
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, hint, errors)}
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
  ...textarea
}: Readonly<FieldShell & Omit<React.ComponentProps<"textarea">, "name" | "id">>) {
  return (
    <Shell name={name} label={label} hint={hint} errors={errors}>
      <textarea
        {...textarea}
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy(name, hint, errors)}
        className={`${CONTROL_CLASS} min-h-20 resize-y`}
      />
    </Shell>
  );
}

export function CheckboxField({
  name,
  label,
  hint,
  ...input
}: Readonly<
  Omit<FieldShell, "errors"> & Omit<React.ComponentProps<"input">, "name" | "id" | "type">
>) {
  return (
    <div className="flex items-start gap-2">
      <input
        {...input}
        type="checkbox"
        id={name}
        name={name}
        aria-describedby={hint ? `${name}-hint` : undefined}
        className="mt-0.5 size-4 accent-brand-600"
      />
      <div>
        <label htmlFor={name} className="text-sm font-medium">
          {label}
        </label>
        {hint ? (
          <p id={`${name}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
