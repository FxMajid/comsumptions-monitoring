export function Notice({
  title,
  children,
}: Readonly<{ title: string; children?: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken p-4">
      <p className="text-sm font-semibold">{title}</p>
      {children ? (
        <div className="mt-1 text-sm text-ink-muted">{children}</div>
      ) : null}
    </div>
  );
}
