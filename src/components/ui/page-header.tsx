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
    <header className="mb-6 border-b border-line pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-prose text-sm text-pretty text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {meta ? <div className="text-sm text-ink-muted">{meta}</div> : null}
      </div>
    </header>
  );
}
