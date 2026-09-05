import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The dashboard's surface language: borderless cards on a warm ground, separated
 * by fill contrast and a wide soft shadow instead of hairlines, with circular
 * chips and fully rounded controls.
 *
 * It is deliberately a separate set from `Section`/`Card`, which the operational
 * pages use. Those are dense tables where a hairline earns its keep; here the
 * shapes carry the hierarchy.
 */
export function SoftCard({
  className = "",
  children,
}: Readonly<{ className?: string; children: React.ReactNode }>) {
  return (
    <div className={`rounded-soft bg-soft-card p-5 shadow-soft ${className}`}>
      {children}
    </div>
  );
}

/** The round glyph holder that opens most cards in this language. */
export function IconChip({
  children,
  tone = "inset",
}: Readonly<{ children: React.ReactNode; tone?: "inset" | "card" | "brand" }>) {
  const toneClass =
    tone === "brand"
      ? "bg-brand-600 text-white"
      : tone === "card"
        ? "bg-soft-card text-ink shadow-soft"
        : "bg-soft-inset text-ink";

  return (
    <span
      className={`grid size-10 shrink-0 place-items-center rounded-full ${toneClass}`}
    >
      {children}
    </span>
  );
}

/** Uppercase eyebrow. Small caps text needs the extra tracking to stay legible. */
export function CardLabel({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
      {children}
    </p>
  );
}

const PILL_TONE = {
  /* Near-black, the way the reference sets its primary action. In dark mode both
     tokens flip together, so the pill stays a reversal of the card. */
  ink: "bg-ink text-surface hover:bg-ink/90",
  brand: "bg-brand-600 text-white hover:bg-brand-700",
  quiet: "bg-soft-inset text-ink hover:bg-soft-hairline",
} as const;

export function PillLink({
  href,
  tone = "quiet",
  arrow = false,
  children,
}: Readonly<{
  href: string;
  tone?: keyof typeof PILL_TONE;
  arrow?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${PILL_TONE[tone]}`}
    >
      {children}
      {arrow ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
    </Link>
  );
}

/** A read-only pill: a scheme, a filter that is already applied, a unit. */
export function Tag({
  children,
  tone = "quiet",
}: Readonly<{ children: React.ReactNode; tone?: "quiet" | "brand" | "dot" }>) {
  if (tone === "dot") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-soft-inset px-2.5 py-1 text-xs font-medium text-ink">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-brand-500"
        />
        {children}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === "brand"
          ? "bg-brand-50 text-brand-text"
          : "bg-soft-inset text-ink"
      }`}
    >
      {children}
    </span>
  );
}
