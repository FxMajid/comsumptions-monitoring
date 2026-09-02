\set ON_ERROR_STOP on

begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_area uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_snack uuid := gen_random_uuid();
  v_slot uuid := gen_random_uuid();
  v_closed_slot uuid := gen_random_uuid();
  v_location uuid := gen_random_uuid();
  v_group uuid := gen_random_uuid();
  v_individual uuid := gen_random_uuid();
  v_inactive uuid := gen_random_uuid();
  v_entitlement uuid;
  v_other_entitlement uuid;
  v_result jsonb;
  v_count integer;
  v_qty integer;
  v_status text;
  v_expires timestamptz;
  v_deadline timestamptz := now() + interval '2 days';
  v_token text := md5('token-a') || md5('token-a2');
  v_other_token text := md5('token-b') || md5('token-b2');
  v_revoked_token text := md5('token-c') || md5('token-c2');
  v_expired_token text := md5('token-d') || md5('token-d2');
  v_failed boolean;
begin
  insert into public.events (id, code, name, status, event_date)
  values (v_event, 'TEST-PICKUP-' || replace(v_event::text, '-', ''), 'Test Pengambilan', 'inactive', '2026-11-21');

  insert into public.areas (id, event_id, code, name, area_type)
  values (v_area, v_event, 'MAIN', 'Panggung Utama', 'AREA');

  insert into public.consumption_items (id, event_id, code, name, item_type, unit_of_measure)
  values
    (v_item, v_event, 'NASI', 'Nasi Box', 'MEAL', 'BOX'),
    (v_snack, v_event, 'SNACK', 'Snack Box', 'SNACK', 'BOX');

  insert into public.inventory_locations (id, event_id, code, name, location_type)
  values (v_location, v_event, 'POS-1', 'Pos Ambil 1', 'PICKUP_POINT');

  insert into public.consumption_slots (id, event_id, code, name, slot_date, starts_at, ends_at, pickup_deadline, status)
  values (v_slot, v_event, 'H_SIANG', 'H Siang', '2026-11-21', '11:00', '13:00', v_deadline, 'OPEN');

  insert into public.consumption_slots (id, event_id, code, name, slot_date, status)
  values (v_closed_slot, v_event, 'H_PAGI', 'H Pagi', '2026-11-21', 'DRAFT');
  update public.consumption_slots set status = 'CANCELLED' where id = v_closed_slot;

  insert into public.beneficiaries (id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity, area_id)
  values
    (v_group, v_event, 'GRP-1', 'Tim Teknis', 'GROUP', 'COMMITTEE', 12, v_area),
    (v_individual, v_event, 'IND-1', 'Rider Undangan', 'INDIVIDUAL', 'PARTICIPANT', 1, v_area);

  insert into public.beneficiaries (id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity, is_active)
  values (v_inactive, v_event, 'IND-OFF', 'Panitia Batal', 'INDIVIDUAL', 'COMMITTEE', 1, false);

  ----------------------------------------------------------------------------
  -- TEST 1: penerbitan massal mengikuti kuantitas penerima dan batas ambil slot
  ----------------------------------------------------------------------------
  v_result := public.generate_entitlements(v_slot, v_item);

  if (v_result ->> 'matched')::integer <> 2 then
    raise exception 'TEST 1 failed: matched seharusnya 2, dapat %', v_result ->> 'matched';
  end if;

  if (v_result ->> 'created')::integer <> 2 then
    raise exception 'TEST 1 failed: created seharusnya 2, dapat %', v_result ->> 'created';
  end if;

  select id, quantity, expires_at into v_entitlement, v_qty, v_expires
  from public.entitlements
  where consumption_slot_id = v_slot and beneficiary_id = v_group;

  if v_qty <> 12 then
    raise exception 'TEST 1 failed: kuantitas grup seharusnya 12, dapat %', v_qty;
  end if;

  if v_expires is distinct from v_deadline then
    raise exception 'TEST 1 failed: expires_at seharusnya mengikuti pickup_deadline slot';
  end if;

  if exists (
    select 1 from public.entitlements
    where consumption_slot_id = v_slot and beneficiary_id = v_inactive
  ) then
    raise exception 'TEST 1 failed: penerima nonaktif seharusnya tidak dapat hak konsumsi';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 2: penerbitan ulang tidak menggandakan
  ----------------------------------------------------------------------------
  v_result := public.generate_entitlements(v_slot, v_item);

  if (v_result ->> 'created')::integer <> 0 then
    raise exception 'TEST 2 failed: penerbitan ulang seharusnya tidak membuat baris baru, dapat %', v_result ->> 'created';
  end if;

  select count(*) into v_count
  from public.entitlements
  where consumption_slot_id = v_slot and consumption_item_id = v_item;

  if v_count <> 2 then
    raise exception 'TEST 2 failed: total hak konsumsi seharusnya tetap 2, dapat %', v_count;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 3: filter kategori mempersempit penerima
  ----------------------------------------------------------------------------
  v_result := public.generate_entitlements(v_slot, v_snack, array['PARTICIPANT']);

  if (v_result ->> 'created')::integer <> 1 then
    raise exception 'TEST 3 failed: filter PARTICIPANT seharusnya menerbitkan 1, dapat %', v_result ->> 'created';
  end if;

  if exists (
    select 1 from public.entitlements
    where consumption_slot_id = v_slot
      and consumption_item_id = v_snack
      and beneficiary_id = v_group
  ) then
    raise exception 'TEST 3 failed: penerima COMMITTEE seharusnya tidak ikut terbit';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 4: slot yang dibatalkan menolak penerbitan
  ----------------------------------------------------------------------------
  v_failed := false;
  begin
    perform public.generate_entitlements(v_closed_slot, v_item);
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 4 failed: slot CANCELLED seharusnya menolak penerbitan';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 5: token hidup terpakai, token cabut/kedaluwarsa/asing tidak
  ----------------------------------------------------------------------------
  insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, expires_at)
  values (v_event, v_group, v_token, now() + interval '2 days');

  insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, expires_at)
  values (v_event, v_individual, v_other_token, now() + interval '2 days');

  insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, expires_at, revoked_at)
  values (v_event, v_group, v_revoked_token, now() + interval '2 days', now());

  insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, created_at, expires_at, revoked_at)
  values (v_event, v_group, v_expired_token, now() - interval '3 days', now() - interval '1 day', now());

  select count(*) into v_count from public.resolve_claim_token(v_token);
  if v_count <> 1 then
    raise exception 'TEST 5 failed: token hidup seharusnya mengembalikan 1 baris, dapat %', v_count;
  end if;

  select count(*) into v_count from public.resolve_claim_token(v_revoked_token);
  if v_count <> 0 then
    raise exception 'TEST 5 failed: token yang dicabut seharusnya tidak mengembalikan apa pun';
  end if;

  select count(*) into v_count from public.resolve_claim_token(v_expired_token);
  if v_count <> 0 then
    raise exception 'TEST 5 failed: token kedaluwarsa seharusnya tidak mengembalikan apa pun';
  end if;

  select count(*) into v_count from public.resolve_claim_token(md5('asing') || md5('asing2'));
  if v_count <> 0 then
    raise exception 'TEST 5 failed: token asing seharusnya tidak mengembalikan apa pun';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 6: satu token hanya membuka hak konsumsi pemiliknya
  ----------------------------------------------------------------------------
  select id into v_other_entitlement
  from public.entitlements
  where consumption_slot_id = v_slot
    and consumption_item_id = v_item
    and beneficiary_id = v_individual;

  select count(*) into v_count from public.get_claim_entitlements(v_token);
  if v_count <> 1 then
    raise exception 'TEST 6 failed: pemegang token grup seharusnya melihat 1 hak konsumsi, dapat %', v_count;
  end if;

  if exists (
    select 1 from public.get_claim_entitlements(v_token) g
    where g.entitlement_id = v_other_entitlement
  ) then
    raise exception 'TEST 6 failed: token grup membocorkan hak konsumsi penerima lain';
  end if;

  select count(*) into v_count from public.get_claim_entitlements(v_other_token);
  if v_count <> 2 then
    raise exception 'TEST 6 failed: penerima individu seharusnya punya 2 hak konsumsi, dapat %', v_count;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 7: angka view mengikuti pengambilan yang sebenarnya
  ----------------------------------------------------------------------------
  insert into public.inventory_transactions (
    event_id, consumption_item_id, consumption_slot_id, inventory_location_id,
    quantity, transaction_type, reference_type
  )
  values (v_event, v_item, v_slot, v_location, 20, 'RECEIVING', 'MANUAL');

  perform public.pickup_entitlement(v_entitlement, v_location, 5, 'test-pickup-' || v_entitlement::text);

  select remaining_quantity, picked_quantity, status
  into v_qty, v_count, v_status
  from public.entitlement_overview
  where entitlement_id = v_entitlement;

  if v_count <> 5 or v_qty <> 7 or v_status <> 'PARTIALLY_PICKED' then
    raise exception 'TEST 7 failed: setelah ambil 5 dari 12 seharusnya picked 5 / sisa 7 / PARTIALLY_PICKED, dapat % / % / %',
      v_count, v_qty, v_status;
  end if;

  select remaining_quantity into v_qty
  from public.get_claim_entitlements(v_token)
  limit 1;

  if v_qty <> 7 then
    raise exception 'TEST 7 failed: halaman peserta seharusnya ikut melihat sisa 7, dapat %', v_qty;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 8: hanya satu token hidup per penerima
  ----------------------------------------------------------------------------
  v_failed := false;
  begin
    insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, expires_at)
    values (v_event, v_group, md5('kedua') || md5('kedua2'), now() + interval '2 days');
  exception when unique_violation then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 8 failed: token hidup kedua untuk penerima yang sama seharusnya ditolak';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 9: bentuk hash dijaga constraint
  ----------------------------------------------------------------------------
  v_failed := false;
  begin
    insert into public.beneficiary_access_tokens (event_id, beneficiary_id, token_hash, expires_at)
    values (v_event, v_individual, 'bukan-hash', now() + interval '2 days');
  exception when check_violation then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 9 failed: token_hash bukan sha256 hex seharusnya ditolak';
  end if;

  raise notice 'Pickup access database tests passed.';
