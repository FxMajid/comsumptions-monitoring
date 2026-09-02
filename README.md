# Monitoring Konsumsi

Website monitoring divisi konsumsi kepanitiaan event: anggaran vs realisasi,
klaim konsumsi, jadwal & vendor, dan stok. Next.js 16 App Router + Supabase,
dideploy ke Vercel.

Status: **Fase 2 selesai**.

Fase 1 — schema + RLS, autentikasi staff, shell aplikasi, Dashboard, Anggaran,
dan modul jadwal & vendor: master data (item, area), perencanaan (slot dan
rencana porsi), serta vendor dan pesanan beserta alur statusnya.

Fase 2 — pengambilan & QR: master penerima dan lokasi stok, penerbitan hak
konsumsi massal per slot, token QR per penerima, halaman operator (pindai atau
cari, lalu catat), dan satu halaman tanpa login tempat penerima melihat haknya
sendiri lewat tautan bertoken.

Modul gudang, rekonsiliasi, dan pengguna belum dibangun (tampil sebagai "Nanti"
di navigasi).

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # lalu isi nilainya
npm run dev
```

Tanpa `.env.local` yang valid, aplikasi tetap jalan dan halaman `/login`
menampilkan pesan setup, bukan error.

## Origin untuk QR klaim (`APP_URL`)

QR penerima memuat URL absolut ke `/klaim/{token}`, dan lembar yang sudah dicetak
berumur lebih panjang daripada URL deployment tempat ia dibuat. Karena itu
`APP_URL` (tanpa slash di akhir) harus sudah diisi **sebelum** QR dicetak:

```
APP_URL=https://konsumsi.contoh.id
```

Urutan resolusinya: `APP_URL`, lalu `VERCEL_PROJECT_PRODUCTION_URL`, lalu host
dari header request sebagai jalan terakhir. Header itu dikirim klien dan pada
dasarnya bisa dipalsukan, jadi ia hanya pantas untuk pengembangan lokal — bukan
untuk lembar yang akan dibagikan.

## Menyiapkan Supabase

### 1. Buat project

Buat project Supabase baru, lalu ambil dari **Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key)

Keduanya memang dikirim ke browser dan aman, karena row level security yang
membatasi baris mana yang bisa dibaca. **`service_role` key tidak dipakai di
project ini dan tidak boleh dimasukkan ke variabel berawalan `NEXT_PUBLIC_`.**

### 2. Jalankan migrasi

Urutkan dari 001. Lewat SQL Editor di dashboard, tempel isi tiap file
berurutan; atau lewat CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

```
supabase/migrations/001_foundation.sql
supabase/migrations/002_consumption_domain.sql
supabase/migrations/003_budget.sql
supabase/migrations/004_storage.sql
supabase/migrations/005_status_flow.sql
supabase/migrations/006_pickup_access.sql
```

Migrasi bersifat append-only: jangan mengedit file yang sudah dijalankan di
database, buat file baru.

### 3. Buat admin pertama

Tidak ada trigger yang membuat `profiles` otomatis saat signup. Ini disengaja:
user yang sign-in tanpa baris `profiles` tidak punya role dan tidak bisa
membaca apa pun. Konsekuensinya, admin pertama harus dibuat manual.

1. **Authentication → Users → Add user**, isi email dan password, dan aktifkan
   auto-confirm (atau konfirmasi lewat email).
2. Di SQL Editor, buat baris profilnya:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Nama Admin', 'ADMIN'
from auth.users
where email = 'admin@contoh.id';
```

Setelah itu login lewat `/login`. Anggota tim berikutnya dibuat dengan cara yang
sama, dengan `role` sesuai kebutuhan: `CONSUMPTION_MANAGER`,
`WAREHOUSE_OPERATOR`, `AREA_PIC`, `PICKUP_OPERATOR`, atau `MANAGEMENT`.

Mencabut akses: setel `is_active = false`. Helper role di database hanya
mengembalikan role untuk profil aktif, jadi akun langsung kehilangan akses tanpa
perlu menghapus baris atau riwayat auditnya.

### 4. Buat event aktif

Semua angka dihitung per event, dan hanya satu event boleh `active` (dijaga
index unik parsial).

```sql
insert into public.events (code, name, status, event_date)
values ('HBD2026', 'Honda Bikers Day 2026', 'active', '2026-10-10');
```

### 5. Data contoh (opsional)

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

Seed berisi 1 event HBD 2026, area, vendor, penerima individu dan grup, item,
slot, contoh plan/request/entitlement, contoh ledger stok, serta pos anggaran
250.000.000 dengan satu tagihan dan satu pembayaran DP.

### 6. Menyiapkan stok awal (sementara)

Setiap pengambilan mengurangi saldo lokasi, dan `pickup_entitlement()` menolak
bila saldonya tidak cukup. Modul gudang yang memposting penerimaan belum ada,
jadi untuk mencoba pengambilan dari ujung ke ujung stoknya diposting manual —
sebagai baris ledger `RECEIVING`, bukan kolom saldo, karena kolom saldo yang bisa
diedit memang tidak ada:

```sql
insert into public.inventory_transactions (
  event_id, consumption_item_id, inventory_location_id,
  quantity, transaction_type, reference_type
)
select
  ev.id, ci.id, il.id,
  500, 'RECEIVING', 'MANUAL'
from public.events ev
join public.consumption_items ci on ci.event_id = ev.id and ci.code = 'NASI'
join public.inventory_locations il on il.event_id = ev.id and il.code = 'CENTRAL'
where ev.status = 'active';
```

