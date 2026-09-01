# Spesifikasi Database

Backend monitoring konsumsi untuk Honda Bikers Day 2026. Schema ini berdiri
sendiri: tidak ada ketergantungan pada project attendance, dan tidak ada tabel
`attendance_records`.

Migrasi dijalankan berurutan:

| File | Isi |
| --- | --- |
| `supabase/migrations/001_foundation.sql` | enum `staff_role`, `profiles`, `events`, `set_updated_at()`, helper role |
| `supabase/migrations/002_consumption_domain.sql` | master data, entitlement, ledger stok, distribusi, pengambilan, rekonsiliasi, audit |
| `supabase/migrations/003_budget.sql` | `budgets`, `expenses`, `expense_payments`, view realisasi |
| `supabase/migrations/004_storage.sql` | bucket privat `receipts` dan policy `storage.objects` |

## Fondasi (001)

- `staff_role` hanya berisi nilai UPPER_SNAKE: `ADMIN`, `CONSUMPTION_MANAGER`,
  `WAREHOUSE_OPERATOR`, `AREA_PIC`, `PICKUP_OPERATOR`, `MANAGEMENT`.
- `profiles` merujuk `auth.users` dan **tidak punya trigger auto-create**. User
  yang sudah sign-in tetapi belum punya baris `profiles` tidak punya role dan
  tidak bisa membaca apa pun. Baris admin pertama dibuat manual (lihat README).
- `events` punya index unik parsial `idx_events_single_active`, jadi hanya satu
  event boleh berstatus `active`.
- Helper `current_staff_role()` dan `current_role_text()` adalah
  `security definer` dengan `set search_path = public`, dan hanya mengembalikan
  role bila `profiles.is_active` true. Menonaktifkan akun langsung menutup akses.

## Domain konsumsi (002)

Isi tabel dan ERD-nya sama dengan rancangan awal, dengan tiga prinsip yang
dipegang konsisten:

- **Stok hanya ledger.** `inventory_transactions` menyimpan kuantitas
  bertanda; tidak ada kolom saldo yang bisa diedit. Saldo dihitung view
  `stock_balances` sebagai `sum(quantity)`.
- **Status dihitung, bukan disimpan.** Status entitlement berasal dari
  `pickup_items` yang benar-benar `POSTED`, lewat view `entitlement_statuses`.
- **Koreksi lewat pembalik, bukan delete.** Baris ledger yang sudah diposting
  dibalik dengan baris `REVERSAL` baru.

Tabel: `areas`, `vendors`, `beneficiaries`, `consumption_items`,
`consumption_slots`, `consumption_plans`, `consumption_requests`,
`consumption_request_items`, `entitlements`, `inventory_locations`,
`inventory_transactions`, `distribution_transactions`, `distribution_items`,
`pickup_transactions`, `pickup_items`, `notification_logs`,
`stock_reconciliations`, `stock_reconciliation_items`, `audit_logs`.

View: `stock_balances`, `entitlement_statuses`,
`consumption_request_variances`, `outstanding_entitlements`.

## Anggaran (003)

- `budgets`: pagu per event, opsional dipersempit ke item atau slot tertentu.
  Unik per `(event_id, code)`. Status: `DRAFT`, `ACTIVE`, `LOCKED`, `CANCELLED`.
- `expenses`: tagihan vendor. `receipt_path` menyimpan **object path** Storage,
  bukan URL publik. Pembatalan pakai `voided_at` + `void_reason`, dijaga
  `check (voided_at is null or void_reason is not null)`.
- `expense_payments`: ledger pembayaran bertanda. Refund adalah baris negatif,
  `check (amount <> 0)`.
- `consumption_request_items.unit_price` ditambahkan di sini untuk sisi
  perencanaan biaya.

