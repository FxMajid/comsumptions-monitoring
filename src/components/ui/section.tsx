export function Section({
  id,
  title,
  description,
  action,
  children,
}: Readonly<{
  /** Names the region from its own heading, so a screen reader announces which
   *  section it entered rather than an unlabelled group. */
  id?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}>) {
  const headingId = id ? `${id}-judul` : undefined;

  return (
    <section className="mb-8" aria-labelledby={headingId}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-line bg-surface-raised p-4">
      {children}
    </div>
  );
}

export function TableShell({
  caption,
  head,
  children,
  minWidth = "48rem",
}: Readonly<{
  caption: string;
  head: React.ReactNode;
  children: React.ReactNode;
  minWidth?: string;
}>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-ink-muted">
          {head}
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
