# Monitoring Konsumsi

Website monitoring divisi konsumsi kepanitiaan event: anggaran vs realisasi,
klaim konsumsi, jadwal & vendor, dan stok. Next.js 16 App Router + Supabase,
dideploy ke Vercel.

Status: **Fase 0 selesai** — schema + RLS, autentikasi staff, shell aplikasi,
halaman Dashboard dan Anggaran. Modul perencanaan, vendor, gudang, pengambilan,
rekonsiliasi, dan pengguna belum dibangun (tampil sebagai "Nanti" di navigasi).

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # lalu isi nilainya
npm run dev
```

Tanpa `.env.local` yang valid, aplikasi tetap jalan dan halaman `/login`
menampilkan pesan setup, bukan error.

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

## Tes database

```bash
psql "$DATABASE_URL" -f supabase/tests/consumption_domain_tests.sql
psql "$DATABASE_URL" -f supabase/tests/budget_tests.sql
```

Keduanya berjalan dalam transaksi (tidak meninggalkan data) dan diakhiri
`raise notice` bila lolos. Tes domain mencakup penerimaan, transfer, idempotensi
pengambilan, pengambilan grup sebagian, pembalikan, saldo stok, dan pelanggaran
constraint. Tes anggaran mencakup transisi status pembayaran, refund negatif,
rollup pagu, isolasi tagihan yang di-void, dan dua uji constraint negatif.

## Deploy ke Vercel

Import repo, lalu set dua environment variable yang sama
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) untuk
Production, Preview, dan Development. Tidak ada variabel rahasia lain yang
diperlukan.

Tambahkan URL deployment ke **Supabase → Authentication → URL Configuration**
(Site URL dan Redirect URLs).

## Struktur

```
src/app/(app)/         halaman di balik login (shell + navigasi)
src/app/login/         halaman masuk
src/components/        UI; komponen client hanya bila perlu
src/lib/auth/          peta role→route dan resolusi profil sisi server
src/lib/dashboard/     query domain, terpisah dari komponen
src/lib/supabase/      client browser dan server (@supabase/ssr)
src/proxy.ts           Proxy Next 16 (pengganti middleware), cek optimistis
supabase/migrations/   schema, append-only
supabase/tests/        tes SQL
docs/                  spesifikasi database, stok, pengambilan, rekonsiliasi, anggaran
```

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
