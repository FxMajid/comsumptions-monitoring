-- Budget and realisation layer.
--
-- The consumption domain tracks quantities; this tracks money. Two axes that
-- meet at consumption_requests:
--
--   planning axis : consumption_plans.unit_cost -> request_items.unit_price
--   money axis    : budgets -> expenses -> expense_payments
--
-- Payment state is derived from the expense_payments ledger rather than stored
-- on expenses, for the same reason entitlement status is derived from pickups:
-- a stored status column drifts away from the rows that actually moved money.

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  -- Optional narrowing. A budget can cover the whole event, one item, one slot,
  -- or a specific item within a specific slot.
  consumption_item_id uuid references public.consumption_items(id) on delete set null,
  consumption_slot_id uuid references public.consumption_slots(id) on delete set null,
  allocated_amount numeric(16, 2) not null check (allocated_amount >= 0),
  currency char(3) not null default 'IDR',
  status text not null default 'ACTIVE'
    check (status in ('DRAFT', 'ACTIVE', 'LOCKED', 'CANCELLED')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

-- Unit price on the order line. Quantities already live here, so the committed
-- and receivable value of a line is a same-row calculation.
alter table public.consumption_request_items
  add column if not exists unit_price numeric(14, 2)
    check (unit_price is null or unit_price >= 0);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  budget_id uuid references public.budgets(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete restrict,
  consumption_request_id uuid references public.consumption_requests(id) on delete set null,
  expense_type text not null default 'VENDOR_INVOICE'
    check (expense_type in ('VENDOR_INVOICE', 'PETTY_CASH', 'REIMBURSEMENT', 'OTHER')),
  description text not null,
  amount numeric(16, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  invoice_number text,
  -- Supabase Storage object path, not a public URL.
  receipt_path text,
  -- A wrong invoice is voided, never deleted, so the audit trail survives.
  voided_at timestamptz,
  void_reason text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (voided_at is null or void_reason is not null)
);

-- Signed ledger: a refund or a corrected overpayment is a negative row.
create table if not exists public.expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  amount numeric(16, 2) not null check (amount <> 0),
  paid_at timestamptz not null default now(),
  method text not null default 'TRANSFER'
    check (method in ('TRANSFER', 'CASH', 'QRIS', 'OTHER')),
  reference text,
  proof_path text,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_budgets_event_id on public.budgets(event_id);
create index if not exists idx_budgets_item on public.budgets(consumption_item_id);
create index if not exists idx_budgets_slot on public.budgets(consumption_slot_id);
create index if not exists idx_expenses_event_id on public.expenses(event_id);
create index if not exists idx_expenses_budget_id on public.expenses(budget_id);
create index if not exists idx_expenses_vendor_id on public.expenses(vendor_id);
create index if not exists idx_expenses_request_id on public.expenses(consumption_request_id);
create index if not exists idx_expenses_expense_date on public.expenses(expense_date);
create index if not exists idx_expense_payments_expense_id on public.expense_payments(expense_id);

drop trigger if exists set_budgets_updated_at on public.budgets;
create trigger set_budgets_updated_at
before update on public.budgets
for each row
execute function public.set_updated_at();

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();

-- Derived payment state per expense. A voided invoice reports VOID regardless
-- of what was paid against it, so reconciliation can see the payments that
-- still need a refund.
create or replace view public.expense_payment_statuses
with (security_invoker = true) as
select
  e.id as expense_id,
  e.event_id,
  e.budget_id,
  e.vendor_id,
  e.amount as invoiced_amount,
  coalesce(p.paid_amount, 0)::numeric(16, 2) as paid_amount,
  (e.amount - coalesce(p.paid_amount, 0))::numeric(16, 2) as outstanding_amount,
  case
    when e.voided_at is not null then 'VOID'
    when coalesce(p.paid_amount, 0) = 0 then 'UNPAID'
    when coalesce(p.paid_amount, 0) < e.amount then 'PARTIALLY_PAID'
    when coalesce(p.paid_amount, 0) = e.amount then 'PAID'
    else 'OVERPAID'
  end as payment_status
from public.expenses e
left join (
  select expense_id, sum(amount)::numeric(16, 2) as paid_amount
  from public.expense_payments
  group by expense_id
) p on p.expense_id = e.id;

-- Pagu vs komitmen vs realisasi, per budget.
--
--   invoiced    = tagihan yang sudah masuk (belum tentu dibayar)
--   paid        = kas yang sudah keluar
--   outstanding = invoiced - paid, utang ke vendor
--   remaining   = allocated - invoiced, sisa pagu
create or replace view public.budget_realizations
with (security_invoker = true) as
select
  b.id as budget_id,
  b.event_id,
  b.code,
  b.name,
  b.consumption_item_id,
  b.consumption_slot_id,
  b.status,
  b.currency,
  b.allocated_amount,
  coalesce(x.invoiced_amount, 0)::numeric(16, 2) as invoiced_amount,
  coalesce(x.paid_amount, 0)::numeric(16, 2) as paid_amount,
  coalesce(x.outstanding_amount, 0)::numeric(16, 2) as outstanding_amount,
  (b.allocated_amount - coalesce(x.invoiced_amount, 0))::numeric(16, 2) as remaining_amount,
  case
    when b.allocated_amount = 0 then null
    else round(coalesce(x.invoiced_amount, 0) / b.allocated_amount * 100, 2)
  end as utilization_percent
from public.budgets b
left join (
  select
    s.budget_id,
    sum(s.invoiced_amount) as invoiced_amount,
    sum(s.paid_amount) as paid_amount,
    sum(s.outstanding_amount) as outstanding_amount
  from public.expense_payment_statuses s
  where s.payment_status <> 'VOID'
  group by s.budget_id
) x on x.budget_id = b.id;

-- Cost side of the planning axis: what the plan said it would cost, what was
-- actually ordered, and what was actually received. Kept separate from the
-- budget views so vendor-order value is never double counted with invoices.
create or replace view public.consumption_cost_projections
with (security_invoker = true) as
select
  cr.event_id,
  cri.consumption_item_id,
  cri.consumption_slot_id,
  cr.vendor_id,
  sum(cri.requested_quantity) as requested_quantity,
  sum(cri.received_quantity) as received_quantity,
  sum(cri.requested_quantity * coalesce(cri.unit_price, 0))::numeric(16, 2) as requested_amount,
  sum(cri.received_quantity * coalesce(cri.unit_price, 0))::numeric(16, 2) as received_amount
from public.consumption_request_items cri
join public.consumption_requests cr on cr.id = cri.consumption_request_id
where cr.status <> 'CANCELLED'
group by cr.event_id, cri.consumption_item_id, cri.consumption_slot_id, cr.vendor_id;

create or replace view public.event_budget_summary
with (security_invoker = true) as
select
  e.id as event_id,
  e.code,
  e.name,
  coalesce(sum(br.allocated_amount), 0)::numeric(16, 2) as allocated_amount,
  coalesce(sum(br.invoiced_amount), 0)::numeric(16, 2) as invoiced_amount,
  coalesce(sum(br.paid_amount), 0)::numeric(16, 2) as paid_amount,
  coalesce(sum(br.outstanding_amount), 0)::numeric(16, 2) as outstanding_amount,
  coalesce(sum(br.remaining_amount), 0)::numeric(16, 2) as remaining_amount
from public.events e
left join public.budget_realizations br on br.event_id = e.id
  and br.status <> 'CANCELLED'
group by e.id, e.code, e.name;

alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;

do $$
declare
  t text;
  read_roles text := '''ADMIN'', ''CONSUMPTION_MANAGER'', ''WAREHOUSE_OPERATOR'', ''AREA_PIC'', ''PICKUP_OPERATOR'', ''MANAGEMENT''';
  finance_roles text := '''ADMIN'', ''CONSUMPTION_MANAGER''';
begin
  foreach t in array array['budgets', 'expenses', 'expense_payments']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_consumption_roles', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_role_text() in (%s))',
      t || '_select_consumption_roles', t, read_roles
    );

    execute format('drop policy if exists %I on public.%I', t || '_write_finance_roles', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_role_text() in (%s)) with check (public.current_role_text() in (%s))',
      t || '_write_finance_roles', t, finance_roles, finance_roles
    );
  end loop;
end $$;

revoke all on table public.budgets from anon;
revoke all on table public.expenses from anon;
revoke all on table public.expense_payments from anon;
revoke all on table public.expense_payment_statuses from anon;
revoke all on table public.budget_realizations from anon;
revoke all on table public.consumption_cost_projections from anon;
revoke all on table public.event_budget_summary from anon;

grant select on table public.expense_payment_statuses to authenticated;
grant select on table public.budget_realizations to authenticated;
grant select on table public.consumption_cost_projections to authenticated;
grant select on table public.event_budget_summary to authenticated;