Sesuaikan kode item, kode lokasi, dan jumlahnya. Saldo per lokasi terbaca di view
`stock_balances`. Alternatifnya, seorang `ADMIN` mencatat pengambilan dengan
centang override pada formulirnya; itu melewati pengecekan stok tetapi tetap
tercatat di `audit_logs`.

## Tes database

```bash
psql "$DATABASE_URL" -f supabase/tests/consumption_domain_tests.sql
psql "$DATABASE_URL" -f supabase/tests/budget_tests.sql
psql "$DATABASE_URL" -f supabase/tests/status_flow_tests.sql
psql "$DATABASE_URL" -f supabase/tests/pickup_access_tests.sql
```

Keempatnya berjalan dalam transaksi (tidak meninggalkan data) dan diakhiri
`raise notice` bila lolos. Tes domain mencakup penerimaan, transfer, idempotensi
pengambilan, pengambilan grup sebagian, pembalikan, saldo stok, dan pelanggaran
constraint. Tes anggaran mencakup transisi status pembayaran, refund negatif,
rollup pagu, isolasi tagihan yang di-void, dan dua uji constraint negatif. Tes
alur status mencakup transisi sah dan tidak sah untuk slot, rencana, dan
pesanan, penolakan hapus baris pesanan yang sudah diterima, serta angka ketiga
view ringkasan. Tes akses pengambilan mencakup penerbitan hak konsumsi massal
beserta idempotensi dan filternya, penolakan slot batal, token hidup versus
token cabut/kedaluwarsa/asing, isolasi antar penerima, satu token hidup per
penerima, bentuk hash yang dijaga constraint, dan grant `anon` pada kedua RPC
klaim.

## Deploy ke Vercel

Import repo, lalu set dua environment variable yang sama
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) untuk
Production, Preview, dan Development. Tidak ada variabel rahasia lain yang
diperlukan.

Tambahkan juga `APP_URL` berisi domain final yang akan dicetak ke QR — biasanya
domain kustom, bukan URL `*.vercel.app` milik satu deployment. Bila dikosongkan,
`VERCEL_PROJECT_PRODUCTION_URL` dipakai, dan QR akan menunjuk ke domain
Production Vercel apa adanya.

Tambahkan URL deployment ke **Supabase → Authentication → URL Configuration**
(Site URL dan Redirect URLs).

## Struktur

```
src/app/(app)/         halaman di balik login (shell + navigasi)
src/app/login/         halaman masuk
src/app/klaim/         halaman penerima tanpa login, dibuka lewat token QR
src/components/        UI; komponen client hanya bila perlu
src/components/forms/  form client yang memakai useActionState
src/lib/actions/       Server Action: validasi Zod lalu tulis ke Supabase
src/lib/auth/          peta role→route dan resolusi profil sisi server
src/lib/domain/        query dan aturan domain, terpisah dari komponen
src/lib/supabase/      client browser dan server (@supabase/ssr)
src/proxy.ts           Proxy Next 16 (pengganti middleware), cek optimistis
supabase/migrations/   schema, append-only
supabase/tests/        tes SQL
docs/                  spesifikasi database, stok, pengambilan, rekonsiliasi, anggaran
```

## Batasan yang diketahui

- **Form kosong lagi setelah submit gagal.** React 19 me-reset field tak
  terkontrol begitu Server Action selesai, jadi nilai yang tadi diisi tidak
  bertahan saat server menolak. Yang menahan kesalahan lebih dulu adalah validasi
  HTML (`required`, `min`, `type`) plus pesan error dari server.
- **Membalik penerimaan barang belum lengkap.** `reverse_transaction()` belum
  menangani `reference_type = 'CONSUMPTION_REQUEST'`, jadi pembalikan mengoreksi
  ledger stok tetapi belum menurunkan `received_quantity` di baris pesanan.
  Menyusul di modul gudang; detailnya di `docs/database.md`.
- **Pengambilan butuh stok yang sudah diposting.** `pickup_entitlement()` menolak
  dengan `insufficient stock` bila saldo lokasi tidak cukup, dan modul gudang yang
  memposting penerimaan belum ada. Sebelum modul itu jadi, stok awal diposting
  lewat SQL (lihat "Menyiapkan stok awal (sementara)") atau dicatat dengan centang
  override yang hanya muncul untuk `ADMIN` — dan override itu tetap tercatat di
  `audit_logs`.
- **Pindai QR belum jalan di semua browser.** `BarcodeDetector` baru ada di Chrome
  dan Edge; di Safari dan Firefox tombol kameranya melaporkan "tidak didukung" dan
  operator memakai kolom tempel/ketik token di bawahnya. Kamera juga tidak pernah
  dinyalakan sebelum operator menekan tombolnya, jadi stasiun yang tidak memindai
  tidak akan ditanyai izin kamera.

## Model keamanan

Tiga lapis, dari yang paling menentukan:

1. **Row level security di Postgres.** Ini batas yang sebenarnya. Semua view
   memakai `security_invoker = true` supaya ikut policy pemanggil, dan `anon`
   dicabut dari seluruh tabel maupun view.
2. **`requireStaffProfile()` di layout dan halaman.** Cek otoritatif sisi
   server sebelum render.
3. **`src/proxy.ts`.** Cek optimistis supaya request tanpa hak tidak sampai
   me-render halaman. Sesuai dokumentasi Next, Proxy bukan solusi otorisasi.

Detail per tabel dan per role ada di `docs/database.md`.
