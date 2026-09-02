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
| `supabase/migrations/005_status_flow.sql` | aturan transisi status, penjaga hapus baris pesanan, view ringkasan perencanaan dan pesanan |
| `supabase/migrations/006_pickup_access.sql` | token QR penerima, view `entitlement_overview`, RPC penerbitan hak konsumsi dan pembacaan klaim tanpa akun |

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

## Alur status (005)

RLS menentukan **siapa** yang boleh menulis, bukan **nilai apa** yang sah.
Seorang `CONSUMPTION_MANAGER` memegang publishable key yang dikirim ke browser,
jadi ia bisa mem-PATCH `status` langsung ke PostgREST tanpa melewati aplikasi.
Karena itu urutan status dijaga trigger, bukan hanya kode aplikasi.

- `status_transition_allowed(entity, from, to)` — `immutable`, berisi daftar
  transisi sah untuk `consumption_slots`, `consumption_plans`, dan
  `consumption_requests`.
- `enforce_status_transition()` dipasang sebagai trigger
  `before update ... when (old.status is distinct from new.status)` pada ketiga
  tabel dan menolak dengan `errcode = 'P0001'`.
- `src/lib/domain/status.ts` adalah **cerminan** daftar itu untuk kebutuhan UI
  (label dan tombol yang ditawarkan). Bila daftar SQL berubah, file itu diubah
  pada commit yang sama.

Beberapa transisi terlihat aneh sampai alasannya jelas:

- `PLANNED > SENT` pada pesanan legal karena `update_request_status()` diakhiri
  `else status` dan hanya berjalan untuk pesanan di luar `CLOSED`/`CANCELLED`,
  jadi status `SENT` yang diisi manual tidak ditimpa.
- `CANCELLED > PLANNED` pada rencana legal karena unik `(event, item, slot)`
  tidak menyaring status: tanpa jalan kembali, satu rencana yang dibatalkan akan
  memblokir pembuatan rencana baru untuk kombinasi yang sama selamanya.
- `PARTIALLY_RECEIVED` dan `RECEIVED` tetap sah di database karena RPC
  penerimaan yang menuliskannya, tetapi **tidak ditawarkan sebagai tombol**.
  Keduanya mengikuti jumlah yang benar-benar diterima.

`block_received_request_item_delete()` menolak `delete` pada baris pesanan yang
`received_quantity > 0`. Menghapus baris yang sudah diterima akan meninggalkan
transaksi stok tanpa asal: stoknya tetap bertambah, sumbernya hilang.

Sebaliknya, larangan mengubah isi pesanan `CLOSED`/`CANCELLED` **tidak** dibuat
trigger dan tetap aturan aplikasi (`isRequestOpen()` di
`src/lib/domain/status.ts`), karena pembalikan penerimaan pada pesanan yang sudah
ditutup masih harus bisa menulis.

View baru, ketiganya `security_invoker = true` dan dicabut dari `anon`:

- `consumption_slot_overview`: per slot — jumlah rencana aktif, total porsi
  rencana, dan total porsi entitlement yang sudah terbit (baris `CANCELLED` dan
  entitlement yang dibatalkan tidak dihitung).
- `consumption_plan_coverage`: per rencana — dipesan, dikirim, diterima,
  `unordered_quantity` (rencana dikurangi yang sudah masuk pesanan aktif), dan
  `planned_amount`. Serapan dicocokkan pada `(event, item, slot)`, **bukan** pada
  `consumption_plan_id`, karena kolom itu nullable: baris pesanan yang dibuat
  tanpa menunjuk rencana tetap terhitung sebagai serapan.
- `consumption_request_summaries`: per pesanan — jumlah baris, kuantitas dipesan/
  dikirim/diterima, serta nilai dipesan dan nilai diterima.

## Akses pengambilan & klaim (006)

Dua lubang yang ditinggalkan 002: tidak ada cara menerbitkan hak konsumsi secara
massal, dan tidak ada cara penerima membuka haknya sendiri padahal ia tidak punya
akun.

### `beneficiary_access_tokens`

Satu baris per QR yang pernah diterbitkan. Yang dipegang penerima adalah bearer
secret: siapa pun yang memegang tokennya bisa melihat hak konsumsi penerima itu.
Karena itu tiga hal dijaga di level schema, bukan di aplikasi:

- **Hanya digest yang disimpan.** `token_hash` dikunci
  `check (token_hash ~ '^[0-9a-f]{64}$')` — SHA-256 hex. Token mentah muncul
  sekali saja di layar yang menerbitkannya, lalu hidup di QR. Tabel ini bocor pun
  tidak menghasilkan QR yang bisa dipakai; konsekuensinya QR yang hilang harus
  diterbitkan ulang, tidak bisa dicetak ulang.
- **Masa berlaku wajib.** `expires_at` `not null` plus
  `check (expires_at > created_at)`. Tautan bertoken tanpa kedaluwarsa akan tetap
  membuka data peserta lama setelah event bubar.
- **Satu token hidup per penerima.** Index unik parsial
  `idx_beneficiary_access_tokens_live on (beneficiary_id) where revoked_at is null`.
  Mengganti QR berarti mencabut yang lama lebih dulu, jadi lembar yang sudah
  dicetak tidak pernah diam-diam tetap berlaku berdampingan dengan penggantinya.

