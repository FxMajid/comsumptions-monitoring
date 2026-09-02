"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { TextField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

export type SlotFormValues = {
  code: string;
  name: string;
  slotDate: string;
  relativeDayOffset: number | null;
  startsAt: string | null;
  endsAt: string | null;
  pickupDeadline: string;
};

export function SlotForm({
  action,
  submitLabel,
  values,
  defaultDate,
}: Readonly<{
  action: FormAction;
  submitLabel: string;
  values?: SlotFormValues;
  defaultDate?: string;
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="code"
          label="Kode slot"
          required
          maxLength={32}
          defaultValue={values?.code ?? ""}
          errors={state.fieldErrors?.code}
          hint="Contoh: H1_SIANG."
        />
        <TextField
          name="name"
          label="Nama slot"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
          errors={state.fieldErrors?.name}
        />
        <TextField
          name="slotDate"
          label="Tanggal"
          type="date"
          required
          defaultValue={values?.slotDate ?? defaultDate ?? ""}
          errors={state.fieldErrors?.slotDate}
        />
        <TextField
          name="relativeDayOffset"
          label="Hari ke- (relatif)"
          type="number"
          min={-365}
          max={365}
          step={1}
          defaultValue={values?.relativeDayOffset ?? ""}
          errors={state.fieldErrors?.relativeDayOffset}
          hint="0 untuk hari-H, -1 untuk H-1. Boleh dikosongkan."
        />
        <TextField
          name="startsAt"
          label="Mulai"
          type="time"
          defaultValue={values?.startsAt?.slice(0, 5) ?? ""}
          errors={state.fieldErrors?.startsAt}
        />
        <TextField
          name="endsAt"
          label="Selesai"
          type="time"
          defaultValue={values?.endsAt?.slice(0, 5) ?? ""}
          errors={state.fieldErrors?.endsAt}
        />
      </div>

      <TextField
        name="pickupDeadline"
        label="Batas pengambilan"
        type="datetime-local"
        defaultValue={values?.pickupDeadline ?? ""}
        errors={state.fieldErrors?.pickupDeadline}
        hint="Dibaca sebagai waktu Jakarta (WIB). Boleh dikosongkan."
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
