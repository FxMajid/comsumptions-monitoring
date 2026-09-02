type Variant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600",
  secondary:
    "border border-line bg-surface-raised hover:bg-surface-sunken focus-visible:outline-brand-600",
  danger:
    "border border-alert/50 bg-alert/10 text-alert hover:bg-alert/20 focus-visible:outline-alert",
};

export function SubmitButton({
  children,
  pending,
  pendingLabel = "Menyimpan…",
  variant = "primary",
}: Readonly<{
  children: React.ReactNode;
  pending: boolean;
  pendingLabel?: string;
  variant?: Variant;
}>) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