end $$;

-- Blok kedua: hak akses `anon`. Peserta tanpa akun hanya boleh lewat RPC
-- bertoken, tidak boleh menyentuh tabel atau view apa pun secara langsung.
do $$
declare
  v_blocked boolean := false;
  v_allowed boolean := false;
begin
  begin
    set local role anon;
    perform 1 from public.beneficiary_access_tokens limit 1;
  exception when insufficient_privilege then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked then
    raise exception 'TEST 10 failed: anon seharusnya tidak bisa membaca beneficiary_access_tokens';
  end if;

  v_blocked := false;

  begin
    set local role anon;
    perform 1 from public.entitlement_overview limit 1;
  exception when insufficient_privilege then
    v_blocked := true;
  end;

  reset role;

  if not v_blocked then
    raise exception 'TEST 10 failed: anon seharusnya tidak bisa membaca entitlement_overview';
  end if;

  begin
    set local role anon;
    perform 1 from public.resolve_claim_token(md5('x') || md5('y'));
    v_allowed := true;
  exception when insufficient_privilege then
    v_allowed := false;
  end;

  reset role;

  if not v_allowed then
    raise exception 'TEST 10 failed: anon seharusnya boleh memanggil resolve_claim_token';
  end if;

  raise notice 'Pickup access grant tests passed.';
end $$;

rollback;
