-- Roster panitia hidup dan alur impor CSV dua tahap.
-- Preview menyimpan payload tervalidasi; konfirmasi membaca ulang payload server-side.

create or replace function public.panitia_identity_key(
  p_name text,
  p_pic_hbd text,
  p_employee_group text
)
returns text
language sql
immutable
set search_path = public
as $$
  select upper(concat_ws(chr(31),
    btrim(regexp_replace(
      translate(normalize(coalesce(p_name, ''), NFKC),
        chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), ''),
      '\s+', ' ', 'g')),
    btrim(regexp_replace(
      translate(normalize(coalesce(p_pic_hbd, ''), NFKC),
        chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), ''),
      '\s+', ' ', 'g')),
    btrim(regexp_replace(
      translate(normalize(coalesce(p_employee_group, ''), NFKC),
        chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279), ''),
      '\s+', ' ', 'g'))
  ));
$$;

create table public.panitia_import_batches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  canonical_payload jsonb not null check (jsonb_typeof(canonical_payload) = 'array'),
  csv_format text not null check (csv_format in ('LEGACY_21', 'CANONICAL')),
  confirmation_key uuid not null default gen_random_uuid(),
  status text not null default 'PREVIEW' check (status in ('PREVIEW', 'APPLIED', 'EXPIRED')),
  row_count integer not null check (row_count >= 0),
  insert_count integer not null default 0 check (insert_count >= 0),
  update_count integer not null default 0 check (update_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  expires_at timestamptz not null,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((status = 'APPLIED') = (applied_at is not null)),
  check (octet_length(canonical_payload::text) <= 8388608)
);

create unique index idx_panitia_import_batches_active_payload
  on public.panitia_import_batches(owner_id, event_id, file_hash, payload_hash)
  where status = 'PREVIEW';
create unique index idx_panitia_import_batches_confirmation_key
  on public.panitia_import_batches(confirmation_key);
create index idx_panitia_import_batches_owner_created
  on public.panitia_import_batches(owner_id, created_at desc);

create table public.panitia_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.panitia_import_batches(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'UNCHANGED', 'BLOCKED')),
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  identity_key text not null,
  proposed_data jsonb not null check (jsonb_typeof(proposed_data) = 'object'),
  current_data jsonb check (current_data is null or jsonb_typeof(current_data) = 'object'),
  beneficiary_updated_at_snapshot timestamptz,
  roster_updated_at_snapshot timestamptz,
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  created_at timestamptz not null default now()
);

create index idx_panitia_import_rows_batch_operation
  on public.panitia_import_rows(batch_id, operation, source_row_number);

create table public.panitia_import_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.panitia_import_batches(id) on delete cascade,
  import_row_id uuid not null references public.panitia_import_rows(id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries(id)
    on delete no action deferrable initially deferred,
  beneficiary_code text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'UNCHANGED')),
  applied_at timestamptz not null default now(),
  unique (batch_id, import_row_id),
  unique (batch_id, beneficiary_id)
);

create unique index idx_beneficiaries_id_event
  on public.beneficiaries(id, event_id);

create table public.panitia_roster_entries (
  beneficiary_id uuid primary key,
  event_id uuid not null,
  pickup_pic_name text,
  pickup_whatsapp text,
  meal_eligible boolean not null,
  identity_key text not null,
  source_row_number integer not null check (source_row_number > 0),
  last_import_batch_id uuid references public.panitia_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (beneficiary_id, event_id)
    references public.beneficiaries(id, event_id)
    on update cascade on delete cascade
);

create unique index idx_panitia_roster_entries_event_identity
  on public.panitia_roster_entries(event_id, identity_key);
create index idx_panitia_roster_entries_event
  on public.panitia_roster_entries(event_id);

create table public.panitia_roster_slots (
  beneficiary_id uuid not null references public.panitia_roster_entries(beneficiary_id) on delete cascade,
  slot_key text not null check (slot_key in (
    'h2_siang', 'h1_siang', 'h1_malam', 'h_pagi',
    'h_siang', 'h_malam', 'hplus1'
  )),
  attendance text not null check (attendance in ('PRESENT', 'ABSENT', 'UNKNOWN')),
  activity text,
  last_import_batch_id uuid references public.panitia_import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (beneficiary_id, slot_key)
);

create index idx_panitia_roster_slots_key
  on public.panitia_roster_slots(slot_key, attendance);

drop trigger if exists set_panitia_import_batches_updated_at on public.panitia_import_batches;
create trigger set_panitia_import_batches_updated_at
  before update on public.panitia_import_batches
  for each row execute function public.set_updated_at();

drop trigger if exists set_panitia_roster_entries_updated_at on public.panitia_roster_entries;
create trigger set_panitia_roster_entries_updated_at
  before update on public.panitia_roster_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_panitia_roster_slots_updated_at on public.panitia_roster_slots;
create trigger set_panitia_roster_slots_updated_at
  before update on public.panitia_roster_slots
  for each row execute function public.set_updated_at();

-- Sinkronkan identitas roster bila master penerima diedit melalui layar master.
-- Kolom yang dimiliki roster (PIC pengambilan, meal, slot) tetap tidak disentuh.
create or replace function public.sync_panitia_roster_identity()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if row(new.name, new.pic_hbd, new.employee_group, new.event_id)
    is distinct from row(old.name, old.pic_hbd, old.employee_group, old.event_id) then
    update public.panitia_roster_entries re
    set event_id = new.event_id,
        identity_key = public.panitia_identity_key(new.name, new.pic_hbd, new.employee_group)
    where re.beneficiary_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists sync_panitia_roster_identity on public.beneficiaries;
