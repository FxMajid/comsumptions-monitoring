export function PageHeader({
  title,
  description,
  meta,
}: Readonly<{
  title: string;
  description?: string;
  meta?: React.ReactNode;
}>) {
  return (
    <header className="mb-6 border-b border-line pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-ink-muted">{description}</p>
          ) : null}
        </div>
        {meta ? <div className="text-sm text-ink-muted">{meta}</div> : null}
      </div>
    </header>
  );
}
