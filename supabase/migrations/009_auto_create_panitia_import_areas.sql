-- Allow unknown roster areas to be previewed and created atomically on confirmation.

create or replace function public.panitia_area_key(p_value text)
returns text
language sql
immutable
set search_path = public
as $function$
  select nullif(lower(regexp_replace(btrim(coalesce(p_value, '')), '[[:space:]]+', ' ', 'g')), '')
$function$;

create or replace function public.panitia_import_area_code(p_event_id uuid, p_area_key text)
returns text
language sql
immutable
set search_path = public
as $function$
  select 'AREA_' || upper(substr(public.panitia_payload_sha256(
    jsonb_build_object('event_id', p_event_id, 'area_key', p_area_key)
  ), 1, 27))
$function$;

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
  v_area_label text;
  v_area_key text;
  v_area_code text;
  v_area_pending_create boolean;
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
    v_area_label := null;
    v_area_key := null;
    v_area_code := null;
    v_area_pending_create := false;
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

    v_area_input := nullif(regexp_replace(trim(v_row ->> 'area'), '[[:space:]]+', ' ', 'g'), '');
    v_area_label := v_area_input;
    v_area_key := public.panitia_area_key(v_area_input);
    if v_area_input is not null then
      if length(v_area_input) > 120 then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'severity', 'BLOCKER', 'code', 'INVALID_AREA_LABEL',
          'message', 'Nama area maksimal 120 karakter.'
        ));
      else
        select count(*), (array_agg(a.id order by a.id))[1]
        into v_match_count, v_area_id
        from public.areas a
        where a.event_id = p_event_id
          and (
            public.panitia_area_key(a.code) = v_area_key
            or public.panitia_area_key(a.name) = v_area_key
          );

        if v_match_count = 0 then
          v_area_pending_create := true;
          v_area_code := public.panitia_import_area_code(p_event_id, v_area_key);
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'severity', 'WARNING', 'code', 'AREA_WILL_BE_CREATED',
            'message', format('Area "%s" belum ada dan akan dibuat saat impor dikonfirmasi.', v_area_label)
          ));
        elsif v_match_count > 1 then
          v_area_id := null;
          v_issues := v_issues || jsonb_build_array(jsonb_build_object(
            'severity', 'BLOCKER', 'code', 'AREA_AMBIGUOUS',
            'message', format('Area "%s" cocok dengan lebih dari satu master area.', v_area_label)
          ));
        end if;
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
      or v_area_pending_create
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
      and not v_area_pending_create
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
    proposed_data := v_row || jsonb_build_object(
      'area_id', v_area_id,
      'area_label', v_area_label,
      'area_key', v_area_key,
      'area_code', v_area_code,
      'area_pending_create', v_area_pending_create,
      'identity_key', v_identity
    );
    current_data := v_current;
    beneficiary_updated_at_snapshot := v_beneficiary.updated_at;
    roster_updated_at_snapshot := v_roster.updated_at;
    issues := v_issues;
    return next;
  end loop;
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
  v_area_plan record;
  v_area_id uuid;
  v_area_match_count integer;
  v_area_existing_code text;
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
  if public.panitia_payload_sha256(v_batch.canonical_payload) <> v_batch.payload_hash then
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

  -- Serialisasi perubahan master area dan tutup race dengan penulisan area biasa.
  perform pg_advisory_xact_lock(hashtext('panitia-area:' || v_batch.event_id::text));
  lock table public.areas in share row exclusive mode;

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

  -- Area baru dibuat hanya setelah payload dan snapshot lolos seluruh stale check.
  -- Semua baris dengan key yang sama memakai satu UUID area dalam transaksi ini.
  for v_area_plan in
    select distinct on (pir.proposed_data ->> 'area_key')
      pir.proposed_data ->> 'area_key' as area_key,
      pir.proposed_data ->> 'area_label' as area_label,
      pir.proposed_data ->> 'area_code' as area_code
    from public.panitia_import_rows pir
    where pir.batch_id = v_batch.id
      and coalesce((pir.proposed_data ->> 'area_pending_create')::boolean, false)
    order by pir.proposed_data ->> 'area_key', pir.source_row_number
  loop
    if nullif(v_area_plan.area_key, '') is null
      or nullif(v_area_plan.area_label, '') is null
      or v_area_plan.area_code !~ '^[A-Z0-9_]{1,32}$' then
      raise exception 'metadata area baru tidak valid' using errcode = 'P0001';
    end if;

    select count(*), (array_agg(a.id order by a.id))[1],
      (array_agg(a.code order by a.id))[1]
    into v_area_match_count, v_area_id, v_area_existing_code
    from public.areas a
    where a.event_id = v_batch.event_id
      and (
        public.panitia_area_key(a.code) = v_area_plan.area_key
        or public.panitia_area_key(a.name) = v_area_plan.area_key
      );

    if v_area_match_count > 1 then
      raise exception 'area menjadi ambigu setelah preview: %', v_area_plan.area_label
        using errcode = 'P0001';
    elsif v_area_match_count = 0 then
      if exists (
        select 1 from public.areas a
        where a.event_id = v_batch.event_id
          and lower(a.code) = lower(v_area_plan.area_code)
      ) then
        raise exception 'kode area otomatis bertabrakan: %', v_area_plan.area_code
          using errcode = 'P0001';
      end if;

      insert into public.areas(event_id, code, name, area_type, is_active)
      values (
        v_batch.event_id, v_area_plan.area_code,
        v_area_plan.area_label, 'AREA', true
      ) returning id, code into v_area_id, v_area_existing_code;

      insert into public.audit_logs(user_id, action, entity_type, entity_id, new_value)
      values (
        v_owner, 'AUTO_CREATE_PANITIA_AREA', 'areas', v_area_id,
        jsonb_build_object(
          'event_id', v_batch.event_id,
          'batch_id', v_batch.id,
          'code', v_area_existing_code,
          'name', v_area_plan.area_label
        )
      );
    end if;

    update public.panitia_import_rows pir
    set proposed_data = pir.proposed_data || jsonb_build_object(
      'area_id', v_area_id,
      'area_code', v_area_existing_code,
      'area_pending_create', false
    )
    where pir.batch_id = v_batch.id
      and pir.proposed_data ->> 'area_key' = v_area_plan.area_key;
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

revoke all on function public.panitia_area_key(text) from public, anon;
revoke all on function public.panitia_import_area_code(uuid, text) from public, anon;
revoke all on function public.validate_panitia_import_payload(uuid, jsonb) from public, anon;
revoke all on function public.confirm_panitia_import(uuid, uuid) from public, anon;
grant execute on function public.confirm_panitia_import(uuid, uuid) to authenticated;

comment on function public.panitia_area_key(text) is
  'Normalizes imported area labels for deterministic case-insensitive matching.';
comment on function public.panitia_import_area_code(uuid, text) is
  'Builds a deterministic collision-checked code for an imported area.';
comment on function public.confirm_panitia_import(uuid, uuid) is
  'Atomically confirms a roster preview and creates any planned area masters.';
