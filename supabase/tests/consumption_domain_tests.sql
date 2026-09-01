\set ON_ERROR_STOP on

begin;

do $$
declare
  v_event uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_item uuid := gen_random_uuid();
  v_slot uuid := gen_random_uuid();
  v_central uuid := gen_random_uuid();
  v_area uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_request_item uuid := gen_random_uuid();
  v_beneficiary uuid := gen_random_uuid();
  v_group_beneficiary uuid := gen_random_uuid();
  v_stock_only_beneficiary uuid := gen_random_uuid();
  v_entitlement uuid := gen_random_uuid();
  v_group_entitlement uuid := gen_random_uuid();
  v_stock_only_entitlement uuid := gen_random_uuid();
  v_pickup uuid;
  v_duplicate_pickup uuid;
  v_group_pickup uuid;
  v_pickup_inventory_tx uuid;
  v_reversal uuid;
  v_failed boolean;
  v_balance integer;
begin
  insert into public.events (id, code, name, status, event_date)
  values (v_event, 'TEST-HBD-' || replace(v_event::text, '-', ''), 'Test HBD Consumption', 'inactive', '2026-11-21');

  insert into public.vendors (id, event_id, code, name)
  values (v_vendor, v_event, 'TEST-VENDOR', 'Test Vendor');

  insert into public.consumption_items (id, event_id, code, name, item_type, unit_of_measure)
  values (v_item, v_event, 'NASI', 'Nasi Box', 'MEAL', 'BOX');

  insert into public.consumption_slots (id, event_id, code, name, slot_date, starts_at, ends_at, pickup_deadline, status)
  values (v_slot, v_event, 'H_SIANG', 'H Siang', '2026-11-21', '11:00', '13:00', '2026-11-21 14:00:00+07', 'OPEN');

  insert into public.inventory_locations (id, event_id, code, name, location_type)
  values
    (v_central, v_event, 'CENTRAL', 'Central Warehouse', 'CENTRAL_WAREHOUSE'),
    (v_area, v_event, 'AREA_A', 'Area A', 'AREA');

  insert into public.consumption_requests (id, event_id, vendor_id, status)
  values (v_request, v_event, v_vendor, 'SENT');

  insert into public.consumption_request_items (
    id, consumption_request_id, consumption_item_id, consumption_slot_id,
    requested_quantity, sent_quantity
  )
  values (v_request_item, v_request, v_item, v_slot, 300, 300);

  perform public.receive_consumption(v_request_item, v_central, 300, null);

  if public.get_stock_balance(v_event, v_item, v_central, v_slot) <> 300 then
    raise exception 'TEST 1 failed: expected central stock 300';
  end if;

  perform public.transfer_inventory(v_event, v_item, v_central, v_area, 100, v_slot, 'test-transfer-100', null, null);

  if public.get_stock_balance(v_event, v_item, v_central, v_slot) <> 200 then
    raise exception 'TEST 2 failed: expected central stock 200';
  end if;

  if public.get_stock_balance(v_event, v_item, v_area, v_slot) <> 100 then
    raise exception 'TEST 2 failed: expected area stock 100';
  end if;

  insert into public.beneficiaries (
    id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity
  )
  values (
    v_beneficiary, v_event, 'BEN-TEST-1', 'Test Individual', 'INDIVIDUAL', 'COMMITTEE', 1
  );

  insert into public.entitlements (
    id, event_id, beneficiary_id, consumption_item_id, consumption_slot_id, quantity
  )
  values (v_entitlement, v_event, v_beneficiary, v_item, v_slot, 1);

  v_pickup := public.pickup_entitlement(v_entitlement, v_area, 1, 'test-pickup-individual', null, false, null);

  if public.get_stock_balance(v_event, v_item, v_area, v_slot) <> 99 then
    raise exception 'TEST 3 failed: expected area stock 99';
  end if;

  v_duplicate_pickup := public.pickup_entitlement(v_entitlement, v_area, 1, 'test-pickup-individual', null, false, null);

  if v_duplicate_pickup <> v_pickup then
    raise exception 'TEST 4 failed: duplicate idempotency key did not return original pickup id';
  end if;

  insert into public.beneficiaries (
    id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity, employee_group
  )
  values (
    v_group_beneficiary, v_event, 'GRP-TEST-PIJAR', 'PIJAR RETAIL', 'GROUP', 'COMMITTEE', 7, 'PIJAR RETAIL'
  );

  insert into public.entitlements (
    id, event_id, beneficiary_id, consumption_item_id, consumption_slot_id, quantity
  )
  values (v_group_entitlement, v_event, v_group_beneficiary, v_item, v_slot, 7);

  v_group_pickup := public.pickup_entitlement(v_group_entitlement, v_area, 3, 'test-pickup-group-3', null, false, null);

  select remaining_quantity into v_balance
  from public.entitlement_statuses
  where entitlement_id = v_group_entitlement;

  if v_balance <> 4 then
    raise exception 'TEST 5 failed: expected group entitlement remaining 4, got %', v_balance;
  end if;

  v_failed := false;
  begin
    perform public.pickup_entitlement(v_group_entitlement, v_area, 5, 'test-pickup-group-over', null, false, null);
  exception
    when others then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 6 failed: over-pickup should be rejected';
  end if;

  insert into public.beneficiaries (
    id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category, quantity
  )
  values (
    v_stock_only_beneficiary, v_event, 'BEN-STOCK-ONLY', 'Stock Race Test', 'INDIVIDUAL', 'COMMITTEE', 1
  );

  insert into public.entitlements (
    id, event_id, beneficiary_id, consumption_item_id, consumption_slot_id, quantity
  )
  values (v_stock_only_entitlement, v_event, v_stock_only_beneficiary, v_item, v_slot, 2);

  insert into public.inventory_transactions (
    event_id, consumption_item_id, consumption_slot_id, inventory_location_id,
    quantity, transaction_type, reference_type
  )
  values (v_event, v_item, v_slot, v_area, -95, 'ADJUSTMENT', 'MANUAL');

  if public.get_stock_balance(v_event, v_item, v_area, v_slot) <> 1 then
    raise exception 'TEST 7 setup failed: expected area stock 1';
  end if;

  perform public.pickup_entitlement(v_stock_only_entitlement, v_area, 1, 'test-stock-last-unit-a', null, false, null);

  v_failed := false;
  begin
    perform public.pickup_entitlement(v_stock_only_entitlement, v_area, 1, 'test-stock-last-unit-b', null, false, null);
  exception
    when others then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'TEST 7 failed: second pickup against last unit should be rejected';
  end if;

  select id into v_pickup_inventory_tx
  from public.inventory_transactions
  where reference_type = 'PICKUP'
    and reference_id = v_pickup
    and transaction_type = 'PICKUP';

  v_reversal := public.reverse_transaction(v_pickup_inventory_tx, 'test reversal', null);

  if v_reversal is null then
    raise exception 'TEST 8 failed: reversal transaction id is null';
  end if;

  if not exists (
    select 1
    from public.inventory_transactions
    where id = v_reversal
      and transaction_type = 'REVERSAL'
      and reversal_of_transaction_id = v_pickup_inventory_tx
      and quantity = 1
  ) then
    raise exception 'TEST 8 failed: reversal inventory transaction was not created correctly';
  end if;

  if (
    select status from public.pickup_transactions where id = v_pickup
  ) <> 'REVERSED' then
    raise exception 'TEST 8 failed: pickup status was not marked REVERSED';
  end if;

  if (
    select coalesce(sum(abs(quantity)), 0)::integer
    from public.inventory_transactions
    where event_id = v_event
      and inventory_location_id = v_central
      and consumption_item_id = v_item
      and consumption_slot_id = v_slot
      and transaction_type = 'TRANSFER_OUT'
  ) + public.get_stock_balance(v_event, v_item, v_central, v_slot) <> (
    select coalesce(sum(quantity), 0)::integer
    from public.inventory_transactions
    where event_id = v_event
      and inventory_location_id = v_central
      and consumption_item_id = v_item
      and consumption_slot_id = v_slot
      and transaction_type = 'RECEIVING'
  ) then
    raise exception 'TEST 9 failed: central reconciliation formula mismatch';
  end if;

  raise notice 'Consumption domain database tests passed.';
end $$;

rollback;
