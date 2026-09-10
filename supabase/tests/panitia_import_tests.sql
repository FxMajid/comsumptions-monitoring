\set ON_ERROR_STOP on

begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_absent uuid := gen_random_uuid();
  v_payload jsonb;
  v_preview jsonb;
  v_applied jsonb;
  v_batch uuid;
  v_key uuid;
  v_inserted uuid;
  v_count integer;
  v_before_entitlements bigint;
  v_before_tokens bigint;
  v_before_inventory bigint;
  v_before_expenses bigint;
begin
  insert into auth.users (id, email) values (v_user, 'panitia-import-test@example.invalid');
  insert into public.profiles (id, email, full_name, role)
  values (v_user, 'panitia-import-test@example.invalid', 'Import Admin', 'ADMIN');
  insert into public.events (id, code, name, status, event_date)
  values (v_event, 'TEST-IMP-' || replace(v_event::text, '-', ''), 'Test Import Panitia', 'inactive', '2026-11-21');
  insert into public.beneficiaries (
    id, event_id, beneficiary_code, name, beneficiary_type,
    beneficiary_category, quantity, origin, is_active
  ) values (
    v_absent, v_event, 'ABSENT-1', 'Tidak Ada di CSV', 'INDIVIDUAL',
    'COMMITTEE', 1, 'INTERNAL', true
  );

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_payload := jsonb_build_array(jsonb_build_object(
    'source_row_number', 4, 'name', 'Rombongan Test', 'pic_hbd', 'PIC TEST',
    'employee_group', 'MAIN DEALER', 'quantity', 3, 'origin', 'INTERNAL',
    'area', null, 'pickup_pic_name', 'Pengambil Test',
    'pickup_whatsapp', '628123456789', 'meal_eligible', true,
    'slots', jsonb_build_object(
      'h2_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', 'Muat'),
      'h1_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h1_malam', jsonb_build_object('attendance', 'ABSENT', 'activity', null),
      'h_pagi', jsonb_build_object('attendance', 'UNKNOWN', 'activity', null),
      'h_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h_malam', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'hplus1', jsonb_build_object('attendance', 'ABSENT', 'activity', null)
    )
  ));

  select count(*) into v_before_entitlements from public.entitlements;
  select count(*) into v_before_tokens from public.beneficiary_access_tokens;
  select count(*) into v_before_inventory from public.inventory_transactions;
  select count(*) into v_before_expenses from public.expenses;

  v_preview := public.create_panitia_import_preview(
    v_event, encode(digest('test-file', 'sha256'), 'hex'), 'CANONICAL', v_payload
  );
  v_batch := (v_preview ->> 'batch_id')::uuid;
  v_key := (v_preview ->> 'confirmation_key')::uuid;

  if (v_preview ->> 'insert_count')::integer <> 1
    or (v_preview ->> 'blocked_count')::integer <> 0 then
    raise exception 'TEST 1 failed: insert preview counts incorrect: %', v_preview;
  end if;

  v_applied := public.confirm_panitia_import(v_batch, v_key);
  if v_applied ->> 'status' <> 'APPLIED' then
    raise exception 'TEST 2 failed: confirmation was not applied';
  end if;

  select beneficiary_id into v_inserted
  from public.panitia_import_results where batch_id = v_batch;

  if (select beneficiary_type from public.beneficiaries where id = v_inserted) <> 'GROUP'
    or (select quantity from public.beneficiaries where id = v_inserted) <> 3 then
    raise exception 'TEST 2 failed: Qty > 1 was not one GROUP beneficiary';
  end if;

  select count(*) into v_count from public.panitia_roster_slots where beneficiary_id = v_inserted;
  if v_count <> 7 then
    raise exception 'TEST 2 failed: expected seven roster slots, got %', v_count;
  end if;

  if not (select is_active from public.beneficiaries where id = v_absent) then
    raise exception 'TEST 3 failed: absent beneficiary was changed';
  end if;

  if public.confirm_panitia_import(v_batch, v_key) ->> 'status' <> 'APPLIED'
    or (select count(*) from public.panitia_import_results where batch_id = v_batch) <> 1 then
    raise exception 'TEST 4 failed: double submit was not idempotent';
  end if;

  if (select count(*) from public.entitlements) <> v_before_entitlements
    or (select count(*) from public.beneficiary_access_tokens) <> v_before_tokens
    or (select count(*) from public.inventory_transactions) <> v_before_inventory
    or (select count(*) from public.expenses) <> v_before_expenses then
    raise exception 'TEST 5 failed: import mutated entitlement/token/stock/money tables';
  end if;

  raise notice 'Panitia import apply tests passed.';
end $$;


do $$
declare
  v_event uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_existing uuid := gen_random_uuid();
  v_payload jsonb;
  v_preview jsonb;
  v_applied jsonb;
  v_batch uuid;
  v_key uuid;
  v_area uuid;
  v_second_area uuid;
  v_forced_beneficiary uuid;
  v_count integer;
  v_failed boolean := false;
  v_base_row jsonb;
