insert into public.events (id, code, name, status, event_date, description)
values (
  '11111111-1111-1111-1111-111111111111',
  'HBD2026',
  'Honda Bikers Day 2026',
  'inactive',
  '2026-11-21',
  'Development seed for Consumption Distribution Monitoring System.'
)
on conflict (id) do update
set code = excluded.code,
    name = excluded.name,
    event_date = excluded.event_date,
    description = excluded.description;

insert into public.areas (id, event_id, code, name, area_type)
values
  ('21111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'REGISTRATION', 'Registration', 'AREA'),
  ('21111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'SERVICE_MOTOR', 'Service Motor', 'AREA'),
  ('21111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'MOBILE', 'Mobile', 'AREA')
on conflict (event_id, code) do update
set name = excluded.name,
    area_type = excluded.area_type;

insert into public.vendors (id, event_id, code, name, contact_name, phone)
values
  ('31111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'VENDOR_MEAL', 'Vendor Meal HBD', 'Meal Coordinator', null),
  ('31111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'VENDOR_SNACK', 'Vendor Snack HBD', 'Snack Coordinator', null)
on conflict (event_id, code) do update
set name = excluded.name,
    contact_name = excluded.contact_name;

insert into public.beneficiaries (
  id, event_id, beneficiary_code, name, beneficiary_type, beneficiary_category,
  quantity, origin, area_id, pic_hbd, employee_group
)
values
  ('41111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'BEN-001', 'Budi Santoso', 'INDIVIDUAL', 'COMMITTEE', 1, 'INTERNAL', '21111111-1111-1111-1111-111111111111', 'REGISTRATION', 'MAIN DEALER'),
  ('41111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'BEN-002', 'Siti Lestari', 'INDIVIDUAL', 'COMMITTEE', 1, 'INTERNAL', '21111111-1111-1111-1111-111111111112', 'H2', 'KABENG DEALER'),
  ('41111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'BEN-003', 'Andi Pratama', 'INDIVIDUAL', 'COMMITTEE', 1, 'INTERNAL', '21111111-1111-1111-1111-111111111113', 'LO', 'MAIN DEALER'),
  ('41111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111111', 'BEN-004', 'Dewi Anggraini', 'INDIVIDUAL', 'GUEST', 1, 'EXTERNAL', null, null, null),
  ('41111111-1111-1111-1111-111111111115', '11111111-1111-1111-1111-111111111111', 'BEN-005', 'Rizky Hidayat', 'INDIVIDUAL', 'PIC', 1, 'INTERNAL', '21111111-1111-1111-1111-111111111111', 'PIC REGISTRATION', 'MAIN DEALER'),
  ('41111111-1111-1111-1111-111111111116', '11111111-1111-1111-1111-111111111111', 'GRP-PIJAR-RETAIL', 'PIJAR RETAIL', 'GROUP', 'COMMITTEE', 7, 'INTERNAL', null, null, 'PIJAR RETAIL'),
  ('41111111-1111-1111-1111-111111111117', '11111111-1111-1111-1111-111111111111', 'GRP-VOLUNTEER', 'Volunteer Mahasiswa', 'GROUP', 'GUEST', 30, 'EXTERNAL', null, null, null)
on conflict (event_id, beneficiary_code) do update
set name = excluded.name,
    beneficiary_type = excluded.beneficiary_type,
    beneficiary_category = excluded.beneficiary_category,
    quantity = excluded.quantity,
    origin = excluded.origin,
    area_id = excluded.area_id,
    pic_hbd = excluded.pic_hbd,
    employee_group = excluded.employee_group;

insert into public.consumption_items (id, event_id, code, name, item_type, unit_of_measure)
values
  ('51111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'NASI', 'Nasi Box', 'MEAL', 'BOX'),
  ('51111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'SNACK_KUE', 'Snack Kue', 'SNACK', 'PCS'),
  ('51111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'SNACK_ROTI', 'Snack Roti', 'SNACK', 'PCS'),
  ('51111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111111', 'MINERAL_BOTOL', 'Mineral Botol', 'DRINK', 'BOTOL'),
  ('51111111-1111-1111-1111-111111111115', '11111111-1111-1111-1111-111111111111', 'VOUCHER_MAKAN', 'Voucher Makan', 'VOUCHER', 'LEMBAR')
on conflict (event_id, code) do update
set name = excluded.name,
    item_type = excluded.item_type,
    unit_of_measure = excluded.unit_of_measure;

insert into public.consumption_slots (
  id, event_id, code, name, relative_day_offset, slot_date, starts_at, ends_at, pickup_deadline, status
)
values
  ('61111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'H_MINUS_2_SIANG', 'H-2 Siang', -2, '2026-11-19', '11:00', '13:00', '2026-11-19 14:00:00+07', 'OPEN'),
  ('61111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'H_MINUS_1_SIANG', 'H-1 Siang', -1, '2026-11-20', '11:00', '13:00', '2026-11-20 14:00:00+07', 'OPEN'),
  ('61111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'H_MINUS_1_MALAM', 'H-1 Malam', -1, '2026-11-20', '18:00', '20:00', '2026-11-20 21:00:00+07', 'OPEN'),
  ('61111111-1111-1111-1111-111111111114', '11111111-1111-1111-1111-111111111111', 'H_PAGI', 'H Pagi', 0, '2026-11-21', '06:00', '08:00', '2026-11-21 09:00:00+07', 'OPEN'),
  ('61111111-1111-1111-1111-111111111115', '11111111-1111-1111-1111-111111111111', 'H_SIANG', 'H Siang', 0, '2026-11-21', '11:00', '13:00', '2026-11-21 14:00:00+07', 'OPEN')
on conflict (event_id, code) do update
set name = excluded.name,
    relative_day_offset = excluded.relative_day_offset,
    slot_date = excluded.slot_date,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    pickup_deadline = excluded.pickup_deadline,
    status = excluded.status;

insert into public.inventory_locations (id, event_id, area_id, code, name, location_type)
values
  ('71111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', null, 'CENTRAL', 'Central Warehouse', 'CENTRAL_WAREHOUSE'),
  ('71111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '21111111-1111-1111-1111-111111111111', 'REGISTRATION_STOCK', 'Registration Stock Point', 'AREA'),
  ('71111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', '21111111-1111-1111-1111-111111111112', 'SERVICE_STOCK', 'Service Motor Stock Point', 'AREA')
on conflict (event_id, code) do update
set name = excluded.name,
    area_id = excluded.area_id,
    location_type = excluded.location_type;

insert into public.consumption_plans (
  id, event_id, consumption_item_id, consumption_slot_id, planned_quantity, unit_cost, status, notes
)
values
  ('81111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', 300, 25000, 'LOCKED', 'Sample planned meal quantity.'),
  ('81111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111112', '61111111-1111-1111-1111-111111111115', 300, 7000, 'LOCKED', 'Sample snack quantity.')
on conflict (event_id, consumption_item_id, consumption_slot_id) do update
set planned_quantity = excluded.planned_quantity,
    unit_cost = excluded.unit_cost,
    status = excluded.status,
    notes = excluded.notes;

insert into public.consumption_requests (id, event_id, vendor_id, status, notes)
values (
  '91111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '31111111-1111-1111-1111-111111111111',
  'SENT',
  'Sample request for testing request variance and receiving.'
)
on conflict (id) do update
set vendor_id = excluded.vendor_id,
    status = excluded.status,
    notes = excluded.notes;

insert into public.consumption_request_items (
  id, consumption_request_id, consumption_plan_id, consumption_item_id,
  consumption_slot_id, requested_quantity, sent_quantity, received_quantity
)
values (
  '91111111-2222-1111-1111-111111111111',
  '91111111-1111-1111-1111-111111111111',
  '81111111-1111-1111-1111-111111111111',
  '51111111-1111-1111-1111-111111111111',
  '61111111-1111-1111-1111-111111111115',
  300,
  300,
  0
)
on conflict (id) do update
set requested_quantity = excluded.requested_quantity,
    sent_quantity = excluded.sent_quantity,
    received_quantity = excluded.received_quantity;

insert into public.entitlements (
  id, event_id, beneficiary_id, consumption_item_id, consumption_slot_id, quantity, notes
)
values
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '41111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', 1, 'Individual pickup sample.'),
  ('a1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '41111111-1111-1111-1111-111111111116', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', 7, 'Group partial pickup sample.'),
  ('a1111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', '41111111-1111-1111-1111-111111111117', '51111111-1111-1111-1111-111111111112', '61111111-1111-1111-1111-111111111115', 30, 'External group sample.')
on conflict (event_id, beneficiary_id, consumption_item_id, consumption_slot_id) where cancelled_at is null do update
set quantity = excluded.quantity,
    notes = excluded.notes;

insert into public.inventory_transactions (
  id, event_id, consumption_item_id, consumption_slot_id, inventory_location_id,
  quantity, transaction_type, reference_type, reference_id
)
values
  ('b1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', '71111111-1111-1111-1111-111111111111', 300, 'RECEIVING', 'CONSUMPTION_REQUEST', '91111111-1111-1111-1111-111111111111'),
  ('b1111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', '71111111-1111-1111-1111-111111111111', -100, 'TRANSFER_OUT', 'DISTRIBUTION', 'c1111111-1111-1111-1111-111111111111'),
  ('b1111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111115', '71111111-1111-1111-1111-111111111112', 100, 'TRANSFER_IN', 'DISTRIBUTION', 'c1111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

insert into public.distribution_transactions (
  id, event_id, from_location_id, to_location_id, status, idempotency_key, notes
)
values (
  'c1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '71111111-1111-1111-1111-111111111111',
  '71111111-1111-1111-1111-111111111112',
  'POSTED',
  'seed-transfer-registration',
  'Seed transfer represented in inventory ledger.'
)
on conflict (id) do update
set status = excluded.status,
    notes = excluded.notes;

insert into public.distribution_items (
  distribution_transaction_id, consumption_item_id, consumption_slot_id, quantity
)
values (
  'c1111111-1111-1111-1111-111111111111',
  '51111111-1111-1111-1111-111111111111',
  '61111111-1111-1111-1111-111111111115',
  100
)
on conflict (distribution_transaction_id, consumption_item_id, consumption_slot_id) do update
set quantity = excluded.quantity;

insert into public.stock_reconciliations (
  id, event_id, inventory_location_id, status, notes
)
values (
  'd1111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '71111111-1111-1111-1111-111111111112',
  'DRAFT',
  'Sample reconciliation draft.'
)
on conflict (id) do update
set status = excluded.status,
    notes = excluded.notes;

-- Budget layer seed: one pagu, one partly paid vendor invoice.
insert into public.budgets (id, event_id, code, name, allocated_amount, status, notes)
values (
  '91111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'KONSUMSI-TOTAL',
  'Pagu Konsumsi HBD 2026',
  250000000.00,
  'ACTIVE',
  'Development seed budget.'
)
on conflict (event_id, code) do update
set name = excluded.name,
    allocated_amount = excluded.allocated_amount,
    notes = excluded.notes;

insert into public.expenses (
  id, event_id, budget_id, vendor_id, expense_type,
  description, amount, expense_date, invoice_number
)
select
  '92111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '91111111-1111-1111-1111-111111111111',
  v.id,
  'VENDOR_INVOICE',
  'Tagihan nasi box hari-H',
  48000000.00,
  '2026-11-21',
  'INV/SEED/001'
from public.vendors v
where v.event_id = '11111111-1111-1111-1111-111111111111'
order by v.code
limit 1
on conflict (id) do update
set amount = excluded.amount,
    description = excluded.description,
    invoice_number = excluded.invoice_number;

insert into public.expense_payments (id, expense_id, amount, method, reference)
values (
  '93111111-1111-1111-1111-111111111111',
  '92111111-1111-1111-1111-111111111111',
  20000000.00,
  'TRANSFER',
  'DP 40 persen'
)
on conflict (id) do update
set amount = excluded.amount,
    reference = excluded.reference;