create trigger sync_panitia_roster_identity
  after update of name, pic_hbd, employee_group, event_id on public.beneficiaries
  for each row execute function public.sync_panitia_roster_identity();

create or replace view public.panitia_roster_overview
with (security_invoker = true) as
select
  b.id as beneficiary_id,
  b.event_id,
  b.beneficiary_code,
  b.name,
  b.beneficiary_type,
  b.beneficiary_category,
  b.quantity,
  b.origin,
  b.area_id,
  a.code as area_code,
  a.name as area_name,
  b.pic_hbd,
  b.employee_group,
  b.source_reference,
  b.is_active,
  re.pickup_pic_name,
  re.pickup_whatsapp,
  re.meal_eligible,
  re.identity_key,
  re.source_row_number,
  re.last_import_batch_id,
  coalesce(
    jsonb_object_agg(
      rs.slot_key,
      jsonb_build_object('attendance', rs.attendance, 'activity', rs.activity)
      order by rs.slot_key
    ) filter (where rs.slot_key is not null),
    '{}'::jsonb
  ) as slots,
  b.updated_at as beneficiary_updated_at,
  re.updated_at as roster_updated_at
from public.beneficiaries b
join public.panitia_roster_entries re on re.beneficiary_id = b.id
left join public.areas a on a.id = b.area_id
left join public.panitia_roster_slots rs on rs.beneficiary_id = b.id
group by b.id, a.code, a.name, re.beneficiary_id;

