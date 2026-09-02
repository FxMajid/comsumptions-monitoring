-- 006_pickup_access.sql
--
-- Dua hal yang belum ada di 002: cara menerbitkan hak konsumsi secara massal,
-- dan cara peserta membuka haknya sendiri tanpa punya akun.
--
-- Peserta tidak login. Yang dipegangnya adalah satu token acak di dalam QR.
-- Token itu bearer secret: siapa pun yang memegangnya bisa melihat hak konsumsi
-- penerima tersebut, jadi masa berlaku wajib dan pencabutan harus mungkin.

create table if not exists public.beneficiary_access_tokens (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id) on delete cascade,
  -- Hanya digest yang disimpan. Token mentah ada sekali saja, di layar yang
  -- menerbitkannya, lalu hidup di QR peserta. Tabel ini bocor pun tidak
  -- menghasilkan QR yang bisa dipakai.
  token_hash text not null,
  -- Wajib: tautan bertoken tanpa masa berlaku akan tetap membuka data peserta
  -- lama setelah event selesai.
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beneficiary_access_tokens_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint beneficiary_access_tokens_expiry_after_creation
    check (expires_at > created_at)
);

create unique index if not exists idx_beneficiary_access_tokens_hash
  on public.beneficiary_access_tokens(token_hash);

-- Satu token hidup per penerima. Mengganti QR berarti mencabut yang lama lebih
-- dulu, sehingga QR yang sudah dicetak tidak pernah diam-diam tetap berlaku
-- berdampingan dengan yang baru.
create unique index if not exists idx_beneficiary_access_tokens_live
  on public.beneficiary_access_tokens(beneficiary_id)
  where revoked_at is null;

create index if not exists idx_beneficiary_access_tokens_event
  on public.beneficiary_access_tokens(event_id);

drop trigger if exists set_beneficiary_access_tokens_updated_at
  on public.beneficiary_access_tokens;
create trigger set_beneficiary_access_tokens_updated_at
  before update on public.beneficiary_access_tokens
  for each row execute function public.set_updated_at();

alter table public.beneficiary_access_tokens enable row level security;

-- Operator pengambilan harus bisa mencocokkan hash token yang baru dipindai,
-- jadi hak baca ikut role operasional. Penerbitan dan pencabutan tetap milik
-- manajer konsumsi.
drop policy if exists beneficiary_access_tokens_select_consumption_roles
  on public.beneficiary_access_tokens;
create policy beneficiary_access_tokens_select_consumption_roles
on public.beneficiary_access_tokens
for select
to authenticated
using (
  public.current_role_text() in (
    'ADMIN', 'CONSUMPTION_MANAGER', 'WAREHOUSE_OPERATOR', 'AREA_PIC',
    'PICKUP_OPERATOR', 'MANAGEMENT'
  )
);

drop policy if exists beneficiary_access_tokens_write_manager_roles
  on public.beneficiary_access_tokens;