Tidak ada kolom `payment_status` yang disimpan. Alasannya sama dengan status
entitlement: kolom status akan melenceng dari baris yang benar-benar
memindahkan uang. Status dihitung view `expense_payment_statuses`:
`UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERPAID`, `VOID`.

View lain:

- `budget_realizations`: `allocated` / `invoiced` / `paid` / `outstanding` /
  `remaining` / `utilization_percent` per pos, mengecualikan tagihan `VOID`.
- `consumption_cost_projections`: nilai pesanan vendor. Sengaja dipisah dari
  view anggaran supaya nilai pesanan tidak dihitung dua kali dengan tagihan.
- `event_budget_summary`: rollup per event, mengecualikan pos `CANCELLED`.

## Storage (004)

Bucket privat `receipts` (maks 5 MiB; jpeg, png, webp, pdf). Baca:
`ADMIN`, `CONSUMPTION_MANAGER`, `MANAGEMENT`. Tulis: `ADMIN`,
`CONSUMPTION_MANAGER`. Akses file selalu lewat signed URL, sehingga path yang
bocor bukan berarti dokumennya bocor.

Migrasi ini dibungkus pengecekan `information_schema.schemata`, jadi aman
di-skip pada database lokal yang tidak punya schema `storage`.

## Strategi RLS

RLS aktif di seluruh tabel domain dan anggaran.

| Role | Akses |
| --- | --- |
| `ADMIN` | penuh |
| `CONSUMPTION_MANAGER` | perencanaan, pesanan, master data, anggaran, laporan |
| `WAREHOUSE_OPERATOR` | penerimaan dan transfer, lewat RPC |
| `AREA_PIC` | operasional area, pengambilan lewat RPC |
| `PICKUP_OPERATOR` | baca entitlement, pengambilan lewat RPC |
| `MANAGEMENT` | baca saja |

Dua hal yang mudah salah dan sudah ditutup:

1. **View harus `security_invoker = true`.** Pada PostgreSQL 15+ view berjalan
   sebagai ownernya (`postgres`, yang melewati RLS). Tanpa `security_invoker`,
   view di atas tabel ber-RLS membocorkan seluruh isinya ke siapa pun yang
   memegang publishable key — dan key itu memang dikirim ke browser. Semua view
   di project ini menyetel flag tersebut.
2. **`anon` dicabut di mana-mana.** `revoke all ... from anon` diterapkan ke
   seluruh tabel dan view sebagai lapis kedua.

Tulis langsung ke tabel ledger dibatasi ke `ADMIN`. Penerimaan, transfer,
pengambilan, dan pembalikan harus lewat fungsi RPC supaya validasi, advisory
lock, posting ledger, dan audit terjadi dalam satu transaksi.

## Yang belum ada

- **Scoping area belum diimplementasikan.** Tabel `areas` ada dan role
  `AREA_PIC` ada, tetapi tidak ada kolom yang mengikat seorang staff ke satu
  area, sehingga policy `AREA_PIC` saat ini seluas role operasional lain.
  Menambahkan kolom `profiles.area_id` yang belum dipakai justru menyesatkan,
  jadi ini dibiarkan terbuka sampai modul pengambilan dibangun.
- Rollup jumlah porsi (bukan jumlah baris) entitlement belum ada view-nya.
  Dashboard saat ini menghitung baris.

## Seed pengembangan

`supabase/seed.sql` membuat 1 event HBD 2026, 3 area, 2 vendor, 5 penerima
individu, 2 penerima grup, 5 item, 5 slot, contoh plan/request/entitlement,
contoh penerimaan gudang pusat dan transfer pusat→area, serta pos anggaran
`KONSUMSI-TOTAL` 250.000.000 dengan satu tagihan 48.000.000 dan satu
pembayaran DP 20.000.000.

## Tes

```
psql -f supabase/tests/consumption_domain_tests.sql
psql -f supabase/tests/budget_tests.sql
```

Keduanya berjalan dalam transaksi dan diakhiri `raise notice` bila lolos.
