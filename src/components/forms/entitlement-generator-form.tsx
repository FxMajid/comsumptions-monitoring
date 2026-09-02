"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { Option } from "@/components/forms/options";
import { SelectField } from "@/components/ui/field";
import { IDLE_STATE, type FormAction } from "@/lib/actions/result";

function CheckboxGroup({
  name,
  legend,
  hint,
  options,
}: Readonly<{ name: string; legend: string; hint: string; options: Option[] }>) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <p className="text-xs text-ink-muted">{hint}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
        {options.map((option) => (
          <label
            key={option.value}
            className="inline-flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={option.value}
              className="size-4 accent-brand-600"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Runs the `generate_entitlements` RPC. Safe to run again after penerima are
 * added: the partial unique index means an existing hak is skipped, not doubled.
 */
export function EntitlementGeneratorForm({
  action,
  items,
  categories,
  types,
  areas,
}: Readonly<{
  action: FormAction;
  items: Option[];
  categories: Option[];
  types: Option[];
  areas: Option[];
}>) {
  const [state, formAction, pending] = useActionState(action, IDLE_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          name="consumptionItemId"
          label="Item konsumsi"
          required
          defaultValue=""
          errors={state.fieldErrors?.consumptionItemId}
        >
          <option value="">— Pilih item —</option>
          {items.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          name="areaId"
          label="Area"
          defaultValue=""
          errors={state.fieldErrors?.areaId}
          hint="Kosong berarti semua area."
        >
          <option value="">— Semua area —</option>
          {areas.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>

      <CheckboxGroup
        name="categories"
        legend="Kategori penerima"
        hint="Tidak dicentang berarti semua kategori."
        options={categories}
      />

      <CheckboxGroup
        name="beneficiaryTypes"
        legend="Jenis penerima"
        hint="Tidak dicentang berarti individu dan grup."
        options={types}
      />

      <FormMessage state={state} />

      <div>
        <SubmitButton pending={pending} pendingLabel="Menerbitkan…">
          Terbitkan hak konsumsi
        </SubmitButton>
      </div>
    </form>
  );
}