create policy beneficiary_access_tokens_write_manager_roles
on public.beneficiary_access_tokens
for all
to authenticated
using (public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER'))
with check (public.current_role_text() in ('ADMIN', 'CONSUMPTION_MANAGER'));

revoke all on table public.beneficiary_access_tokens from anon;

comment on table public.beneficiary_access_tokens is
  'Token QR per penerima. Hanya digest yang disimpan; masa berlaku wajib.';

-- Satu view untuk semua layar hak konsumsi. `entitlement_statuses` hanya
-- membawa id, sedangkan operator di lapangan butuh nama penerima, nama item,
-- dan jam slotnya.
create or replace view public.entitlement_overview
with (security_invoker = true) as
select
  es.entitlement_id,
  es.event_id,
  es.beneficiary_id,
  b.beneficiary_code,
  b.name as beneficiary_name,
  b.beneficiary_type,
  b.beneficiary_category,
  b.quantity as beneficiary_quantity,
  b.area_id,
  ar.name as area_name,
  es.consumption_item_id,
  ci.code as item_code,
  ci.name as item_name,
  ci.unit_of_measure,
  es.consumption_slot_id,
  cs.code as slot_code,
  cs.name as slot_name,
  cs.slot_date,
  cs.starts_at,
  cs.ends_at,
  cs.pickup_deadline,
  cs.status as slot_status,
  e.expires_at,
  es.entitlement_quantity,
  es.picked_quantity,
  es.remaining_quantity,
  es.status
from public.entitlement_statuses es
join public.entitlements e on e.id = es.entitlement_id
join public.beneficiaries b on b.id = es.beneficiary_id
join public.consumption_items ci on ci.id = es.consumption_item_id
join public.consumption_slots cs on cs.id = es.consumption_slot_id
left join public.areas ar on ar.id = b.area_id;

-- Penerbitan hak konsumsi massal. Dibuat sebagai RPC, bukan rangkaian insert
-- dari aplikasi, karena isinya insert-select: satu baris per penerima yang cocok
-- dalam satu transaksi, bukan ratusan bolak-balik HTTP.
--
-- Idempoten karena index unik parsial pada (event, penerima, item, slot) untuk
-- baris yang belum dibatalkan. Menjalankan ulang setelah menambah penerima baru
-- hanya menerbitkan sisanya.
create or replace function public.generate_entitlements(
  p_consumption_slot_id uuid,
  p_consumption_item_id uuid,
  p_categories text[] default null,
  p_beneficiary_types text[] default null,
  p_area_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.consumption_slots%rowtype;
  v_item public.consumption_items%rowtype;
  v_matched integer;
  v_created integer;
begin
  perform public.assert_consumption_role(array['ADMIN', 'CONSUMPTION_MANAGER']);

  select * into v_slot
  from public.consumption_slots
  where id = p_consumption_slot_id;

  if not found then
    raise exception 'slot tidak ditemukan' using errcode = 'P0002';
  end if;

  select * into v_item
  from public.consumption_items
  where id = p_consumption_item_id;

  if not found then
    raise exception 'item konsumsi tidak ditemukan' using errcode = 'P0002';
  end if;

  if v_item.event_id <> v_slot.event_id then
    raise exception 'item dan slot berada di event yang berbeda' using errcode = 'P0001';
  end if;

  if not v_item.is_active then
    raise exception 'item konsumsi sudah nonaktif' using errcode = 'P0001';
  end if;

  if v_slot.status in ('CLOSED', 'CANCELLED') then
    raise exception 'slot berstatus % tidak menerima penerbitan hak konsumsi baru', v_slot.status
      using errcode = 'P0001',
            hint = 'Buka kembali slotnya bila memang masih perlu diterbitkan.';
  end if;

  -- Kunci per (slot, item) supaya dua penerbitan bersamaan tidak berlomba pada
  -- index unik dan berakhir dengan salah satu gagal.
  perform pg_advisory_xact_lock(
    hashtext('entitlement:' || p_consumption_slot_id::text || ':' || p_consumption_item_id::text)
  );

  select count(*) into v_matched
  from public.beneficiaries b
  where b.event_id = v_slot.event_id
    and b.is_active
    and (p_categories is null or b.beneficiary_category = any (p_categories))
    and (p_beneficiary_types is null or b.beneficiary_type = any (p_beneficiary_types))
    and (p_area_id is null or b.area_id = p_area_id);

  insert into public.entitlements (
    event_id,
    beneficiary_id,
    consumption_item_id,
    consumption_slot_id,
    quantity,
    expires_at
  )
  select
    v_slot.event_id,
    b.id,
    v_item.id,
    v_slot.id,
    -- Grup tidak dipecah menjadi orang fiktif: kuantitasnya mengikuti kuantitas
    -- grup, dan individu selalu 1 karena dijaga constraint di beneficiaries.
    b.quantity,
    v_slot.pickup_deadline
  from public.beneficiaries b
  where b.event_id = v_slot.event_id
    and b.is_active
    and (p_categories is null or b.beneficiary_category = any (p_categories))
    and (p_beneficiary_types is null or b.beneficiary_type = any (p_beneficiary_types))
    and (p_area_id is null or b.area_id = p_area_id)
  on conflict (event_id, beneficiary_id, consumption_item_id, consumption_slot_id)
    where cancelled_at is null
  do nothing;

  get diagnostics v_created = row_count;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (
    auth.uid(),
    'GENERATE_ENTITLEMENTS',
    'consumption_slots',
    v_slot.id,
    jsonb_build_object(
      'consumption_item_id', v_item.id,
      'categories', p_categories,
      'beneficiary_types', p_beneficiary_types,
      'area_id', p_area_id,
      'matched', v_matched,
      'created', v_created
    )
  );

  return jsonb_build_object('matched', v_matched, 'created', v_created);
end;
$$;

comment on function public.generate_entitlements(uuid, uuid, text[], text[], uuid) is
  'Menerbitkan hak konsumsi untuk semua penerima aktif yang cocok filter. Idempoten.';

-- Dua fungsi berikut adalah satu-satunya pintu untuk pemegang token tanpa akun.
-- Keduanya `security definer` karena `anon` sengaja tidak punya hak apa pun atas
-- tabelnya, dan keduanya menyaring ketat pada satu baris token: tidak ada
-- parameter yang bisa dipakai untuk melihat penerima lain.
create or replace function public.resolve_claim_token(p_token_hash text)
returns table (
  beneficiary_id uuid,
  event_id uuid,
  event_code text,
  event_name text,
  beneficiary_code text,
  beneficiary_name text,
  beneficiary_type text,
  beneficiary_category text,
  beneficiary_quantity integer,
  area_name text,
  token_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.event_id,
    ev.code,
    ev.name,
    b.beneficiary_code,
    b.name,
    b.beneficiary_type,
    b.beneficiary_category,
    b.quantity,
    ar.name,
    t.expires_at
  from public.beneficiary_access_tokens t
  join public.beneficiaries b on b.id = t.beneficiary_id
  join public.events ev on ev.id = t.event_id
  left join public.areas ar on ar.id = b.area_id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
    and b.is_active;
$$;

create or replace function public.get_claim_entitlements(p_token_hash text)
returns table (
  entitlement_id uuid,
  item_code text,
  item_name text,
  unit_of_measure text,
  slot_code text,
  slot_name text,
  slot_date date,
  starts_at time,
  ends_at time,
  pickup_deadline timestamptz,
  slot_status text,
  entitlement_quantity integer,
  picked_quantity integer,
  remaining_quantity integer,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    eo.entitlement_id,
    eo.item_code,
    eo.item_name,
    eo.unit_of_measure,
    eo.slot_code,
    eo.slot_name,
    eo.slot_date,
    eo.starts_at,
    eo.ends_at,
    eo.pickup_deadline,
    eo.slot_status,
    eo.entitlement_quantity,
    eo.picked_quantity,
    eo.remaining_quantity,
    eo.status
  from public.beneficiary_access_tokens t
  join public.entitlement_overview eo on eo.beneficiary_id = t.beneficiary_id
  where t.token_hash = p_token_hash
    and t.revoked_at is null
    and t.expires_at > now()
  order by eo.slot_date, eo.starts_at nulls last, eo.item_name;
$$;

revoke all on function public.generate_entitlements(uuid, uuid, text[], text[], uuid) from public;
grant execute on function public.generate_entitlements(uuid, uuid, text[], text[], uuid) to authenticated;

revoke all on function public.resolve_claim_token(text) from public;
revoke all on function public.get_claim_entitlements(text) from public;
grant execute on function public.resolve_claim_token(text) to anon, authenticated;
grant execute on function public.get_claim_entitlements(text) to anon, authenticated;

revoke all on table public.entitlement_overview from anon;
grant select on table public.entitlement_overview to authenticated;
