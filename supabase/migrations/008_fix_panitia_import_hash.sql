-- Make pgcrypto resolution explicit for security-definer import RPCs.

create or replace function public.panitia_payload_sha256(p_payload jsonb)
returns text
language sql
immutable
set search_path = public, extensions
as $function$
  select encode(digest(p_payload::text, 'sha256'), 'hex')
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

  v_payload_hash := public.panitia_payload_sha256(p_rows);
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

revoke all on function public.panitia_payload_sha256(jsonb) from public, anon;
revoke all on function public.create_panitia_import_preview(uuid, text, text, jsonb) from public, anon;
revoke all on function public.confirm_panitia_import(uuid, uuid) from public, anon;
grant execute on function public.create_panitia_import_preview(uuid, text, text, jsonb) to authenticated;
grant execute on function public.confirm_panitia_import(uuid, uuid) to authenticated;