create or replace function public.validate_panitia_import_payload(
  p_event_id uuid,
  p_rows jsonb
)
returns table (
  source_row_number integer,
  operation text,
  beneficiary_id uuid,
  identity_key text,
  proposed_data jsonb,
  current_data jsonb,
  beneficiary_updated_at_snapshot timestamptz,
  roster_updated_at_snapshot timestamptz,
  issues jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_row jsonb;
  v_source_row integer;
  v_requested_id uuid;
  v_match_count integer;
  v_beneficiary public.beneficiaries%rowtype;
  v_roster public.panitia_roster_entries%rowtype;
  v_identity text;
  v_issues jsonb;
  v_operation text;
  v_area_id uuid;
  v_slots jsonb;
  v_slot_key text;
  v_slot jsonb;
  v_quantity integer;
  v_origin text;
  v_area_input text;
  v_has_blocker boolean;
  v_current jsonb;
  v_payload_index integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'rows must be a non-empty JSON array' using errcode = '22023';
  end if;
  if octet_length(p_rows::text) > 8388608 then
    raise exception 'canonical payload exceeds 8 MiB' using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'maximum roster size is 5000 rows' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_payload_index := v_payload_index + 1;
    v_requested_id := null;
    v_match_count := 0;
    v_issues := '[]'::jsonb;
    v_beneficiary := null;
    v_roster := null;
    v_area_id := null;
    v_current := null;

    if jsonb_typeof(v_row) <> 'object' then
      v_row := '{}'::jsonb;
      v_issues := jsonb_build_array(jsonb_build_object(
        'severity', 'BLOCKER', 'code', 'INVALID_ROW',
        'message', 'Setiap baris payload wajib berupa object JSON.'
      ));
    else
      if exists (
        select 1
        from jsonb_object_keys(v_row) as key(value)
        where key.value not in (
          'source_row_number', 'client_issues', 'beneficiary_id', 'number',
          'name', 'pic_hbd', 'employee_group', 'pickup_pic_name',
          'pickup_whatsapp', 'quantity', 'origin', 'meal_eligible', 'area', 'slots'
        )
      ) then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'UNKNOWN_FIELD',
          'message', 'Payload memuat kolom yang tidak dikenal.'
        ));
      end if;

      if v_row ? 'client_issues' and jsonb_typeof(v_row -> 'client_issues') <> 'array' then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'INVALID_CLIENT_ISSUES',
          'message', 'Daftar masalah parser tidak valid.'
        ));
      elsif jsonb_typeof(v_row -> 'client_issues') = 'array' then
        if jsonb_array_length(v_row -> 'client_issues') > 50 then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'severity', 'BLOCKER', 'code', 'TOO_MANY_CLIENT_ISSUES',
            'message', 'Maksimal 50 masalah parser per baris.'
          ));
        end if;
        select v_issues || coalesce(jsonb_agg(jsonb_build_object(
          'severity', 'BLOCKER',
          'code', left(coalesce(nullif(i ->> 'code', ''), 'CSV_PARSE_ERROR'), 80),
          'message', left(coalesce(nullif(i ->> 'message', ''), 'Baris CSV tidak valid.'), 1000)
        )), '[]'::jsonb)
        into v_issues
        from jsonb_array_elements(v_row -> 'client_issues') i;
      end if;
    end if;

    begin v_source_row := (v_row ->> 'source_row_number')::integer;
    exception when others then v_source_row := null; end;
    if v_source_row is null or v_source_row <= 0 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_SOURCE_ROW', 'message', 'Nomor baris sumber wajib berupa integer positif.'));
      -- Tetap persistable sebagai baris BLOCKED; nomor sumber sintetis ini tidak
      -- pernah dipakai untuk apply karena blocker mencegah konfirmasi.
      v_source_row := 1000000000 + v_payload_index;
    end if;

    begin v_requested_id := nullif(v_row ->> 'beneficiary_id', '')::uuid;
    exception when invalid_text_representation then
      v_requested_id := null;
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_BENEFICIARY_ID', 'message', 'ID PENERIMA bukan UUID yang sah.'));
    end;

    v_identity := public.panitia_identity_key(v_row ->> 'name', v_row ->> 'pic_hbd', v_row ->> 'employee_group');
    if nullif(trim(v_row ->> 'name'), '') is null
      or length(v_row ->> 'name') > 120
      or length(coalesce(v_row ->> 'pic_hbd', '')) > 120
      or length(coalesce(v_row ->> 'employee_group', '')) > 120
      or length(coalesce(v_row ->> 'pickup_pic_name', '')) > 120
      or v_identity = concat_ws(chr(31), '', '', '') then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_NAME', 'message', 'Nama wajib diisi dan setiap kolom teks identitas/PIC maksimal 120 karakter.'));
    end if;

    begin v_quantity := (v_row ->> 'quantity')::integer;
    exception when others then v_quantity := null; end;
    if v_quantity is null or v_quantity <= 0 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_QUANTITY', 'message', 'Qty wajib berupa integer positif.'));
    end if;

    v_origin := upper(coalesce(v_row ->> 'origin', ''));
    if v_origin not in ('INTERNAL', 'EXTERNAL') then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_ORIGIN', 'message', 'Kategori wajib INTERNAL atau EXTERNAL.'));
    end if;

    if jsonb_typeof(v_row -> 'meal_eligible') <> 'boolean' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_MEAL_ELIGIBILITY', 'message', 'Makan wajib berupa boolean.'));
    end if;

    if nullif(trim(v_row ->> 'pickup_pic_name'), '') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'WARNING', 'code', 'MISSING_PICKUP_PIC', 'message', 'PIC pengambilan belum diisi.'));
    end if;
    if nullif(trim(v_row ->> 'pickup_whatsapp'), '') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'WARNING', 'code', 'MISSING_PICKUP_WHATSAPP', 'message', 'WhatsApp PIC belum diisi.'));
    elsif (v_row ->> 'pickup_whatsapp') ~ '[eE][+-]?[0-9]' or (v_row ->> 'pickup_whatsapp') !~ '^\+?[0-9]{9,15}$' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_PICKUP_WHATSAPP', 'message', 'WhatsApp PIC wajib berupa 9-15 digit, bukan notasi ilmiah.'));
    end if;

    if v_origin = 'INTERNAL' and lower(trim(coalesce(v_row ->> 'employee_group', ''))) = 'eksternal' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'ORIGIN_EMPLOYEE_CONFLICT', 'message', 'Kategori INTERNAL bertabrakan dengan employee Eksternal.'));
    end if;

    v_area_input := nullif(trim(v_row ->> 'area'), '');
    if v_area_input is not null then
      select count(*), (array_agg(a.id order by a.id))[1] into v_match_count, v_area_id
      from public.areas a
      where a.event_id = p_event_id
        and (lower(a.code) = lower(v_area_input) or lower(a.name) = lower(v_area_input));
      if v_match_count <> 1 then
        v_area_id := null;
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'AREA_NOT_UNIQUE', 'message', 'Area tidak ditemukan atau tidak unik dalam event.'));
      end if;
    end if;

    v_slots := v_row -> 'slots';
    if jsonb_typeof(v_slots) <> 'object'
      or (select count(*) from jsonb_object_keys(coalesce(v_slots, '{}'::jsonb)) as k(value)) <> 7
      or (
        select count(*) from jsonb_object_keys(coalesce(v_slots, '{}'::jsonb)) as k(value)
        where k.value in ('h2_siang', 'h1_siang', 'h1_malam', 'h_pagi', 'h_siang', 'h_malam', 'hplus1')
      ) <> 7 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_SLOTS', 'message', 'Tepat tujuh slot roster wajib dikirim.'));
    else
      foreach v_slot_key in array array['h2_siang', 'h1_siang', 'h1_malam', 'h_pagi', 'h_siang', 'h_malam', 'hplus1']
      loop
        v_slot := v_slots -> v_slot_key;
        if jsonb_typeof(v_slot) <> 'object'
          or exists (
            select 1 from jsonb_object_keys(coalesce(v_slot, '{}'::jsonb)) as key(value)
            where key.value not in ('attendance', 'activity')
          )
          or not (v_slot ? 'attendance')
          or not (v_slot ? 'activity') then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_SLOT', 'message', 'Slot wajib berupa object attendance/activity tanpa kolom tambahan.', 'slot', v_slot_key));
        elsif coalesce(v_slot ->> 'attendance', '') not in ('PRESENT', 'ABSENT', 'UNKNOWN') then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_ATTENDANCE', 'message', 'Kehadiran slot wajib PRESENT, ABSENT, atau UNKNOWN.', 'slot', v_slot_key));
        elsif jsonb_typeof(v_slot -> 'activity') not in ('string', 'null')
          or length(coalesce(v_slot ->> 'activity', '')) > 1000 then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'INVALID_ACTIVITY', 'message', 'Kegiatan slot wajib teks maksimal 1000 karakter atau null.', 'slot', v_slot_key));
        elsif v_slot ->> 'attendance' = 'UNKNOWN' then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'WARNING', 'code', 'UNKNOWN_ATTENDANCE', 'message', 'Kehadiran slot belum diisi.', 'slot', v_slot_key));
        end if;
      end loop;
    end if;

    if v_requested_id is not null then
      select * into v_beneficiary
      from public.beneficiaries b
      where b.id = v_requested_id and b.event_id = p_event_id;
      if not found then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'BENEFICIARY_ID_NOT_FOUND', 'message', 'ID PENERIMA tidak ditemukan pada event ini.'));
      end if;
    elsif not exists (
      select 1 from jsonb_array_elements(v_issues) i
      where i ->> 'code' = 'INVALID_BENEFICIARY_ID'
    ) then
      select count(*), (array_agg(b.id order by b.id))[1] into v_match_count, v_requested_id
      from public.beneficiaries b
      where b.event_id = p_event_id
        and (
          b.beneficiary_category = 'COMMITTEE'
          or exists (
            select 1 from public.panitia_roster_entries owned
            where owned.beneficiary_id = b.id
          )
        )
        and public.panitia_identity_key(b.name, b.pic_hbd, b.employee_group) = v_identity;
      if v_match_count > 1 then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'AMBIGUOUS_IDENTITY', 'message', 'Identitas cocok ke lebih dari satu penerima.'));
      elsif v_match_count = 1 then
        select * into v_beneficiary
        from public.beneficiaries b
        where b.id = v_requested_id;
      end if;
    end if;

    if v_beneficiary.id is not null then
      select count(*) into v_match_count
      from public.beneficiaries b
      where b.event_id = p_event_id
        and b.id <> v_beneficiary.id
        and public.panitia_identity_key(b.name, b.pic_hbd, b.employee_group) = v_identity;
      if v_match_count > 0 then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER',
          'code', 'IDENTITY_POINTS_TO_OTHER_RECORD',
          'message', 'Identitas canonical sudah dipakai penerima lain dalam event ini.'
        ));
      end if;

      select * into v_roster
      from public.panitia_roster_entries re
      where re.beneficiary_id = v_beneficiary.id;
      v_current := jsonb_build_object(
        'beneficiary_id', v_beneficiary.id,
        'beneficiary_code', v_beneficiary.beneficiary_code,
        'name', v_beneficiary.name,
        'pic_hbd', v_beneficiary.pic_hbd,
        'employee_group', v_beneficiary.employee_group,
        'quantity', v_beneficiary.quantity,
        'origin', v_beneficiary.origin,
        'area_id', v_beneficiary.area_id,
        'pickup_pic_name', v_roster.pickup_pic_name,
        'pickup_whatsapp', v_roster.pickup_whatsapp,
        'meal_eligible', v_roster.meal_eligible,
        'is_active', v_beneficiary.is_active,
        'slots', coalesce((select jsonb_object_agg(rs.slot_key, jsonb_build_object('attendance', rs.attendance, 'activity', rs.activity)) from public.panitia_roster_slots rs where rs.beneficiary_id = v_beneficiary.id), '{}'::jsonb)
      );
    end if;

    if v_beneficiary.id is not null and exists (
      select 1 from public.entitlements e
      where e.event_id = p_event_id
        and e.beneficiary_id = v_beneficiary.id
        and e.cancelled_at is null
        and (e.expires_at is null or e.expires_at >= now())
        and public.get_entitlement_picked_quantity(e.id) < e.quantity
    ) and (
      v_beneficiary.quantity is distinct from v_quantity
      or v_beneficiary.beneficiary_type is distinct from (case when v_quantity = 1 then 'INDIVIDUAL' else 'GROUP' end)
      or v_beneficiary.beneficiary_category is distinct from 'COMMITTEE'
      or v_beneficiary.origin is distinct from v_origin
      or v_beneficiary.area_id is distinct from v_area_id
    ) then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('severity', 'BLOCKER', 'code', 'ACTIVE_ENTITLEMENT_CONFLICT', 'message', 'Roster bertabrakan dengan hak konsumsi aktif; koreksi hak secara terpisah.'));
    end if;

    select exists (
      select 1 from jsonb_array_elements(v_issues) i where i ->> 'severity' = 'BLOCKER'
    ) into v_has_blocker;

    if v_has_blocker then
      v_operation := 'BLOCKED';
    elsif v_beneficiary.id is null then
      v_operation := 'INSERT';
    elsif v_beneficiary.name is not distinct from trim(v_row ->> 'name')
      and v_beneficiary.pic_hbd is not distinct from nullif(trim(v_row ->> 'pic_hbd'), '')
      and v_beneficiary.employee_group is not distinct from nullif(trim(v_row ->> 'employee_group'), '')
      and v_beneficiary.beneficiary_type is not distinct from (case when v_quantity = 1 then 'INDIVIDUAL' else 'GROUP' end)
      and v_beneficiary.beneficiary_category is not distinct from 'COMMITTEE'
      and v_beneficiary.quantity is not distinct from v_quantity
      and v_beneficiary.origin is not distinct from v_origin
      and v_beneficiary.area_id is not distinct from v_area_id
      and v_roster.pickup_pic_name is not distinct from nullif(trim(v_row ->> 'pickup_pic_name'), '')
      and v_roster.pickup_whatsapp is not distinct from nullif(trim(v_row ->> 'pickup_whatsapp'), '')
      and v_roster.identity_key is not distinct from v_identity
      and v_roster.source_row_number is not distinct from v_source_row
      and v_roster.meal_eligible is not distinct from (
        case
          when jsonb_typeof(v_row -> 'meal_eligible') = 'boolean'
            then (v_row ->> 'meal_eligible')::boolean
          else null
        end
      )
      and coalesce((select jsonb_object_agg(rs.slot_key, jsonb_build_object('attendance', rs.attendance, 'activity', rs.activity)) from public.panitia_roster_slots rs where rs.beneficiary_id = v_beneficiary.id), '{}'::jsonb)
        is not distinct from coalesce(v_slots, '{}'::jsonb) then
      v_operation := 'UNCHANGED';
    else
      v_operation := 'UPDATE';
    end if;

    source_row_number := v_source_row;
    operation := v_operation;
    beneficiary_id := v_beneficiary.id;
    identity_key := v_identity;
    proposed_data := v_row || jsonb_build_object('area_id', v_area_id, 'identity_key', v_identity);
    current_data := v_current;
    beneficiary_updated_at_snapshot := v_beneficiary.updated_at;
    roster_updated_at_snapshot := v_roster.updated_at;
    issues := v_issues;
    return next;
  end loop;
