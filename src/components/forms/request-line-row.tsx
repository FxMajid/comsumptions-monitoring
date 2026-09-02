"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";
import { formatNumber, formatRupiah } from "@/lib/format";

export type RequestLineRowValues = {
  itemCode: string;
  itemName: string;
  unitOfMeasure: string;
  slotLabel: string;
  requestedQuantity: number;
  sentQuantity: number;
  receivedQuantity: number;
  unitPrice: string | null;
  notes: string | null;
};

/**
 * Rendered as a card rather than a table row: an editable line needs its own
 * <form>, and a form per cell inside a shared row is not valid HTML.
 */
export function RequestLineRow({
  updateAction,
  deleteAction,
  line,
  editable,
}: Readonly<{
  updateAction: FormAction;
  deleteAction: FormAction;
  line: RequestLineRowValues;
  editable: boolean;
}>) {
  const [updateState, updateFormAction, updatePending] = useActionState(
    updateAction,
    IDLE_STATE,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction,
    IDLE_STATE,
  );

  const amount =
    line.unitPrice === null
      ? null
      : Number(line.unitPrice) * line.requestedQuantity;

  return (
    <li className="rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">
            {line.itemName}{" "}
            <span className="text-xs text-ink-muted">{line.itemCode}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{line.slotLabel}</p>
        </div>
        <dl className="flex gap-4 text-xs text-ink-muted">
          <div>
            <dt>Dikirim</dt>
            <dd className="numeric text-sm text-ink">
              {formatNumber(line.sentQuantity)}
            </dd>
          </div>
          <div>
            <dt>Diterima</dt>
            <dd className="numeric text-sm text-ink">
              {formatNumber(line.receivedQuantity)}
            </dd>
          </div>
          <div>
            <dt>Nilai pesanan</dt>
            <dd className="numeric text-sm text-ink">
              {amount === null ? "—" : formatRupiah(amount)}
            </dd>
          </div>
        </dl>
      </div>

      {editable ? (
        <>
          <form action={updateFormAction} className="mt-4 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                name="requestedQuantity"
                label={`Jumlah (${line.unitOfMeasure})`}
                type="number"
                min={1}
                step={1}
                required
                defaultValue={line.requestedQuantity}
                errors={updateState.fieldErrors?.requestedQuantity}
              />
              <TextField
                name="unitPrice"
                label="Harga satuan (Rp)"
                type="number"
                min={0}
                step={1}
                defaultValue={line.unitPrice ?? ""}
                errors={updateState.fieldErrors?.unitPrice}
              />
              <TextField
                name="notes"
                label="Catatan"
                maxLength={1000}
                defaultValue={line.notes ?? ""}
                errors={updateState.fieldErrors?.notes}
              />
            </div>
            <div>
              <SubmitButton pending={updatePending} variant="secondary">
                Simpan baris
              </SubmitButton>
            </div>
          </form>

          <FormMessage state={updateState} />

          {line.receivedQuantity === 0 ? (
            <form action={deleteFormAction} className="mt-3">
              <SubmitButton
                pending={deletePending}
                variant="danger"
                pendingLabel="Menghapus…"
              >
                Hapus baris
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">
              Baris ini sudah diterima sebagian, jadi tidak bisa dihapus. Balikkan
              penerimaannya lebih dulu.
            </p>
          )}

          <FormMessage state={deleteState} />
        </>
      ) : (
        <p className="mt-3 text-xs text-ink-muted">
          Jumlah dipesan {formatNumber(line.requestedQuantity)}{" "}
          {line.unitOfMeasure}
          {line.notes ? ` · ${line.notes}` : ""}
        </p>
      )}
    </li>
  );
}
