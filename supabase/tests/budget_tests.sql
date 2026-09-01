\set ON_ERROR_STOP on

begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_budget uuid := gen_random_uuid();
  v_expense uuid := gen_random_uuid();
  v_void_expense uuid := gen_random_uuid();
  v_status record;
  v_budget_row record;
  v_summary record;
  v_failed boolean;
begin
  insert into public.events (id, code, name, status, event_date)
  values (v_event, 'TEST-BUDGET-' || replace(v_event::text, '-', ''), 'Test Budget Event', 'inactive', '2026-11-21');

  insert into public.vendors (id, event_id, code, name)
  values (v_vendor, v_event, 'TEST-VENDOR', 'Test Vendor');

  insert into public.budgets (id, event_id, code, name, allocated_amount)
  values (v_budget, v_event, 'KONSUMSI-H', 'Konsumsi Hari-H', 10000000.00);

  -- Invoice for 4.000.000, paid in two instalments of 1.500.000 and 1.000.000.
  insert into public.expenses (id, event_id, budget_id, vendor_id, description, amount, expense_date)
  values (v_expense, v_event, v_budget, v_vendor, 'Nasi box 200 x 20.000', 4000000.00, '2026-11-21');

  select * into v_status from public.expense_payment_statuses where expense_id = v_expense;
  if v_status.payment_status <> 'UNPAID' or v_status.outstanding_amount <> 4000000.00 then
    raise exception 'expected UNPAID with full outstanding, got % / %',
      v_status.payment_status, v_status.outstanding_amount;
  end if;

  insert into public.expense_payments (expense_id, amount, method)
  values (v_expense, 1500000.00, 'TRANSFER');

  select * into v_status from public.expense_payment_statuses where expense_id = v_expense;
  if v_status.payment_status <> 'PARTIALLY_PAID' or v_status.outstanding_amount <> 2500000.00 then
    raise exception 'expected PARTIALLY_PAID with 2.500.000 outstanding, got % / %',
      v_status.payment_status, v_status.outstanding_amount;
  end if;

  insert into public.expense_payments (expense_id, amount, method)
  values (v_expense, 2500000.00, 'CASH');

  select * into v_status from public.expense_payment_statuses where expense_id = v_expense;
  if v_status.payment_status <> 'PAID' or v_status.outstanding_amount <> 0 then
    raise exception 'expected PAID with zero outstanding, got % / %',
      v_status.payment_status, v_status.outstanding_amount;
  end if;

  -- A refund posts as a negative ledger row and drops the status back.
  insert into public.expense_payments (expense_id, amount, method, reference)
  values (v_expense, -500000.00, 'TRANSFER', 'refund kelebihan bayar');

  select * into v_status from public.expense_payment_statuses where expense_id = v_expense;
  if v_status.payment_status <> 'PARTIALLY_PAID' or v_status.paid_amount <> 3500000.00 then
    raise exception 'expected refund to reduce paid to 3.500.000, got % / %',
      v_status.payment_status, v_status.paid_amount;
  end if;

  -- Budget rollup: 4.000.000 invoiced, 3.500.000 paid against a 10.000.000 pagu.
  select * into v_budget_row from public.budget_realizations where budget_id = v_budget;
  if v_budget_row.invoiced_amount <> 4000000.00
     or v_budget_row.paid_amount <> 3500000.00
     or v_budget_row.outstanding_amount <> 500000.00
     or v_budget_row.remaining_amount <> 6000000.00
     or v_budget_row.utilization_percent <> 40.00 then
    raise exception 'budget rollup wrong: invoiced=% paid=% outstanding=% remaining=% util=%',
      v_budget_row.invoiced_amount, v_budget_row.paid_amount, v_budget_row.outstanding_amount,
      v_budget_row.remaining_amount, v_budget_row.utilization_percent;
  end if;

  -- A voided invoice must leave the budget untouched.
  insert into public.expenses (id, event_id, budget_id, vendor_id, description, amount, voided_at, void_reason)
  values (v_void_expense, v_event, v_budget, v_vendor, 'Invoice salah input', 9000000.00, now(), 'duplikat');

  select * into v_budget_row from public.budget_realizations where budget_id = v_budget;
  if v_budget_row.invoiced_amount <> 4000000.00 then
    raise exception 'voided expense leaked into budget: invoiced=%', v_budget_row.invoiced_amount;
  end if;

  select * into v_summary from public.event_budget_summary where event_id = v_event;
  if v_summary.allocated_amount <> 10000000.00 or v_summary.paid_amount <> 3500000.00 then
    raise exception 'event summary wrong: allocated=% paid=%',
      v_summary.allocated_amount, v_summary.paid_amount;
  end if;

  -- Constraint: voiding requires a reason.
  v_failed := false;
  begin
    insert into public.expenses (event_id, budget_id, description, amount, voided_at)
    values (v_event, v_budget, 'tanpa alasan', 1000.00, now());
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected void without reason to be rejected';
  end if;

  -- Constraint: a zero payment is meaningless.
  v_failed := false;
  begin
    insert into public.expense_payments (expense_id, amount) values (v_expense, 0);
  exception when check_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'expected zero payment to be rejected';
  end if;

  raise notice 'Budget domain database tests passed.';
end $$;

rollback;