end;
$function$;

create or replace function public.create_panitia_import_preview(
  p_event_id uuid,
  p_file_hash text,
  p_csv_format text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner uuid := auth.uid();
  v_payload_hash text;
  v_batch public.panitia_import_batches%rowtype;
  v_insert_count integer;
  v_update_count integer;
  v_unchanged_count integer;
  v_blocked_count integer;
  v_warning_count integer;
begin
  perform public.assert_consumption_role(array['ADMIN']);
  if v_owner is null then
    raise exception 'authenticated admin is required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events ev where ev.id = p_event_id) then
    raise exception 'event tidak ditemukan' using errcode = 'P0002';
  end if;
  if coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'file_hash must be lowercase SHA-256 hex' using errcode = '22023';
  end if;
  if p_csv_format not in ('LEGACY_21', 'CANONICAL') then
    raise exception 'unsupported CSV format' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'rows must be a non-empty JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 5000 or octet_length(p_rows::text) > 8388608 then
    raise exception 'canonical payload exceeds import limits' using errcode = '22023';
  end if;

  v_payload_hash := encode(digest(p_rows::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtext('panitia-preview:' || v_owner::text || ':' || p_event_id::text || ':' || v_payload_hash));

  update public.panitia_import_batches pib
  set status = 'EXPIRED'
  where pib.owner_id = v_owner and pib.event_id = p_event_id
    and pib.status = 'PREVIEW' and pib.expires_at <= now();

  -- Selalu validasi ulang upload terhadap snapshot database saat ini. Preview
  -- identik yang lama dibuat kedaluwarsa agar koreksi master/roster tidak pernah
  -- mengembalikan hasil stale selama 24 jam.
  update public.panitia_import_batches pib
  set status = 'EXPIRED'
  where pib.owner_id = v_owner and pib.event_id = p_event_id
    and pib.file_hash = p_file_hash and pib.payload_hash = v_payload_hash
    and pib.status = 'PREVIEW';

  insert into public.panitia_import_batches (
    event_id, owner_id, file_hash, payload_hash, canonical_payload,
    csv_format, row_count, expires_at
  ) values (
    p_event_id, v_owner, p_file_hash, v_payload_hash, p_rows,
    p_csv_format, jsonb_array_length(p_rows), now() + interval '24 hours'
  ) returning * into v_batch;

  insert into public.panitia_import_rows (
    batch_id, source_row_number, operation, beneficiary_id, identity_key,
    proposed_data, current_data, beneficiary_updated_at_snapshot,
    roster_updated_at_snapshot, issues
  )
  select v_batch.id, r.source_row_number, r.operation, r.beneficiary_id,
    r.identity_key, r.proposed_data, r.current_data,
    r.beneficiary_updated_at_snapshot, r.roster_updated_at_snapshot, r.issues
  from public.validate_panitia_import_payload(p_event_id, p_rows) r;

  if (select count(*) from public.panitia_import_rows pir where pir.batch_id = v_batch.id) <> jsonb_array_length(p_rows) then
    raise exception 'validated row count does not match payload' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id
    group by pir.source_row_number having count(*) > 1
  ) then
    update public.panitia_import_rows r
    set operation = 'BLOCKED',
        issues = r.issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'DUPLICATE_SOURCE_ROW',
          'message', 'Nomor baris sumber muncul lebih dari sekali.'
        ))
    where r.batch_id = v_batch.id
      and r.source_row_number in (
        select pir.source_row_number from public.panitia_import_rows pir
        where pir.batch_id = v_batch.id
        group by pir.source_row_number having count(*) > 1
      );
  end if;

  if exists (
    select 1 from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id and pir.operation <> 'BLOCKED'
    group by pir.identity_key having count(*) > 1
  ) then
    update public.panitia_import_rows r
    set operation = 'BLOCKED',
        issues = r.issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'DUPLICATE_IDENTITY',
          'message', 'Identitas canonical muncul lebih dari sekali dalam file.'
        ))
    where r.batch_id = v_batch.id
      and r.identity_key in (
        select pir.identity_key from public.panitia_import_rows pir
        where pir.batch_id = v_batch.id and pir.operation <> 'BLOCKED'
        group by pir.identity_key having count(*) > 1
      );
  end if;

  if exists (
    select 1 from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id and pir.beneficiary_id is not null and pir.operation <> 'BLOCKED'
    group by pir.beneficiary_id having count(*) > 1
  ) then
    update public.panitia_import_rows r
    set operation = 'BLOCKED',
        issues = r.issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'DUPLICATE_BENEFICIARY',
          'message', 'Beberapa baris mengarah ke ID PENERIMA yang sama.'
        ))
    where r.batch_id = v_batch.id
      and r.beneficiary_id in (
        select pir.beneficiary_id from public.panitia_import_rows pir
        where pir.batch_id = v_batch.id and pir.beneficiary_id is not null and pir.operation <> 'BLOCKED'
        group by pir.beneficiary_id having count(*) > 1
      );
  end if;

  select
    count(*) filter (where pir.operation = 'INSERT'),
    count(*) filter (where pir.operation = 'UPDATE'),
    count(*) filter (where pir.operation = 'UNCHANGED'),
    count(*) filter (where pir.operation = 'BLOCKED'),
    count(*) filter (where exists (
      select 1 from jsonb_array_elements(pir.issues) i where i ->> 'severity' = 'WARNING'
    ))
  into v_insert_count, v_update_count, v_unchanged_count,
    v_blocked_count, v_warning_count
  from public.panitia_import_rows pir where pir.batch_id = v_batch.id;

  update public.panitia_import_batches pib set
    insert_count = v_insert_count,
    update_count = v_update_count,
    unchanged_count = v_unchanged_count,
    blocked_count = v_blocked_count,
    warning_count = v_warning_count
  where pib.id = v_batch.id returning * into v_batch;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (v_owner, 'CREATE_PANITIA_IMPORT_PREVIEW', 'panitia_import_batches', v_batch.id,
    jsonb_build_object('event_id', p_event_id, 'payload_hash', v_payload_hash,
      'row_count', v_batch.row_count, 'blocked_count', v_batch.blocked_count));

  return jsonb_build_object(
    'batch_id', v_batch.id, 'confirmation_key', v_batch.confirmation_key,
    'status', v_batch.status, 'expires_at', v_batch.expires_at,
    'row_count', v_batch.row_count, 'insert_count', v_batch.insert_count,
    'update_count', v_batch.update_count, 'unchanged_count', v_batch.unchanged_count,
    'blocked_count', v_batch.blocked_count, 'warning_count', v_batch.warning_count
  );
