create extension if not exists pgcrypto;

create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  area_type text not null default 'AREA'
    check (area_type in ('CENTRAL', 'AREA', 'PICKUP_POINT', 'OTHER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  contact_name text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table if not exists public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_code text not null,
  name text not null,
  beneficiary_type text not null
    check (beneficiary_type in ('INDIVIDUAL', 'GROUP')),
  beneficiary_category text not null default 'COMMITTEE'
    check (beneficiary_category in ('PARTICIPANT', 'COMMITTEE', 'PIC', 'GUEST', 'OTHER')),
  quantity integer not null check (quantity > 0),
  origin text not null default 'INTERNAL'
    check (origin in ('INTERNAL', 'EXTERNAL')),
  area_id uuid references public.areas(id) on delete set null,
  pic_hbd text,
  employee_group text,
  source_reference text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (beneficiary_type = 'GROUP' or quantity = 1),
  unique (event_id, beneficiary_code)
);

create table if not exists public.consumption_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  item_type text not null default 'MEAL'
    check (item_type in ('MEAL', 'SNACK', 'DRINK', 'VOUCHER', 'OTHER')),
  unit_of_measure text not null default 'PCS',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table if not exists public.consumption_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  relative_day_offset integer,
  slot_date date not null,
  starts_at time,
  ends_at time,
  pickup_deadline timestamptz,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'OPEN', 'LOCKED', 'CLOSED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table if not exists public.consumption_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid not null references public.consumption_slots(id) on delete restrict,
  planned_quantity integer not null check (planned_quantity > 0),
  unit_cost numeric(14, 2) check (unit_cost is null or unit_cost >= 0),
  notes text,
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'APPROVED', 'LOCKED', 'CANCELLED')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, consumption_item_id, consumption_slot_id)
);