begin
  insert into auth.users (id, email)
  values (v_user, 'panitia-area-import-test@example.invalid');
  insert into public.profiles (id, email, full_name, role)
  values (v_user, 'panitia-area-import-test@example.invalid', 'Area Import Admin', 'ADMIN');
  insert into public.events (id, code, name, status, event_date)
  values (
    v_event, 'TEST-AREA-' || replace(v_event::text, '-', ''),
    'Test Auto Area Panitia', 'inactive', '2026-11-22'
  );
  insert into public.beneficiaries(
    id, event_id, beneficiary_code, name, beneficiary_type,
    beneficiary_category, quantity, origin, area_id, pic_hbd,
    employee_group, is_active
  ) values (
    v_existing, v_event, 'AREA-EXISTING', 'Panitia Area Existing Null',
    'INDIVIDUAL', 'COMMITTEE', 1, 'INTERNAL', null, 'PIC AREA',
    'MAIN DEALER', true
  );

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  v_base_row := jsonb_build_object(
    'pic_hbd', 'PIC AREA', 'employee_group', 'MAIN DEALER',
    'quantity', 1, 'origin', 'INTERNAL',
    'pickup_pic_name', 'Pengambil Area',
    'pickup_whatsapp', '628123456789', 'meal_eligible', true,
    'slots', jsonb_build_object(
      'h2_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h1_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h1_malam', jsonb_build_object('attendance', 'ABSENT', 'activity', null),
      'h_pagi', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h_siang', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'h_malam', jsonb_build_object('attendance', 'PRESENT', 'activity', null),
      'hplus1', jsonb_build_object('attendance', 'ABSENT', 'activity', null)
    )
  );

  v_payload := jsonb_build_array(
    v_base_row || jsonb_build_object(
      'source_row_number', 2, 'name', 'Panitia Area Satu', 'area', '  Second   Stage '
    ),
    v_base_row || jsonb_build_object(
      'source_row_number', 3, 'name', 'Panitia Area Dua', 'area', 'second stage'
    ),
    v_base_row || jsonb_build_object(
      'source_row_number', 4, 'beneficiary_id', v_existing,
      'name', 'Panitia Area Existing Null', 'area', 'SECOND STAGE'
    )
  );

  v_preview := public.create_panitia_import_preview(
    v_event, encode(digest('area-new-file', 'sha256'), 'hex'), 'CANONICAL', v_payload
  );
  v_batch := (v_preview ->> 'batch_id')::uuid;
  v_key := (v_preview ->> 'confirmation_key')::uuid;

  if (v_preview ->> 'blocked_count')::integer <> 0
    or (v_preview ->> 'warning_count')::integer <> 3
    or (v_preview ->> 'update_count')::integer <> 1 then
    raise exception 'AREA TEST 1 failed: expected warnings without blockers: %', v_preview;
  end if;
  if exists (select 1 from public.areas where event_id = v_event) then
    raise exception 'AREA TEST 1 failed: preview inserted an area';
  end if;
  if (select count(*) from public.panitia_import_rows r, jsonb_array_elements(r.issues) i
      where r.batch_id = v_batch and i ->> 'code' = 'AREA_WILL_BE_CREATED') <> 3 then
    raise exception 'AREA TEST 1 failed: warning details were not persisted';
  end if;

  v_applied := public.confirm_panitia_import(v_batch, v_key);
  if v_applied ->> 'status' <> 'APPLIED' then
    raise exception 'AREA TEST 2 failed: confirmation was not applied';
  end if;
  select count(*), (array_agg(id order by id))[1] into v_count, v_area
  from public.areas where event_id = v_event;
  if v_count <> 1 then
    raise exception 'AREA TEST 2 failed: repeated labels created % areas', v_count;
  end if;
  if (select count(*) from public.beneficiaries b
      where b.event_id = v_event and b.area_id = v_area) <> 3 then
    raise exception 'AREA TEST 2 failed: beneficiaries did not reuse new area';
  end if;
  if public.confirm_panitia_import(v_batch, v_key) ->> 'status' <> 'APPLIED'
    or (select count(*) from public.areas where event_id = v_event) <> 1 then
    raise exception 'AREA TEST 3 failed: double confirmation created another area';
  end if;

  v_payload := jsonb_build_array(
    v_base_row || jsonb_build_object(
      'source_row_number', 4, 'name', 'Panitia Area Existing', 'area', 'SECOND STAGE'
    )
  );
  v_preview := public.create_panitia_import_preview(
    v_event, encode(digest('area-existing-file', 'sha256'), 'hex'), 'CANONICAL', v_payload
  );
  if (v_preview ->> 'warning_count')::integer <> 0
    or (v_preview ->> 'blocked_count')::integer <> 0 then
    raise exception 'AREA TEST 4 failed: case-insensitive existing area was not reused: %', v_preview;
  end if;
  v_applied := public.confirm_panitia_import(
    (v_preview ->> 'batch_id')::uuid,
    (v_preview ->> 'confirmation_key')::uuid
  );
  select b.area_id into v_second_area
  from public.beneficiaries b
  where b.event_id = v_event and b.name = 'Panitia Area Existing';
  if v_second_area is distinct from v_area
    or (select count(*) from public.areas where event_id = v_event) <> 1 then
    raise exception 'AREA TEST 4 failed: existing area was not reused';
  end if;

  insert into public.areas(event_id, code, name, area_type)
  values (v_event, 'SECOND_STAGE_ALT', 'Second Stage', 'AREA');
  v_payload := jsonb_build_array(
    v_base_row || jsonb_build_object(
      'source_row_number', 5, 'name', 'Panitia Area Ambigu', 'area', 'Second Stage'
    )
  );
  v_preview := public.create_panitia_import_preview(
    v_event, encode(digest('area-ambiguous-file', 'sha256'), 'hex'), 'CANONICAL', v_payload
  );
  if (v_preview ->> 'blocked_count')::integer <> 1 then
    raise exception 'AREA TEST 5 failed: ambiguous area did not block: %', v_preview;
  end if;

  v_payload := jsonb_build_array(
    v_base_row || jsonb_build_object(
      'source_row_number', 6, 'name', 'Panitia Rollback Area', 'area', 'Rollback Zone'
    )
  );
  v_preview := public.create_panitia_import_preview(
    v_event, encode(digest('area-rollback-file', 'sha256'), 'hex'), 'CANONICAL', v_payload
  );
  v_batch := (v_preview ->> 'batch_id')::uuid;
  v_key := (v_preview ->> 'confirmation_key')::uuid;
  -- Force a failure after area creation by colliding with the deferred result
  -- constraint; the subtransaction must roll back area and roster writes together.
  insert into public.beneficiaries(
    id, event_id, beneficiary_code, name, beneficiary_type,
    beneficiary_category, quantity, origin, is_active
  ) values (
    gen_random_uuid(), v_event, 'FORCED-CONFLICT', 'Forced Conflict',
    'INDIVIDUAL', 'COMMITTEE', 1, 'INTERNAL', true
  ) returning id into v_forced_beneficiary;
  insert into public.panitia_import_results(
    batch_id, import_row_id, beneficiary_id, beneficiary_code, operation
  )
  select v_batch, r.id, v_forced_beneficiary, 'FORCED-CONFLICT', 'INSERT'
  from public.panitia_import_rows r where r.batch_id = v_batch;
  begin
    perform public.confirm_panitia_import(v_batch, v_key);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'AREA TEST 6 failed: forced confirmation did not fail';
  end if;
  if exists (
    select 1 from public.areas a
    where a.event_id = v_event and public.panitia_area_key(a.name) = 'rollback zone'
  ) then
    raise exception 'AREA TEST 6 failed: failed confirmation kept the new area';
  end if;
  if exists (
    select 1 from public.beneficiaries b
    where b.event_id = v_event and b.name = 'Panitia Rollback Area'
  ) or exists (
    select 1 from public.panitia_roster_entries re
    join public.beneficiaries b on b.id = re.beneficiary_id
    where b.event_id = v_event and b.name = 'Panitia Rollback Area'
  ) then
    raise exception 'AREA TEST 6 failed: failed confirmation kept roster writes';
  end if;
  if (select status from public.panitia_import_batches where id = v_batch) <> 'PREVIEW'
    or not exists (
      select 1 from public.panitia_import_rows r
      where r.batch_id = v_batch
        and coalesce((r.proposed_data ->> 'area_pending_create')::boolean, false)
        and nullif(r.proposed_data ->> 'area_id', '') is null
    ) then
    raise exception 'AREA TEST 6 failed: failed confirmation changed preview state';
  end if;
  if exists (
    select 1 from public.audit_logs al
    where al.action = 'AUTO_CREATE_PANITIA_AREA'
      and al.new_value ->> 'batch_id' = v_batch::text
  ) then
    raise exception 'AREA TEST 6 failed: failed confirmation kept the area audit';
  end if;

  raise notice 'Panitia automatic area tests passed.';
end $$;

do $$
declare
  v_blocked boolean := false;
begin
  begin
    set local role anon;
    perform 1 from public.panitia_import_batches limit 1;
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'TEST 6 failed: anon can read import batches';
  end if;

  v_blocked := false;
  begin
    set local role anon;
    perform public.create_panitia_import_preview(
      gen_random_uuid(), repeat('a', 64), 'CANONICAL', '[]'::jsonb
    );
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  if not v_blocked then
    raise exception 'TEST 6 failed: anon can execute preview RPC';
  end if;

  raise notice 'Panitia import grant tests passed.';
end $$;

rollback;