end;
$function$;

create or replace function public.confirm_panitia_import(
  p_batch_id uuid,
  p_confirmation_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_owner uuid := auth.uid();
  v_batch public.panitia_import_batches%rowtype;
  v_row public.panitia_import_rows%rowtype;
  v_beneficiary_id uuid;
  v_beneficiary_code text;
  v_slot_key text;
  v_slot jsonb;
  v_current_beneficiary_updated timestamptz;
  v_current_roster_updated timestamptz;
  v_result_count integer;
  v_changed integer := 0;
begin
  perform public.assert_consumption_role(array['ADMIN']);
  if v_owner is null then
    raise exception 'authenticated admin is required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('panitia-confirm:' || p_batch_id::text));

  select * into v_batch from public.panitia_import_batches pib
  where pib.id = p_batch_id for update;
  if not found then
    raise exception 'preview tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_batch.owner_id <> v_owner then
    raise exception 'preview bukan milik admin ini' using errcode = '42501';
  end if;
  if v_batch.confirmation_key <> p_confirmation_key then
    raise exception 'confirmation key salah' using errcode = '42501';
  end if;

  if v_batch.status = 'APPLIED' then
    select count(*) into v_result_count
    from public.panitia_import_results pir
    where pir.batch_id = v_batch.id;
    return jsonb_build_object('batch_id', v_batch.id, 'status', 'APPLIED',
      'applied_at', v_batch.applied_at, 'result_count', v_result_count,
      'insert_count', v_batch.insert_count, 'update_count', v_batch.update_count,
      'unchanged_count', v_batch.unchanged_count);
  end if;
  if v_batch.status <> 'PREVIEW' or v_batch.expires_at <= now() then
    raise exception 'preview kedaluwarsa' using errcode = 'P0001';
  end if;
  if encode(digest(v_batch.canonical_payload::text, 'sha256'), 'hex') <> v_batch.payload_hash then
    raise exception 'payload preview berubah' using errcode = 'P0001';
  end if;
  if v_batch.blocked_count > 0 or exists (
    select 1 from public.panitia_import_rows r, jsonb_array_elements(r.issues) i
    where r.batch_id = v_batch.id and i ->> 'severity' = 'BLOCKER'
  ) then
    raise exception 'preview memiliki blocker' using errcode = 'P0001';
  end if;

  -- Lock tabel menutup race dengan RPC penerbitan maupun insert entitlement
  -- langsung yang masih diizinkan oleh policy manager lama.
  lock table public.entitlements in share row exclusive mode;
  perform pg_advisory_xact_lock(hashtext('beneficiary-entitlement:' || v_batch.event_id::text));

  if (select count(*) from public.panitia_import_rows pir where pir.batch_id = v_batch.id) <> v_batch.row_count
    or (select count(*) from public.validate_panitia_import_payload(v_batch.event_id, v_batch.canonical_payload)) <> v_batch.row_count then
    raise exception 'preview row set berubah' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.panitia_import_rows saved
    left join public.validate_panitia_import_payload(v_batch.event_id, v_batch.canonical_payload) fresh
      on fresh.source_row_number = saved.source_row_number
    where saved.batch_id = v_batch.id
      and (fresh.source_row_number is null
        or saved.operation is distinct from fresh.operation
        or saved.beneficiary_id is distinct from fresh.beneficiary_id
        or saved.identity_key is distinct from fresh.identity_key
        or saved.proposed_data is distinct from fresh.proposed_data
        or saved.current_data is distinct from fresh.current_data
        or saved.beneficiary_updated_at_snapshot is distinct from fresh.beneficiary_updated_at_snapshot
        or saved.roster_updated_at_snapshot is distinct from fresh.roster_updated_at_snapshot
        or saved.issues is distinct from fresh.issues)
  ) then
    raise exception 'preview stale: hasil validasi berubah' using errcode = 'P0001';
  end if;

  for v_row in
    select * from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id order by pir.source_row_number
  loop
    if v_row.beneficiary_id is not null then
      select b.updated_at into v_current_beneficiary_updated
      from public.beneficiaries b
      where b.id = v_row.beneficiary_id and b.event_id = v_batch.event_id
      for update;
      if not found then
        raise exception 'preview stale pada baris %', v_row.source_row_number using errcode = 'P0001';
      end if;

      select re.updated_at into v_current_roster_updated
      from public.panitia_roster_entries re
      where re.beneficiary_id = v_row.beneficiary_id
      for update;

      if v_current_beneficiary_updated is distinct from v_row.beneficiary_updated_at_snapshot
        or v_current_roster_updated is distinct from v_row.roster_updated_at_snapshot
        or (v_row.current_data is not null and coalesce(
          (select jsonb_object_agg(rs.slot_key, jsonb_build_object('attendance', rs.attendance, 'activity', rs.activity))
           from public.panitia_roster_slots rs where rs.beneficiary_id = v_row.beneficiary_id),
          '{}'::jsonb
        ) is distinct from coalesce(v_row.current_data -> 'slots', '{}'::jsonb)) then
        raise exception 'preview stale pada baris %', v_row.source_row_number using errcode = 'P0001';
      end if;
    elsif exists (
      select 1 from public.beneficiaries b
      where b.event_id = v_batch.event_id
        and public.panitia_identity_key(b.name, b.pic_hbd, b.employee_group) = v_row.identity_key
    ) then
      raise exception 'preview stale: identitas baru sudah dipakai pada baris %', v_row.source_row_number using errcode = 'P0001';
    end if;
  end loop;

  for v_row in
    select * from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id order by pir.source_row_number
  loop
    if v_row.operation = 'INSERT' then
      v_beneficiary_id := gen_random_uuid();
      v_beneficiary_code := 'PAN-' || upper(substr(replace(v_beneficiary_id::text, '-', ''), 1, 12));
      insert into public.beneficiaries (
        id, event_id, beneficiary_code, name, beneficiary_type,
        beneficiary_category, quantity, origin, area_id, pic_hbd,
        employee_group, source_reference, is_active
      ) values (
        v_beneficiary_id, v_batch.event_id, v_beneficiary_code,
        trim(v_row.proposed_data ->> 'name'),
        case when (v_row.proposed_data ->> 'quantity')::integer = 1 then 'INDIVIDUAL' else 'GROUP' end,
        'COMMITTEE', (v_row.proposed_data ->> 'quantity')::integer,
        upper(v_row.proposed_data ->> 'origin'),
        nullif(v_row.proposed_data ->> 'area_id', '')::uuid,
        nullif(trim(v_row.proposed_data ->> 'pic_hbd'), ''),
        nullif(trim(v_row.proposed_data ->> 'employee_group'), ''),
        'PANITIA_CSV:' || v_row.source_row_number::text, true
      );
      v_changed := v_changed + 1;
    else
      v_beneficiary_id := v_row.beneficiary_id;
      select b.beneficiary_code into v_beneficiary_code
      from public.beneficiaries b
      where b.id = v_beneficiary_id;
      if v_row.operation = 'UPDATE' then
        update public.beneficiaries b set
          name = trim(v_row.proposed_data ->> 'name'),
          beneficiary_type = case when (v_row.proposed_data ->> 'quantity')::integer = 1 then 'INDIVIDUAL' else 'GROUP' end,
          beneficiary_category = 'COMMITTEE',
          quantity = (v_row.proposed_data ->> 'quantity')::integer,
          origin = upper(v_row.proposed_data ->> 'origin'),
          area_id = nullif(v_row.proposed_data ->> 'area_id', '')::uuid,
          pic_hbd = nullif(trim(v_row.proposed_data ->> 'pic_hbd'), ''),
          employee_group = nullif(trim(v_row.proposed_data ->> 'employee_group'), '')
        where b.id = v_beneficiary_id;
        -- is_active sengaja tidak diubah oleh impor roster.
        v_changed := v_changed + 1;
      end if;
    end if;

    if v_row.operation <> 'UNCHANGED' then
      insert into public.panitia_roster_entries (
        beneficiary_id, event_id, pickup_pic_name, pickup_whatsapp,
        meal_eligible, identity_key, source_row_number, last_import_batch_id
      ) values (
        v_beneficiary_id, v_batch.event_id,
        nullif(trim(v_row.proposed_data ->> 'pickup_pic_name'), ''),
        nullif(trim(v_row.proposed_data ->> 'pickup_whatsapp'), ''),
        (v_row.proposed_data ->> 'meal_eligible')::boolean,
        v_row.identity_key, v_row.source_row_number, v_batch.id
      ) on conflict (beneficiary_id) do update set
        pickup_pic_name = excluded.pickup_pic_name,
        pickup_whatsapp = excluded.pickup_whatsapp,
        meal_eligible = excluded.meal_eligible,
        identity_key = excluded.identity_key,
        source_row_number = excluded.source_row_number,
        last_import_batch_id = excluded.last_import_batch_id;

      foreach v_slot_key in array array[
        'h2_siang', 'h1_siang', 'h1_malam', 'h_pagi',
        'h_siang', 'h_malam', 'hplus1'
      ] loop
        v_slot := v_row.proposed_data -> 'slots' -> v_slot_key;
        insert into public.panitia_roster_slots (
          beneficiary_id, slot_key, attendance, activity, last_import_batch_id
        ) values (
          v_beneficiary_id, v_slot_key, v_slot ->> 'attendance',
          nullif(trim(v_slot ->> 'activity'), ''), v_batch.id
        ) on conflict (beneficiary_id, slot_key) do update set
          attendance = excluded.attendance,
          activity = excluded.activity,
          last_import_batch_id = excluded.last_import_batch_id;
      end loop;
    end if;

    insert into public.panitia_import_results (
      batch_id, import_row_id, beneficiary_id, beneficiary_code, operation
    ) values (v_batch.id, v_row.id, v_beneficiary_id, v_beneficiary_code, v_row.operation);
  end loop;

  update public.panitia_import_batches pib
  set status = 'APPLIED', applied_at = now()
  where pib.id = v_batch.id returning * into v_batch;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
  values (v_owner, 'CONFIRM_PANITIA_IMPORT', 'panitia_import_batches', v_batch.id,
    jsonb_build_object('event_id', v_batch.event_id, 'row_count', v_batch.row_count,
      'changed_count', v_changed, 'insert_count', v_batch.insert_count,
      'update_count', v_batch.update_count, 'unchanged_count', v_batch.unchanged_count));

  return jsonb_build_object('batch_id', v_batch.id, 'status', v_batch.status,
    'applied_at', v_batch.applied_at, 'result_count', v_batch.row_count,
    'insert_count', v_batch.insert_count, 'update_count', v_batch.update_count,
    'unchanged_count', v_batch.unchanged_count);
