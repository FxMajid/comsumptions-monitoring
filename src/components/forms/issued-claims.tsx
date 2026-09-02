"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { QrSymbol } from "@/components/ui/qr-symbol";
import type { IssuedClaim } from "@/lib/actions/result";
import { formatDateTime } from "@/lib/format";

function CopyButton({
  text,
  label,
}: Readonly<{ text: string; label: string }>) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {copied ? (
        <Check aria-hidden className="size-3.5 text-ok" />
      ) : (
        <Copy aria-hidden className="size-3.5" />
      )}
      {copied ? "Tersalin" : label}
    </button>
  );
}

/**
 * The one screen where a raw token is visible. Only its hash is stored, so this
 * block is the single chance to copy the link; afterwards a lost link can only
 * be replaced by a new one.
 */
export function IssuedClaims({ issued }: Readonly<{ issued: IssuedClaim[] }>) {
  if (issued.length === 0) {
    return null;
  }

  const single = issued.length === 1 ? issued[0] : null;

  if (single) {
    return (
      <div className="rounded-lg border border-ok/40 bg-ok/5 p-4">
        <p className="text-sm font-semibold">
          QR untuk {single.beneficiaryName}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          Berlaku sampai {formatDateTime(single.expiresAt)}. Tautan ini hanya
          tampil sekali — simpan atau cetak sekarang.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {single.qr ? (
            <QrSymbol
              matrix={single.qr}
              label={`QR klaim untuk ${single.beneficiaryName}`}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <code className="break-all rounded-md border border-line bg-surface-sunken px-2 py-1.5 text-xs">
              {single.claimUrl}
            </code>
            <div>
              <CopyButton text={single.claimUrl} label="Salin tautan" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rows = issued
    .map((claim) => `${claim.beneficiaryCode}\t${claim.beneficiaryName}\t${claim.claimUrl}`)
    .join("\n");

  return (
    <div className="rounded-lg border border-ok/40 bg-ok/5 p-4">
      <p className="text-sm font-semibold">{issued.length} tautan diterbitkan</p>
      <p className="mt-0.5 text-xs text-ink-muted">
        Kode, nama, tautan — dipisah tab agar bisa ditempel langsung ke
        spreadsheet untuk mail merge. Tampil sekali saja.
      </p>
      <textarea
        readOnly
        rows={8}
        value={rows}
        aria-label="Daftar tautan klaim"
        className="mt-3 w-full resize-y rounded-md border border-line bg-surface-sunken px-3 py-2 font-mono text-xs"
      />
      <div className="mt-2">
        <CopyButton text={rows} label="Salin semua" />
      </div>
    </div>
  );
}
