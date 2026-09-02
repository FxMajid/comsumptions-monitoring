\set ON_ERROR_STOP on

begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_slot uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
  v_central uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_request_item uuid := gen_random_uuid();
  v_beneficiary uuid := gen_random_uuid();
  v_failed boolean;
  v_status text;
  v_plan_count integer;
  v_planned_qty integer;
  v_entitlement_qty integer;
  v_requested_qty integer;
  v_received_qty integer;
  v_unordered_qty integer;
  v_item_count integer;
  v_amount numeric;
begin
  insert into public.events (id, code, name, status, event_date)
  values (v_event, 'TEST-FLOW-' || replace(v_event::text, '-', ''), 'Test Alur Status', 'inactive', '2026-11-21');

  insert into public.vendors (id, event_id, code, name)
  values (v_vendor, v_event, 'TEST-VENDOR', 'Test Vendor');

  insert into public.consumption_items (id, event_id, code, name, item_type, unit_of_measure)
  values (v_item, v_event, 'NASI', 'Nasi Box', 'MEAL', 'BOX');

  insert into public.inventory_locations (id, event_id, code, name, location_type)
  values (v_central, v_event, 'CENTRAL', 'Gudang Pusat', 'CENTRAL_WAREHOUSE');

  insert into public.beneficiaries (id, event_id, beneficiary_code, name, beneficiary_type, quantity)
  values (v_beneficiary, v_event, 'GRP-1', 'Tim Teknis', 'GROUP', 12);

  -- Slot dibuat DRAFT: insert tidak dibatasi trigger, hanya perubahan status.
  insert into public.consumption_slots (id, event_id, code, name, slot_date, starts_at, ends_at, status)
  values (v_slot, v_event, 'H_SIANG', 'H Siang', '2026-11-21', '11:00', '13:00', 'DRAFT');

  ----------------------------------------------------------------------------
  -- TEST 1: transisi slot yang sah dan yang tidak sah
  ----------------------------------------------------------------------------
  update public.consumption_slots set status = 'OPEN' where id = v_slot;

  select status into v_status from public.consumption_slots where id = v_slot;
  if v_status <> 'OPEN' then
    raise exception 'TEST 1 failed: slot tidak berpindah ke OPEN';
  end if;

  v_failed := false;
  begin
    update public.consumption_slots set status = 'DRAFT' where id = v_slot;
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 1 failed: OPEN -> DRAFT seharusnya ditolak';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 2: rencana yang dibatalkan boleh dibuka kembali
  ----------------------------------------------------------------------------
  insert into public.consumption_plans (
    id, event_id, consumption_item_id, consumption_slot_id, planned_quantity, unit_cost, status
  )
  values (v_plan, v_event, v_item, v_slot, 300, 25000, 'PLANNED');

  update public.consumption_plans set status = 'CANCELLED' where id = v_plan;
  update public.consumption_plans set status = 'PLANNED' where id = v_plan;

  select status into v_status from public.consumption_plans where id = v_plan;
  if v_status <> 'PLANNED' then
    raise exception 'TEST 2 failed: rencana tidak bisa dibuka kembali dari CANCELLED';
  end if;

  v_failed := false;
  begin
    update public.consumption_plans set status = 'LOCKED' where id = v_plan;
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 2 failed: PLANNED -> LOCKED seharusnya ditolak';
  end if;

  update public.consumption_plans set status = 'APPROVED' where id = v_plan;
  update public.consumption_plans set status = 'LOCKED' where id = v_plan;

  ----------------------------------------------------------------------------
  -- TEST 3: pesanan tidak boleh melompat ke RECEIVED
  ----------------------------------------------------------------------------
  insert into public.consumption_requests (id, event_id, vendor_id, status)
  values (v_request, v_event, v_vendor, 'PLANNED');

  v_failed := false;
  begin
    update public.consumption_requests set status = 'RECEIVED' where id = v_request;
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 3 failed: PLANNED -> RECEIVED seharusnya ditolak';
  end if;

  update public.consumption_requests set status = 'REQUESTED' where id = v_request;
  update public.consumption_requests set status = 'SENT' where id = v_request;

  ----------------------------------------------------------------------------
  -- TEST 4: penerimaan lewat RPC tetap bisa mencapai RECEIVED
  ----------------------------------------------------------------------------
  insert into public.consumption_request_items (
    id, consumption_request_id, consumption_plan_id, consumption_item_id,
    consumption_slot_id, requested_quantity, sent_quantity, unit_price
  )
  values (v_request_item, v_request, v_plan, v_item, v_slot, 300, 300, 25000);

  perform public.receive_consumption(v_request_item, v_central, 300, null);

  select status into v_status from public.consumption_requests where id = v_request;
  if v_status <> 'RECEIVED' then
    raise exception 'TEST 4 failed: penerimaan penuh tidak menghasilkan RECEIVED, dapat %', v_status;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 5: pesanan yang sudah RECEIVED boleh ditutup, lalu terminal
  ----------------------------------------------------------------------------
  update public.consumption_requests set status = 'CLOSED' where id = v_request;

  v_failed := false;
  begin
    update public.consumption_requests set status = 'CANCELLED' where id = v_request;
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 5 failed: CLOSED seharusnya terminal';
  end if;

  ----------------------------------------------------------------------------
  -- TEST 6: consumption_slot_overview
  ----------------------------------------------------------------------------
  insert into public.entitlements (
    event_id, beneficiary_id, consumption_item_id, consumption_slot_id, quantity
  )
  values (v_event, v_beneficiary, v_item, v_slot, 12);

  select plan_count, planned_quantity, entitlement_quantity
  into v_plan_count, v_planned_qty, v_entitlement_qty
  from public.consumption_slot_overview
  where consumption_slot_id = v_slot;

  if v_plan_count <> 1 then
    raise exception 'TEST 6 failed: plan_count seharusnya 1, dapat %', v_plan_count;
  end if;

  if v_planned_qty <> 300 then
    raise exception 'TEST 6 failed: planned_quantity seharusnya 300, dapat %', v_planned_qty;
  end if;

  if v_entitlement_qty <> 12 then
    raise exception 'TEST 6 failed: entitlement_quantity seharusnya 12, dapat %', v_entitlement_qty;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 7: consumption_plan_coverage
  ----------------------------------------------------------------------------
  select requested_quantity, received_quantity, unordered_quantity, planned_amount
  into v_requested_qty, v_received_qty, v_unordered_qty, v_amount
  from public.consumption_plan_coverage
  where consumption_plan_id = v_plan;

  if v_requested_qty <> 300 then
    raise exception 'TEST 7 failed: requested_quantity seharusnya 300, dapat %', v_requested_qty;
  end if;

  if v_received_qty <> 300 then
    raise exception 'TEST 7 failed: received_quantity seharusnya 300, dapat %', v_received_qty;
  end if;

  if v_unordered_qty <> 0 then
    raise exception 'TEST 7 failed: unordered_quantity seharusnya 0, dapat %', v_unordered_qty;
  end if;

  if v_amount <> 7500000.00 then
    raise exception 'TEST 7 failed: planned_amount seharusnya 7500000.00, dapat %', v_amount;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 8: consumption_request_summaries
  ----------------------------------------------------------------------------
  select item_count, received_quantity, received_amount
  into v_item_count, v_received_qty, v_amount
  from public.consumption_request_summaries
  where consumption_request_id = v_request;

  if v_item_count <> 1 then
    raise exception 'TEST 8 failed: item_count seharusnya 1, dapat %', v_item_count;
  end if;

  if v_received_qty <> 300 then
    raise exception 'TEST 8 failed: received_quantity seharusnya 300, dapat %', v_received_qty;
  end if;

  if v_amount <> 7500000.00 then
    raise exception 'TEST 8 failed: received_amount seharusnya 7500000.00, dapat %', v_amount;
  end if;

  ----------------------------------------------------------------------------
  -- TEST 9: pesanan yang sudah punya item tetap bisa dibatalkan dari SENT
  ----------------------------------------------------------------------------
  declare
    v_second_request uuid := gen_random_uuid();
  begin
    insert into public.consumption_requests (id, event_id, vendor_id, status)
    values (v_second_request, v_event, v_vendor, 'SENT');

    update public.consumption_requests set status = 'CANCELLED' where id = v_second_request;

    select status into v_status from public.consumption_requests where id = v_second_request;
    if v_status <> 'CANCELLED' then
      raise exception 'TEST 9 failed: SENT -> CANCELLED seharusnya diizinkan';
    end if;
  end;

  ----------------------------------------------------------------------------
  -- TEST 10: baris pesanan yang sudah diterima tidak bisa dihapus, yang belum
  -- diterima bisa
  ----------------------------------------------------------------------------
  v_failed := false;
  begin
    delete from public.consumption_request_items where id = v_request_item;
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 10 failed: baris dengan received_quantity > 0 seharusnya tidak bisa dihapus';
  end if;

  declare
    v_spare_item uuid := gen_random_uuid();
    v_spare_line uuid := gen_random_uuid();
  begin
    insert into public.consumption_items (id, event_id, code, name, item_type, unit_of_measure)
    values (v_spare_item, v_event, 'AQUA', 'Air Mineral', 'DRINK', 'BTL');

    insert into public.consumption_request_items (
      id, consumption_request_id, consumption_item_id, consumption_slot_id,
      requested_quantity, unit_price
    )
    values (v_spare_line, v_request, v_spare_item, v_slot, 50, 3000);

    delete from public.consumption_request_items where id = v_spare_line;

    if exists (select 1 from public.consumption_request_items where id = v_spare_line) then
      raise exception 'TEST 10 failed: baris tanpa penerimaan seharusnya bisa dihapus';
    end if;
  end;

  raise notice 'Status flow database tests passed.';
end $$;

rollback;