end;
$function$;

-- Menutup race antara validasi konflik roster dan penerbitan entitlement. Versi
-- ini mempertahankan kontrak RPC migrasi 006, tetapi mengambil lock event yang
-- sama dengan konfirmasi impor sebelum memilih penerima.
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
as $function$
declare
  v_slot public.consumption_slots%rowtype;
  v_item public.consumption_items%rowtype;
  v_matched integer;
  v_created integer;
begin
  perform public.assert_consumption_role(array['ADMIN', 'CONSUMPTION_MANAGER']);

  select * into v_slot
  from public.consumption_slots cs
  where cs.id = p_consumption_slot_id;
  if not found then
    raise exception 'slot tidak ditemukan' using errcode = 'P0002';
  end if;

  select * into v_item
  from public.consumption_items ci
  where ci.id = p_consumption_item_id;
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

  lock table public.entitlements in share row exclusive mode;
  perform pg_advisory_xact_lock(hashtext('beneficiary-entitlement:' || v_slot.event_id::text));
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
    event_id, beneficiary_id, consumption_item_id,
    consumption_slot_id, quantity, expires_at
  )
  select
    v_slot.event_id, b.id, v_item.id, v_slot.id,
    b.quantity, v_slot.pickup_deadline
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
    auth.uid(), 'GENERATE_ENTITLEMENTS', 'consumption_slots', v_slot.id,
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
$function$;