`idx_beneficiary_access_tokens_hash` unik penuh, karena pencocokan token adalah
lookup pada kolom itu. Baca diberikan ke keenam role — operator pengambilan harus
bisa mencocokkan hash yang baru dipindai — sedangkan tulis (penerbitan dan
pencabutan) hanya `ADMIN` dan `CONSUMPTION_MANAGER`. Pencabutan menyimpan
`revoked_at`, `revoked_by`, dan `revocation_reason`; barisnya tidak dihapus.

### `entitlement_overview`

`security_invoker = true`, dicabut dari `anon`. `entitlement_statuses` hanya
membawa id, sedangkan setiap layar hak konsumsi butuh nama penerima, nama item,
jam slot, dan batas ambilnya. View ini menggabungkan keempatnya sekali supaya
halaman operator, halaman penerima, dan RPC klaim membaca angka yang sama.

`expires_at` diambil dari baris `entitlements`, bukan dari slot: batas ambil bisa
berbeda per hak bila slotnya diubah setelah hak diterbitkan.

### RPC

| Fungsi | Pemanggil | Isi |
| --- | --- | --- |
| `generate_entitlements(slot, item, categories, types, area)` | `authenticated` | insert-select satu baris per penerima aktif yang cocok filter |
| `resolve_claim_token(token_hash)` | `anon`, `authenticated` | satu baris identitas penerima pemegang token |
| `get_claim_entitlements(token_hash)` | `anon`, `authenticated` | daftar hak konsumsi penerima pemegang token |

`generate_entitlements` dibuat RPC karena isinya insert-select: satu transaksi,
bukan ratusan bolak-balik HTTP. Ia `assert_consumption_role(['ADMIN',
'CONSUMPTION_MANAGER'])` lebih dulu, menolak item nonaktif, menolak item dan slot
dari event berbeda, menolak slot `CLOSED`/`CANCELLED`, lalu mengambil
`pg_advisory_xact_lock` per `(slot, item)` supaya dua penerbitan bersamaan tidak
berlomba pada index unik. Idempotensinya datang dari
`on conflict (event_id, beneficiary_id, consumption_item_id, consumption_slot_id)
where cancelled_at is null do nothing`: dijalankan ulang setelah penerima baru
masuk, hanya sisanya yang terbit. Nilainya kembali sebagai
`{matched, created}` dan tercatat di `audit_logs` beserta filter yang dipakai.

Kuantitas hak mengikuti `beneficiaries.quantity`, bukan porsi rencana slot. Grup
tidak dipecah menjadi orang fiktif — satu baris hak berisi kuantitas grup — dan
individu selalu 1 karena dijaga constraint di `beneficiaries`.

Dua fungsi klaim adalah **satu-satunya pintu** untuk pemegang token tanpa akun.
Keduanya `security definer` dengan `set search_path = public`, karena `anon`
sengaja tidak punya hak apa pun atas tabel di bawahnya. Yang membuat keduanya
aman diberikan ke `anon` adalah bentuk parameternya: satu-satunya masukan adalah
hash token, dan tidak ada parameter id penerima yang bisa diputar untuk melihat
orang lain. Filternya `revoked_at is null and expires_at > now()`, dan
`resolve_claim_token` juga menuntut `b.is_active`, jadi penerima yang dinonaktifkan
langsung kehilangan tautannya.

Keduanya `stable` dan hanya mengembalikan baris, bukan alasan kegagalan. Token
asing, dicabut, dan kedaluwarsa sama-sama menghasilkan nol baris — halaman
`/klaim/[token]` tidak bisa dipakai untuk menebak token mana yang ada. Sisi staff
(`/pengambilan/t/[token]`) memang menyebut alasannya, tetapi itu jalur
`authenticated` yang membaca tabelnya langsung. Detail kedua rute ada di
`docs/pickup.md`.

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
  Modul pengambilan sudah berjalan tanpa itu: setiap pencatatan menyimpan
  `inventory_location_id`, jadi jejaknya tetap jelas, tetapi seorang `AREA_PIC`
  secara teknis masih bisa mencatat pengambilan di area lain. Mengikat staff ke
  area butuh kolom baru di `profiles` plus policy per baris di
  `pickup_transactions`, dan itu belum dikerjakan.
- Rollup porsi entitlement per slot sudah ada di `consumption_slot_overview`,
  tetapi angka di dashboard masih menghitung **baris** `entitlement_statuses`,
  bukan porsi. Selama satu entitlement bisa berisi lebih dari satu porsi, kedua
  angka itu berbeda.
- **`reverse_transaction()` belum menangani `reference_type = 'CONSUMPTION_REQUEST'`.**
  Fungsi itu mengembalikan status untuk `PICKUP` dan `DISTRIBUTION`, tetapi
  membalik sebuah penerimaan tidak menurunkan kembali
  `consumption_request_items.received_quantity` dan tidak menghitung ulang status
  pesanan. Penyebabnya `receive_consumption()` menyimpan `reference_id` berisi id
  **pesanan**, bukan id baris pesanan, jadi pembalikan tidak tahu baris mana yang
  harus dikurangi. Perbaikannya masuk fase gudang.

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
psql -f supabase/tests/status_flow_tests.sql
psql -f supabase/tests/pickup_access_tests.sql
```

Semuanya berjalan dalam transaksi dan diakhiri `raise notice` bila lolos.
