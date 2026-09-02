-- Fase 1: alur status yang ditegakkan database, plus view ringkasan untuk
-- halaman jadwal, rencana, dan pesanan vendor.
--
-- RLS menentukan SIAPA yang boleh menulis. Tanpa trigger, tidak ada yang
-- menentukan NILAI status mana yang sah: seorang CONSUMPTION_MANAGER yang
-- memegang publishable key bisa mem-PATCH status apa pun langsung lewat
-- PostgREST, melewati seluruh logika aplikasi. Aturan transisi karena itu
-- hidup di database, dan `src/lib/domain/status.ts` hanya cerminannya untuk
-- kebutuhan UI.

create or replace function public.status_transition_allowed(
  p_entity text,
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_entity
    when 'consumption_slots' then (p_from || '>' || p_to) = any (array[
      'DRAFT>OPEN', 'DRAFT>CANCELLED',
      'OPEN>LOCKED', 'OPEN>CLOSED', 'OPEN>CANCELLED',
      'LOCKED>OPEN', 'LOCKED>CLOSED', 'LOCKED>CANCELLED'
    ])
    when 'consumption_plans' then (p_from || '>' || p_to) = any (array[
      'PLANNED>APPROVED', 'PLANNED>CANCELLED',
      'APPROVED>PLANNED', 'APPROVED>LOCKED', 'APPROVED>CANCELLED',
      'LOCKED>APPROVED', 'LOCKED>CANCELLED',
      -- Unik (event, item, slot) tidak menyaring status, jadi baris CANCELLED
      -- memblokir perencanaan ulang kombinasi yang sama. Membuka kembali ke
      -- PLANNED adalah jalan keluarnya.
      'CANCELLED>PLANNED'
    ])
    when 'consumption_requests' then (p_from || '>' || p_to) = any (array[
      'PLANNED>REQUESTED', 'PLANNED>SENT', 'PLANNED>CANCELLED',
      'REQUESTED>SENT', 'REQUESTED>PARTIALLY_RECEIVED', 'REQUESTED>RECEIVED',
      'REQUESTED>PLANNED', 'REQUESTED>CANCELLED',
      'SENT>PARTIALLY_RECEIVED', 'SENT>RECEIVED', 'SENT>CANCELLED',
      'PARTIALLY_RECEIVED>SENT', 'PARTIALLY_RECEIVED>RECEIVED',
      'PARTIALLY_RECEIVED>CLOSED', 'PARTIALLY_RECEIVED>CANCELLED',
      -- Pembalikan penerimaan bisa menurunkan status kembali. Diizinkan supaya
      -- update_request_status() tidak pernah gagal karena trigger ini.
      'RECEIVED>PARTIALLY_RECEIVED', 'RECEIVED>SENT',
      'RECEIVED>CLOSED', 'RECEIVED>CANCELLED'
    ])
    else false
  end;
$$;

comment on function public.status_transition_allowed(text, text, text) is
  'Daftar transisi status yang sah per entitas. Insert tidak dibatasi fungsi ini; hanya perubahan status pada update.';

create or replace function public.enforce_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.status_transition_allowed(tg_table_name, old.status, new.status) then
    raise exception 'transisi status % tidak sah untuk %: % -> %',
      tg_table_name, tg_table_name, old.status, new.status
      using errcode = 'P0001',
            hint = 'Lihat public.status_transition_allowed untuk transisi yang diizinkan.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_consumption_slot_status on public.consumption_slots;
create trigger enforce_consumption_slot_status
  before update on public.consumption_slots
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_status_transition();

drop trigger if exists enforce_consumption_plan_status on public.consumption_plans;
create trigger enforce_consumption_plan_status
  before update on public.consumption_plans
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_status_transition();

drop trigger if exists enforce_consumption_request_status on public.consumption_requests;
create trigger enforce_consumption_request_status
  before update on public.consumption_requests
  for each row
  when (old.status is distinct from new.status)
  execute function public.enforce_status_transition();

-- Tabel ini terlewat di 002: tanpa trigger, updated_at tidak pernah bergerak
-- kecuali penulisnya mengingat untuk mengisinya sendiri.
drop trigger if exists set_consumption_request_items_updated_at on public.consumption_request_items;
create trigger set_consumption_request_items_updated_at
  before update on public.consumption_request_items
  for each row execute function public.set_updated_at();

-- Menghapus baris pesanan yang sudah diterima akan meninggalkan transaksi
-- inventory tanpa asal: stok tetap bertambah, sumbernya hilang. Aturan ini ada
-- di database, bukan hanya di server action, karena pemegang publishable key
-- bisa mengirim DELETE langsung ke PostgREST.
create or replace function public.block_received_request_item_delete()
returns trigger
language plpgsql
set search_path = public
as $BODY$
begin
  if old.received_quantity > 0 then
    raise exception 'baris pesanan sudah diterima % unit dan tidak bisa dihapus',
      old.received_quantity
      using errcode = 'P0001',
            hint = 'Balikkan penerimaannya lebih dulu, atau nolkan requested_quantity.';
  end if;

  return old;
end;
$BODY$;

drop trigger if exists block_received_request_item_delete on public.consumption_request_items;
create trigger block_received_request_item_delete
  before delete on public.consumption_request_items
  for each row execute function public.block_received_request_item_delete();

-- Ringkasan slot untuk halaman jadwal. Subquery skalar dipakai, bukan join,
-- supaya dua agregat yang tidak berhubungan tidak saling menggandakan baris.
create or replace view public.consumption_slot_overview
with (security_invoker = true) as
select
  cs.id as consumption_slot_id,
  cs.event_id,
  cs.code,
  cs.name,
  cs.relative_day_offset,
  cs.slot_date,
  cs.starts_at,
  cs.ends_at,
  cs.pickup_deadline,
  cs.status,
  (
    select count(*)
    from public.consumption_plans cp
    where cp.consumption_slot_id = cs.id
      and cp.status <> 'CANCELLED'
  )::integer as plan_count,
  (
    select coalesce(sum(cp.planned_quantity), 0)
    from public.consumption_plans cp
    where cp.consumption_slot_id = cs.id
      and cp.status <> 'CANCELLED'
  )::integer as planned_quantity,
  (
    select coalesce(sum(e.quantity), 0)
    from public.entitlements e
    where e.consumption_slot_id = cs.id
      and e.cancelled_at is null
  )::integer as entitlement_quantity
from public.consumption_slots cs;

-- Rencana vs pesanan. Dicocokkan pada (event, item, slot), bukan pada
-- consumption_plan_id, karena kolom itu nullable: item pesanan yang dibuat
-- tanpa menunjuk rencana tetap harus terhitung sebagai serapan rencana.
create or replace view public.consumption_plan_coverage
with (security_invoker = true) as
select
  cp.id as consumption_plan_id,
  cp.event_id,
  cp.consumption_item_id,
  ci.code as item_code,
  ci.name as item_name,
  ci.unit_of_measure,
  cp.consumption_slot_id,
  cs.code as slot_code,
  cs.name as slot_name,
  cs.slot_date,
  cs.status as slot_status,
  cp.planned_quantity,
  cp.unit_cost,
  cp.status,
  cp.notes,
  coalesce(o.requested_quantity, 0)::integer as requested_quantity,
  coalesce(o.sent_quantity, 0)::integer as sent_quantity,
  coalesce(o.received_quantity, 0)::integer as received_quantity,
  greatest(cp.planned_quantity - coalesce(o.requested_quantity, 0), 0)::integer
    as unordered_quantity,
  (cp.planned_quantity * coalesce(cp.unit_cost, 0))::numeric(16, 2) as planned_amount
from public.consumption_plans cp
join public.consumption_items ci on ci.id = cp.consumption_item_id
join public.consumption_slots cs on cs.id = cp.consumption_slot_id
left join (
  select
    cr.event_id,
    cri.consumption_item_id,
    cri.consumption_slot_id,
    sum(cri.requested_quantity) as requested_quantity,
    sum(cri.sent_quantity) as sent_quantity,
    sum(cri.received_quantity) as received_quantity
  from public.consumption_request_items cri
  join public.consumption_requests cr on cr.id = cri.consumption_request_id
  where cr.status <> 'CANCELLED'
  group by cr.event_id, cri.consumption_item_id, cri.consumption_slot_id
) o on o.event_id = cp.event_id
   and o.consumption_item_id = cp.consumption_item_id
   and o.consumption_slot_id = cp.consumption_slot_id;

-- Header pesanan vendor beserta rollup itemnya.
create or replace view public.consumption_request_summaries
with (security_invoker = true) as
select
  cr.id as consumption_request_id,
  cr.event_id,
  cr.vendor_id,
  v.code as vendor_code,
  v.name as vendor_name,
  cr.status,
  cr.requested_at,
  cr.notes,
  count(cri.id)::integer as item_count,
  coalesce(sum(cri.requested_quantity), 0)::integer as requested_quantity,
  coalesce(sum(cri.sent_quantity), 0)::integer as sent_quantity,
  coalesce(sum(cri.received_quantity), 0)::integer as received_quantity,
  coalesce(sum(cri.requested_quantity * coalesce(cri.unit_price, 0)), 0)::numeric(16, 2)
    as requested_amount,
  coalesce(sum(cri.received_quantity * coalesce(cri.unit_price, 0)), 0)::numeric(16, 2)
    as received_amount
from public.consumption_requests cr
join public.vendors v on v.id = cr.vendor_id
left join public.consumption_request_items cri
  on cri.consumption_request_id = cr.id
group by cr.id, cr.event_id, cr.vendor_id, v.code, v.name, cr.status,
         cr.requested_at, cr.notes;

do $$
declare
  t text;
begin
  foreach t in array array[
    'consumption_slot_overview',
    'consumption_plan_coverage',
    'consumption_request_summaries'
  ]
  loop
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;