create or replace function public.latest_panitia_import(p_event_id uuid)
returns table (
  id uuid,
  csv_format text,
  row_count integer,
  insert_count integer,
  update_count integer,
  unchanged_count integer,
  applied_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $function$
  select
    pib.id, pib.csv_format, pib.row_count, pib.insert_count,
    pib.update_count, pib.unchanged_count, pib.applied_at
  from public.panitia_import_batches pib
  where pib.event_id = p_event_id
    and pib.status = 'APPLIED'
    and public.current_role_text() = 'ADMIN'
  order by pib.applied_at desc
  limit 1;
$function$;

alter table public.panitia_import_batches enable row level security;
alter table public.panitia_import_rows enable row level security;
alter table public.panitia_import_results enable row level security;
alter table public.panitia_roster_entries enable row level security;
alter table public.panitia_roster_slots enable row level security;

create policy panitia_import_batches_select_owner_admin
on public.panitia_import_batches for select to authenticated
using (owner_id = auth.uid() and public.current_role_text() = 'ADMIN');

create policy panitia_import_rows_select_owner_admin
on public.panitia_import_rows for select to authenticated
using (public.current_role_text() = 'ADMIN' and exists (
  select 1 from public.panitia_import_batches b
  where b.id = batch_id and b.owner_id = auth.uid()
));

create policy panitia_import_results_select_owner_admin
on public.panitia_import_results for select to authenticated
using (public.current_role_text() = 'ADMIN' and exists (
  select 1 from public.panitia_import_batches b
  where b.id = batch_id and b.owner_id = auth.uid()
));

create policy panitia_roster_entries_select_staff
on public.panitia_roster_entries for select to authenticated
using (public.current_staff_role() is not null);

create policy panitia_roster_slots_select_staff
on public.panitia_roster_slots for select to authenticated
using (public.current_staff_role() is not null);

-- Tidak ada policy insert/update/delete: mutasi roster dan metadata impor hanya RPC.
revoke all on function public.panitia_identity_key(text, text, text) from public;
revoke all on function public.validate_panitia_import_payload(uuid, jsonb) from public;
revoke all on function public.create_panitia_import_preview(uuid, text, text, jsonb) from public;
revoke all on function public.confirm_panitia_import(uuid, uuid) from public;
revoke all on function public.latest_panitia_import(uuid) from public;
grant execute on function public.create_panitia_import_preview(uuid, text, text, jsonb) to authenticated;
grant execute on function public.confirm_panitia_import(uuid, uuid) to authenticated;
grant execute on function public.latest_panitia_import(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'panitia_import_batches', 'panitia_import_rows', 'panitia_import_results',
    'panitia_roster_entries', 'panitia_roster_slots', 'panitia_roster_overview'
  ] loop
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

revoke all on table public.panitia_import_batches from authenticated;
revoke all on table public.panitia_import_rows from authenticated;
revoke all on table public.panitia_import_results from authenticated;
revoke all on table public.panitia_roster_entries from authenticated;
revoke all on table public.panitia_roster_slots from authenticated;
revoke all on table public.panitia_roster_overview from authenticated;
grant select on table public.panitia_import_batches to authenticated;
grant select on table public.panitia_import_rows to authenticated;
grant select on table public.panitia_import_results to authenticated;
grant select on table public.panitia_roster_entries to authenticated;
grant select on table public.panitia_roster_slots to authenticated;
grant select on table public.panitia_roster_overview to authenticated;

comment on function public.create_panitia_import_preview(uuid, text, text, jsonb) is
  'Admin-only: validasi dan simpan preview impor roster selama 24 jam.';
comment on function public.confirm_panitia_import(uuid, uuid) is
  'Admin-only: konfirmasi atomik dan idempoten atas preview roster yang belum stale.';
