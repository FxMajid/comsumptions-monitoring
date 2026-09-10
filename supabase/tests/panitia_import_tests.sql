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