create table if not exists public.consumption_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  status text not null default 'PLANNED'
    check (status in ('PLANNED', 'REQUESTED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consumption_request_items (
  id uuid primary key default gen_random_uuid(),
  consumption_request_id uuid not null references public.consumption_requests(id) on delete cascade,
  consumption_plan_id uuid references public.consumption_plans(id) on delete set null,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid references public.consumption_slots(id) on delete restrict,
  requested_quantity integer not null default 0 check (requested_quantity >= 0),
  sent_quantity integer not null default 0 check (sent_quantity >= 0),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consumption_request_id, consumption_item_id, consumption_slot_id)
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid not null references public.consumption_slots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id) on delete set null,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_entitlements_active_unique
  on public.entitlements(event_id, beneficiary_id, consumption_item_id, consumption_slot_id)
  where cancelled_at is null;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  area_id uuid references public.areas(id) on delete set null,
  code text not null,
  name text not null,
  location_type text not null
    check (location_type in ('CENTRAL_WAREHOUSE', 'AREA', 'PICKUP_POINT', 'OTHER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid references public.consumption_slots(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity integer not null check (quantity <> 0),
  transaction_type text not null
    check (transaction_type in ('RECEIVING', 'TRANSFER_OUT', 'TRANSFER_IN', 'PICKUP', 'WASTE', 'ADJUSTMENT', 'REVERSAL')),
  reference_type text not null
    check (reference_type in ('CONSUMPTION_REQUEST', 'DISTRIBUTION', 'PICKUP', 'RECONCILIATION', 'MANUAL', 'REVERSAL')),
  reference_id uuid,
  reversal_of_transaction_id uuid references public.inventory_transactions(id) on delete restrict,
  performed_by uuid references public.profiles(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  check (
    (transaction_type in ('RECEIVING', 'TRANSFER_IN') and quantity > 0)
    or (transaction_type in ('TRANSFER_OUT', 'PICKUP', 'WASTE') and quantity < 0)
    or (transaction_type in ('ADJUSTMENT', 'REVERSAL') and quantity <> 0)
  )
);

create unique index if not exists idx_inventory_transactions_reversal_once
  on public.inventory_transactions(reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;

create table if not exists public.distribution_transactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  to_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  performed_by uuid references public.profiles(id) on delete set null,
  status text not null default 'POSTED'
    check (status in ('DRAFT', 'POSTED', 'REVERSED', 'CANCELLED')),
  idempotency_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create unique index if not exists idx_distribution_transactions_idempotency
  on public.distribution_transactions(idempotency_key)
  where idempotency_key is not null;

create table if not exists public.distribution_items (
  id uuid primary key default gen_random_uuid(),
  distribution_transaction_id uuid not null references public.distribution_transactions(id) on delete cascade,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid references public.consumption_slots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (distribution_transaction_id, consumption_item_id, consumption_slot_id)
);

create table if not exists public.pickup_transactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete restrict,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  operator_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null,
  status text not null default 'POSTED'
    check (status in ('DRAFT', 'POSTED', 'REVERSED', 'CANCELLED')),
  manual_override boolean not null default false,
  notes text,
  picked_up_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create table if not exists public.pickup_items (
  id uuid primary key default gen_random_uuid(),
  pickup_transaction_id uuid not null references public.pickup_transactions(id) on delete cascade,
  entitlement_id uuid not null references public.entitlements(id) on delete restrict,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid not null references public.consumption_slots(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (pickup_transaction_id, entitlement_id)
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  entitlement_id uuid references public.entitlements(id) on delete set null,
  channel text not null
    check (channel in ('DASHBOARD', 'WHATSAPP')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.stock_reconciliations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  inventory_location_id uuid not null references public.inventory_locations(id) on delete restrict,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED')),
  counted_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  counted_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  stock_reconciliation_id uuid not null references public.stock_reconciliations(id) on delete cascade,
  consumption_item_id uuid not null references public.consumption_items(id) on delete restrict,
  consumption_slot_id uuid references public.consumption_slots(id) on delete restrict,
  system_quantity integer not null,
  physical_quantity integer not null check (physical_quantity >= 0),
  variance_quantity integer generated always as (physical_quantity - system_quantity) stored,
  adjustment_transaction_id uuid references public.inventory_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (stock_reconciliation_id, consumption_item_id, consumption_slot_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_areas_event_id on public.areas(event_id);
create index if not exists idx_vendors_event_id on public.vendors(event_id);
create index if not exists idx_beneficiaries_event_id on public.beneficiaries(event_id);
create index if not exists idx_beneficiaries_area_id on public.beneficiaries(area_id);
create index if not exists idx_beneficiaries_type on public.beneficiaries(beneficiary_type);
create index if not exists idx_consumption_items_event_id on public.consumption_items(event_id);
create index if not exists idx_consumption_slots_event_id on public.consumption_slots(event_id);
create index if not exists idx_consumption_slots_status on public.consumption_slots(status);
create index if not exists idx_consumption_plans_event_item_slot on public.consumption_plans(event_id, consumption_item_id, consumption_slot_id);
create index if not exists idx_consumption_requests_event_status on public.consumption_requests(event_id, status);
create index if not exists idx_consumption_request_items_request on public.consumption_request_items(consumption_request_id);
create index if not exists idx_entitlements_event_beneficiary on public.entitlements(event_id, beneficiary_id);
create index if not exists idx_entitlements_slot_item on public.entitlements(consumption_slot_id, consumption_item_id);
create index if not exists idx_inventory_locations_event_type on public.inventory_locations(event_id, location_type);
create index if not exists idx_inventory_transactions_event_item_location on public.inventory_transactions(event_id, consumption_item_id, inventory_location_id);
create index if not exists idx_inventory_transactions_slot on public.inventory_transactions(consumption_slot_id);
create index if not exists idx_inventory_transactions_type on public.inventory_transactions(transaction_type);
create index if not exists idx_inventory_transactions_reference on public.inventory_transactions(reference_type, reference_id);
create index if not exists idx_inventory_transactions_created_at on public.inventory_transactions(created_at desc);
create index if not exists idx_distribution_transactions_event_status on public.distribution_transactions(event_id, status);
create index if not exists idx_distribution_transactions_from_to on public.distribution_transactions(from_location_id, to_location_id);
create index if not exists idx_pickup_transactions_event_status on public.pickup_transactions(event_id, status);
create index if not exists idx_pickup_transactions_beneficiary on public.pickup_transactions(beneficiary_id);
create index if not exists idx_pickup_transactions_created_at on public.pickup_transactions(created_at desc);
create index if not exists idx_pickup_items_entitlement on public.pickup_items(entitlement_id);
create index if not exists idx_notification_logs_event_status on public.notification_logs(event_id, status);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

drop trigger if exists set_areas_updated_at on public.areas;
create trigger set_areas_updated_at before update on public.areas for each row execute function public.set_updated_at();

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at();

drop trigger if exists set_beneficiaries_updated_at on public.beneficiaries;
create trigger set_beneficiaries_updated_at before update on public.beneficiaries for each row execute function public.set_updated_at();

drop trigger if exists set_consumption_items_updated_at on public.consumption_items;
create trigger set_consumption_items_updated_at before update on public.consumption_items for each row execute function public.set_updated_at();

drop trigger if exists set_consumption_slots_updated_at on public.consumption_slots;
create trigger set_consumption_slots_updated_at before update on public.consumption_slots for each row execute function public.set_updated_at();

drop trigger if exists set_consumption_plans_updated_at on public.consumption_plans;
create trigger set_consumption_plans_updated_at before update on public.consumption_plans for each row execute function public.set_updated_at();

drop trigger if exists set_consumption_requests_updated_at on public.consumption_requests;
create trigger set_consumption_requests_updated_at before update on public.consumption_requests for each row execute function public.set_updated_at();

drop trigger if exists set_distribution_transactions_updated_at on public.distribution_transactions;
create trigger set_distribution_transactions_updated_at before update on public.distribution_transactions for each row execute function public.set_updated_at();

drop trigger if exists set_pickup_transactions_updated_at on public.pickup_transactions;
create trigger set_pickup_transactions_updated_at before update on public.pickup_transactions for each row execute function public.set_updated_at();

drop trigger if exists set_stock_reconciliations_updated_at on public.stock_reconciliations;
create trigger set_stock_reconciliations_updated_at before update on public.stock_reconciliations for each row execute function public.set_updated_at();

create or replace function public.get_stock_balance(
  p_event_id uuid,
  p_consumption_item_id uuid,
  p_inventory_location_id uuid,
  p_consumption_slot_id uuid default null
)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(quantity), 0)::integer
  from public.inventory_transactions
  where event_id = p_event_id
    and consumption_item_id = p_consumption_item_id
    and inventory_location_id = p_inventory_location_id
    and (p_consumption_slot_id is null or consumption_slot_id = p_consumption_slot_id)
$$;

create or replace function public.get_entitlement_picked_quantity(p_entitlement_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(sum(pi.quantity), 0)::integer
  from public.pickup_items pi
  join public.pickup_transactions pt on pt.id = pi.pickup_transaction_id
  where pi.entitlement_id = p_entitlement_id
    and pt.status = 'POSTED'
$$;

create or replace view public.stock_balances
with (security_invoker = true) as
select
  event_id,
  consumption_item_id,
  consumption_slot_id,
  inventory_location_id,
  sum(quantity)::integer as quantity
from public.inventory_transactions
group by event_id, consumption_item_id, consumption_slot_id, inventory_location_id;

create or replace view public.entitlement_statuses
with (security_invoker = true) as
select
  e.id as entitlement_id,
  e.event_id,
  e.beneficiary_id,
  e.consumption_item_id,
  e.consumption_slot_id,
  e.quantity as entitlement_quantity,
  coalesce(p.picked_quantity, 0)::integer as picked_quantity,
  greatest(e.quantity - coalesce(p.picked_quantity, 0), 0)::integer as remaining_quantity,
  case
    when e.cancelled_at is not null then 'CANCELLED'
    when e.expires_at is not null and e.expires_at < now() and coalesce(p.picked_quantity, 0) < e.quantity then 'EXPIRED'
    when coalesce(p.picked_quantity, 0) >= e.quantity then 'PICKED_UP'
    when coalesce(p.picked_quantity, 0) > 0 then 'PARTIALLY_PICKED'
    else 'PENDING'
  end as status
from public.entitlements e
left join (
  select
    pi.entitlement_id,
    sum(pi.quantity)::integer as picked_quantity
  from public.pickup_items pi
  join public.pickup_transactions pt on pt.id = pi.pickup_transaction_id
  where pt.status = 'POSTED'
  group by pi.entitlement_id
) p on p.entitlement_id = e.id;

create or replace view public.consumption_request_variances
with (security_invoker = true) as
select
  cri.id as consumption_request_item_id,
  cr.event_id,
  cr.vendor_id,
  cri.consumption_item_id,
  cri.consumption_slot_id,
  cri.requested_quantity,
  cri.sent_quantity,
  cri.received_quantity,
  cri.sent_quantity - cri.requested_quantity as sent_vs_requested_variance,
  cri.received_quantity - cri.sent_quantity as received_vs_sent_variance,
  cri.received_quantity - cri.requested_quantity as received_vs_requested_variance
from public.consumption_request_items cri
join public.consumption_requests cr on cr.id = cri.consumption_request_id;

create or replace view public.outstanding_entitlements
with (security_invoker = true) as
select *
from public.entitlement_statuses
where status in ('PENDING', 'PARTIALLY_PICKED');

create or replace function public.update_request_status(p_request_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  total_items integer;
  received_items integer;
  any_received boolean;
begin
  select
    count(*),
    count(*) filter (where received_quantity >= greatest(sent_quantity, requested_quantity)),
    bool_or(received_quantity > 0)
  into total_items, received_items, any_received
  from public.consumption_request_items
  where consumption_request_id = p_request_id;

  if total_items = 0 then
    return;
  end if;

  update public.consumption_requests
  set status = case
      when received_items = total_items then 'RECEIVED'
      when any_received then 'PARTIALLY_RECEIVED'
      when exists (
        select 1 from public.consumption_request_items
        where consumption_request_id = p_request_id
          and sent_quantity > 0
      ) then 'SENT'
      else status
    end,
    updated_at = now()
  where id = p_request_id
    and status not in ('CLOSED', 'CANCELLED');
end;
$$;

create or replace function public.receive_consumption(
  p_request_item_id uuid,
  p_inventory_location_id uuid,
  p_quantity integer,
  p_performed_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_item public.consumption_request_items%rowtype;
  v_request public.consumption_requests%rowtype;
  v_location public.inventory_locations%rowtype;
  v_transaction_id uuid;
begin
  perform public.assert_consumption_role(array['ADMIN', 'CONSUMPTION_MANAGER', 'WAREHOUSE_OPERATOR']);

  if p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = '22023';
  end if;

  select * into v_request_item
  from public.consumption_request_items
  where id = p_request_item_id
  for update;

  if not found then
    raise exception 'consumption request item not found' using errcode = 'P0002';
  end if;

  select * into v_request
  from public.consumption_requests
  where id = v_request_item.consumption_request_id
  for update;

  select * into v_location
  from public.inventory_locations
  where id = p_inventory_location_id
    and event_id = v_request.event_id
  for update;

  if not found then
    raise exception 'inventory location not found for event' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('inventory:' || v_request.event_id || ':' || v_request_item.consumption_item_id || ':' || p_inventory_location_id));

  update public.consumption_request_items
  set received_quantity = received_quantity + p_quantity,
      updated_at = now()
  where id = p_request_item_id;

  insert into public.inventory_transactions (
    event_id,
    consumption_item_id,
    consumption_slot_id,
    inventory_location_id,
    quantity,
    transaction_type,
    reference_type,
    reference_id,
    performed_by
  )
  values (
    v_request.event_id,
    v_request_item.consumption_item_id,
    v_request_item.consumption_slot_id,
    p_inventory_location_id,
    p_quantity,
    'RECEIVING',
    'CONSUMPTION_REQUEST',
    v_request.id,
    p_performed_by
  )
  returning id into v_transaction_id;

  perform public.update_request_status(v_request.id);

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (
    p_performed_by,
    'RECEIVE_CONSUMPTION',
    'inventory_transactions',
    v_transaction_id,
    jsonb_build_object('quantity', p_quantity, 'request_item_id', p_request_item_id, 'location_id', p_inventory_location_id)
  );

  return v_transaction_id;
end;
$$;

create or replace function public.transfer_inventory(
  p_event_id uuid,
  p_consumption_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity integer,
  p_consumption_slot_id uuid default null,
  p_idempotency_key text default null,
  p_performed_by uuid default auth.uid(),
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distribution_id uuid;
  v_available integer;
  v_first_lock text;
  v_second_lock text;
begin
  perform public.assert_consumption_role(array['ADMIN', 'CONSUMPTION_MANAGER', 'WAREHOUSE_OPERATOR']);

  if p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = '22023';
  end if;

  if p_from_location_id = p_to_location_id then
    raise exception 'source and destination locations must be different' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select id into v_distribution_id
    from public.distribution_transactions
    where idempotency_key = p_idempotency_key;

    if found then
      return v_distribution_id;
    end if;
  end if;

  v_first_lock := least(p_from_location_id::text, p_to_location_id::text);
  v_second_lock := greatest(p_from_location_id::text, p_to_location_id::text);
  perform pg_advisory_xact_lock(hashtext('inventory:' || p_event_id || ':' || p_consumption_item_id || ':' || v_first_lock));
  perform pg_advisory_xact_lock(hashtext('inventory:' || p_event_id || ':' || p_consumption_item_id || ':' || v_second_lock));

  if not exists (
    select 1 from public.inventory_locations
    where id = p_from_location_id and event_id = p_event_id
  ) or not exists (
    select 1 from public.inventory_locations
    where id = p_to_location_id and event_id = p_event_id
  ) then
    raise exception 'inventory location not found for event' using errcode = 'P0002';
  end if;

  v_available := public.get_stock_balance(p_event_id, p_consumption_item_id, p_from_location_id, p_consumption_slot_id);

  if v_available < p_quantity then
    raise exception 'insufficient stock: available %, requested %', v_available, p_quantity using errcode = 'P0001';
  end if;

  insert into public.distribution_transactions (
    event_id,
    from_location_id,
    to_location_id,
    performed_by,
    status,
    idempotency_key,
    notes
  )
  values (
    p_event_id,
    p_from_location_id,
    p_to_location_id,
    p_performed_by,
    'POSTED',
    p_idempotency_key,
    p_notes
  )
  returning id into v_distribution_id;

  insert into public.distribution_items (
    distribution_transaction_id,
    consumption_item_id,
    consumption_slot_id,
    quantity
  )
  values (
    v_distribution_id,
    p_consumption_item_id,
    p_consumption_slot_id,
    p_quantity
  );

  insert into public.inventory_transactions (
    event_id, consumption_item_id, consumption_slot_id, inventory_location_id,
    quantity, transaction_type, reference_type, reference_id, performed_by
  )
  values
    (p_event_id, p_consumption_item_id, p_consumption_slot_id, p_from_location_id, -p_quantity, 'TRANSFER_OUT', 'DISTRIBUTION', v_distribution_id, p_performed_by),
    (p_event_id, p_consumption_item_id, p_consumption_slot_id, p_to_location_id, p_quantity, 'TRANSFER_IN', 'DISTRIBUTION', v_distribution_id, p_performed_by);

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (
    p_performed_by,
    'TRANSFER_INVENTORY',
    'distribution_transactions',
    v_distribution_id,
    jsonb_build_object('quantity', p_quantity, 'from_location_id', p_from_location_id, 'to_location_id', p_to_location_id)
  );

  return v_distribution_id;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id into v_distribution_id
      from public.distribution_transactions
      where idempotency_key = p_idempotency_key;

      if found then
        return v_distribution_id;
      end if;
    end if;
    raise;
end;
$$;

create or replace function public.pickup_entitlement(
  p_entitlement_id uuid,
  p_inventory_location_id uuid,
  p_quantity integer,
  p_idempotency_key text,
  p_operator_id uuid default auth.uid(),
  p_manual_override boolean default false,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.entitlements%rowtype;
  v_location public.inventory_locations%rowtype;
  v_existing_pickup_id uuid;
  v_pickup_id uuid;
  v_picked_quantity integer;
  v_available_stock integer;
begin
  perform public.assert_consumption_role(array['ADMIN', 'PICKUP_OPERATOR', 'AREA_PIC', 'WAREHOUSE_OPERATOR']);

  if p_quantity <= 0 then
    raise exception 'quantity must be greater than zero' using errcode = '22023';
  end if;

  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('pickup:' || p_idempotency_key));

  select id into v_existing_pickup_id
  from public.pickup_transactions
  where idempotency_key = p_idempotency_key;

  if found then
    return v_existing_pickup_id;
  end if;

  select * into v_entitlement
  from public.entitlements
  where id = p_entitlement_id
  for update;

  if not found then
    raise exception 'entitlement not found' using errcode = 'P0002';
  end if;

  if v_entitlement.cancelled_at is not null and not p_manual_override then
    raise exception 'entitlement is cancelled' using errcode = 'P0001';
  end if;

  if v_entitlement.expires_at is not null and v_entitlement.expires_at < now() and not p_manual_override then
    raise exception 'entitlement is expired' using errcode = 'P0001';
  end if;

  select * into v_location
  from public.inventory_locations
  where id = p_inventory_location_id
    and event_id = v_entitlement.event_id
  for update;

  if not found then
    raise exception 'inventory location not found for entitlement event' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('inventory:' || v_entitlement.event_id || ':' || v_entitlement.consumption_item_id || ':' || p_inventory_location_id));

  v_picked_quantity := public.get_entitlement_picked_quantity(p_entitlement_id);

  if v_picked_quantity + p_quantity > v_entitlement.quantity and not p_manual_override then
    raise exception 'pickup exceeds entitlement: picked %, requested %, entitlement %',
      v_picked_quantity, p_quantity, v_entitlement.quantity using errcode = 'P0001';
  end if;

  v_available_stock := public.get_stock_balance(
    v_entitlement.event_id,
    v_entitlement.consumption_item_id,
    p_inventory_location_id,
    v_entitlement.consumption_slot_id
  );

  if v_available_stock < p_quantity and not p_manual_override then
    raise exception 'insufficient stock: available %, requested %', v_available_stock, p_quantity using errcode = 'P0001';
  end if;

  insert into public.pickup_transactions (
    event_id,
    beneficiary_id,
    inventory_location_id,
    operator_id,
    idempotency_key,
    status,
    manual_override,
    notes
  )
  values (
    v_entitlement.event_id,
    v_entitlement.beneficiary_id,
    p_inventory_location_id,
    p_operator_id,
    p_idempotency_key,
    'POSTED',
    p_manual_override,
    p_notes
  )
  returning id into v_pickup_id;

  insert into public.pickup_items (
    pickup_transaction_id,
    entitlement_id,
    consumption_item_id,
    consumption_slot_id,
    quantity
  )
  values (
    v_pickup_id,
    p_entitlement_id,
    v_entitlement.consumption_item_id,
    v_entitlement.consumption_slot_id,
    p_quantity
  );

  insert into public.inventory_transactions (
    event_id,
    consumption_item_id,
    consumption_slot_id,
    inventory_location_id,
    quantity,
    transaction_type,
    reference_type,
    reference_id,
    performed_by
  )
  values (
    v_entitlement.event_id,
    v_entitlement.consumption_item_id,
    v_entitlement.consumption_slot_id,
    p_inventory_location_id,
    -p_quantity,
    'PICKUP',
    'PICKUP',
    v_pickup_id,
    p_operator_id
  );

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (
    p_operator_id,
    'PICKUP_ENTITLEMENT',
    'pickup_transactions',
    v_pickup_id,
    jsonb_build_object('entitlement_id', p_entitlement_id, 'quantity', p_quantity, 'location_id', p_inventory_location_id, 'manual_override', p_manual_override)
  );

  return v_pickup_id;
exception
  when unique_violation then
    select id into v_existing_pickup_id
    from public.pickup_transactions
    where idempotency_key = p_idempotency_key;

    if found then
      return v_existing_pickup_id;
    end if;

    raise;
end;
$$;

create or replace function public.reverse_transaction(
  p_inventory_transaction_id uuid,
  p_reason text,
  p_performed_by uuid default auth.uid()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.inventory_transactions%rowtype;
  v_reversal_id uuid;
  v_available_stock integer;
begin
  perform public.assert_consumption_role(array['ADMIN', 'CONSUMPTION_MANAGER', 'WAREHOUSE_OPERATOR']);

  if nullif(trim(p_reason), '') is null then
    raise exception 'reversal reason is required' using errcode = '22023';
  end if;

  select * into v_original
  from public.inventory_transactions
  where id = p_inventory_transaction_id
  for update;

  if not found then
    raise exception 'inventory transaction not found' using errcode = 'P0002';
  end if;

  if v_original.transaction_type = 'REVERSAL' then
    raise exception 'reversal transactions cannot be reversed' using errcode = 'P0001';
  end if;

  if v_original.reversed_at is not null then
    raise exception 'inventory transaction already reversed' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('inventory:' || v_original.event_id || ':' || v_original.consumption_item_id || ':' || v_original.inventory_location_id));

  if v_original.quantity > 0 then
    v_available_stock := public.get_stock_balance(
      v_original.event_id,
      v_original.consumption_item_id,
      v_original.inventory_location_id,
      v_original.consumption_slot_id
    );

    if v_available_stock < v_original.quantity then
      raise exception 'insufficient stock to reverse positive transaction: available %, reversal %',
        v_available_stock, v_original.quantity using errcode = 'P0001';
    end if;
  end if;

  insert into public.inventory_transactions (
    event_id,
    consumption_item_id,
    consumption_slot_id,
    inventory_location_id,
    quantity,
    transaction_type,
    reference_type,
    reference_id,
    reversal_of_transaction_id,
    performed_by
  )
  values (
    v_original.event_id,
    v_original.consumption_item_id,
    v_original.consumption_slot_id,
    v_original.inventory_location_id,
    -v_original.quantity,
    'REVERSAL',
    'REVERSAL',
    v_original.reference_id,
    v_original.id,
    p_performed_by
  )
  returning id into v_reversal_id;

  update public.inventory_transactions
  set reversed_at = now(),
      reversed_by = p_performed_by,
      reversal_reason = p_reason
  where id = v_original.id;

  if v_original.reference_type = 'PICKUP' and v_original.reference_id is not null then
    update public.pickup_transactions
    set status = 'REVERSED',
        reversed_at = now(),
        reversed_by = p_performed_by,
        reversal_reason = p_reason,
        updated_at = now()
    where id = v_original.reference_id;
  elsif v_original.reference_type = 'DISTRIBUTION' and v_original.reference_id is not null then
    update public.distribution_transactions
    set status = 'REVERSED',
        updated_at = now()
    where id = v_original.reference_id;
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, old_value, new_value)
  values (
    p_performed_by,
    'REVERSE_TRANSACTION',
    'inventory_transactions',
    v_original.id,
    to_jsonb(v_original),
    jsonb_build_object('reversal_transaction_id', v_reversal_id, 'reason', p_reason)
  );

  return v_reversal_id;
end;
$$;

revoke all on function public.get_stock_balance(uuid, uuid, uuid, uuid) from public;
revoke all on function public.get_entitlement_picked_quantity(uuid) from public;
revoke all on function public.update_request_status(uuid) from public;
revoke all on function public.receive_consumption(uuid, uuid, integer, uuid) from public;
revoke all on function public.transfer_inventory(uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text) from public;
revoke all on function public.pickup_entitlement(uuid, uuid, integer, text, uuid, boolean, text) from public;
revoke all on function public.reverse_transaction(uuid, text, uuid) from public;

grant execute on function public.get_stock_balance(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_entitlement_picked_quantity(uuid) to authenticated;
grant execute on function public.receive_consumption(uuid, uuid, integer, uuid) to authenticated;
grant execute on function public.transfer_inventory(uuid, uuid, uuid, uuid, integer, uuid, text, uuid, text) to authenticated;
grant execute on function public.pickup_entitlement(uuid, uuid, integer, text, uuid, boolean, text) to authenticated;
grant execute on function public.reverse_transaction(uuid, text, uuid) to authenticated;

alter table public.areas enable row level security;
alter table public.vendors enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.consumption_items enable row level security;
alter table public.consumption_slots enable row level security;
alter table public.consumption_plans enable row level security;
alter table public.consumption_requests enable row level security;
alter table public.consumption_request_items enable row level security;
alter table public.entitlements enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.distribution_transactions enable row level security;
alter table public.distribution_items enable row level security;
alter table public.pickup_transactions enable row level security;
alter table public.pickup_items enable row level security;
alter table public.notification_logs enable row level security;
alter table public.stock_reconciliations enable row level security;
alter table public.stock_reconciliation_items enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare
  t text;
  read_roles text := '''ADMIN'', ''CONSUMPTION_MANAGER'', ''WAREHOUSE_OPERATOR'', ''AREA_PIC'', ''PICKUP_OPERATOR'', ''MANAGEMENT''';
  manager_roles text := '''ADMIN'', ''CONSUMPTION_MANAGER''';
  warehouse_roles text := '''ADMIN'', ''CONSUMPTION_MANAGER'', ''WAREHOUSE_OPERATOR''';
  pickup_roles text := '''ADMIN'', ''PICKUP_OPERATOR'', ''AREA_PIC'', ''WAREHOUSE_OPERATOR''';
begin
  foreach t in array array[
    'areas', 'vendors', 'beneficiaries', 'consumption_items', 'consumption_slots',
    'consumption_plans', 'consumption_requests', 'consumption_request_items',
    'entitlements', 'inventory_locations', 'inventory_transactions',
    'distribution_transactions', 'distribution_items', 'pickup_transactions',
    'pickup_items', 'notification_logs', 'stock_reconciliations',
    'stock_reconciliation_items', 'audit_logs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_consumption_roles', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_role_text() in (%s))',
      t || '_select_consumption_roles',
      t,
      read_roles
    );
  end loop;

  foreach t in array array[
    'areas', 'vendors', 'beneficiaries', 'consumption_items', 'consumption_slots',
    'consumption_plans', 'consumption_requests', 'consumption_request_items',
    'entitlements', 'notification_logs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write_manager_roles', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_role_text() in (%s)) with check (public.current_role_text() in (%s))',
      t || '_write_manager_roles',
      t,
      manager_roles,
      manager_roles
    );
  end loop;

  foreach t in array array[
    'inventory_locations', 'distribution_transactions', 'distribution_items',
    'stock_reconciliations', 'stock_reconciliation_items'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write_warehouse_roles', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.current_role_text() in (%s)) with check (public.current_role_text() in (%s))',
      t || '_write_warehouse_roles',
      t,
      warehouse_roles,
      warehouse_roles
    );
  end loop;

  foreach t in array array['pickup_transactions', 'pickup_items']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write_pickup_roles', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.current_role_text() in (%s))',
      t || '_write_pickup_roles',
      t,
      pickup_roles
    );
  end loop;

  execute 'drop policy if exists inventory_transactions_insert_admin_only on public.inventory_transactions';
  execute format(
    'create policy inventory_transactions_insert_admin_only on public.inventory_transactions for insert to authenticated with check (public.current_role_text() in (%s))',
    warehouse_roles
  );

  execute 'drop policy if exists audit_logs_insert_service_roles on public.audit_logs';
  execute format(
    'create policy audit_logs_insert_service_roles on public.audit_logs for insert to authenticated with check (public.current_role_text() in (%s))',
    manager_roles
  );
end $$;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'inventory_transactions'
    ) then
      alter publication supabase_realtime add table public.inventory_transactions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pickup_transactions'
    ) then
      alter publication supabase_realtime add table public.pickup_transactions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'distribution_transactions'
    ) then
      alter publication supabase_realtime add table public.distribution_transactions;
    end if;
  end if;
end $$;

drop policy if exists distribution_transactions_write_warehouse_roles on public.distribution_transactions;
drop policy if exists distribution_items_write_warehouse_roles on public.distribution_items;
drop policy if exists pickup_transactions_write_pickup_roles on public.pickup_transactions;
drop policy if exists pickup_items_write_pickup_roles on public.pickup_items;
drop policy if exists inventory_transactions_insert_admin_only on public.inventory_transactions;

create policy distribution_transactions_direct_write_admin
on public.distribution_transactions
for all
to authenticated
using (public.current_role_text() = 'ADMIN')
with check (public.current_role_text() = 'ADMIN');

create policy distribution_items_direct_write_admin
on public.distribution_items
for all
to authenticated
using (public.current_role_text() = 'ADMIN')
with check (public.current_role_text() = 'ADMIN');

create policy pickup_transactions_direct_write_admin
on public.pickup_transactions
for all
to authenticated
using (public.current_role_text() = 'ADMIN')
with check (public.current_role_text() = 'ADMIN');

create policy pickup_items_direct_write_admin
on public.pickup_items
for all
to authenticated
using (public.current_role_text() = 'ADMIN')
with check (public.current_role_text() = 'ADMIN');

create policy inventory_transactions_direct_insert_admin
on public.inventory_transactions
for insert
to authenticated
with check (public.current_role_text() = 'ADMIN');

-- Defence in depth. RLS already yields zero rows to anon because no policy
-- targets it, but the publishable key ships in browser code, so the table-level
-- grant is removed as well: if RLS is ever disabled on one of these tables by
-- mistake, anon still cannot read it.
do $$
declare
  t text;
begin
  foreach t in array array[
    'areas', 'vendors', 'beneficiaries', 'consumption_items', 'consumption_slots',
    'consumption_plans', 'consumption_requests', 'consumption_request_items',
    'entitlements', 'inventory_locations', 'inventory_transactions',
    'distribution_transactions', 'distribution_items', 'pickup_transactions',
    'pickup_items', 'notification_logs', 'stock_reconciliations',
    'stock_reconciliation_items', 'audit_logs',
    'stock_balances', 'entitlement_statuses', 'consumption_request_variances',
    'outstanding_entitlements'
  ]
  loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

grant select on table public.stock_balances to authenticated;
grant select on table public.entitlement_statuses to authenticated;
grant select on table public.consumption_request_variances to authenticated;
grant select on table public.outstanding_entitlements to authenticated;
