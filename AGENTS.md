<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Instruksi Project

## Produk

Website monitoring untuk divisi konsumsi kepanitiaan event (Honda Bikers Day
2026). Empat sumbu utama: anggaran vs realisasi, klaim konsumsi via QR,
jadwal & vendor, serta stok.

Tim panitia login. Peserta/penerima tidak punya akun — akses mereka lewat
tautan atau QR bertoken.

## Stack

- Next.js 16 App Router, TypeScript strict, Tailwind CSS v4
- Supabase (Postgres, Auth, Storage) lewat `@supabase/ssr`
- Zod untuk validasi data eksternal
- Lucide React untuk ikon
- Deploy: Vercel

## Hal khas Next.js 16 di project ini

- **Middleware bernama Proxy.** File-nya `src/proxy.ts`, mengekspor
  `async function proxy(request)` dan `config.matcher`. Dokumentasi Next
  menegaskan Proxy "should not be used as a full session management or
  authorization solution" — di sini fungsinya hanya cek optimistis.
- `searchParams` di props page bersifat async dan harus di-`await`.
- Tailwind v4 tanpa `tailwind.config.js`. Token ada di blok `@theme` dalam
  `src/app/globals.css`. `@theme` hanya boleh di level teratas; override dark
  mode memakai `:root` biasa di dalam `@media`.

## Aturan koding

- TypeScript strict. Jangan pakai `any`.
- Logika domain (query, perhitungan) terpisah dari komponen UI.
- Client Component hanya bila memang butuh API browser atau interaksi.
- Angka uang dan kuantitas datang dari Postgres sebagai string. Konversi lewat
  `toNumber()` di `src/lib/format.ts`, jangan `parseFloat` bertebaran.
- Validasi semua data eksternal.
- Jalankan `npm run lint` dan `npx tsc --noEmit` setelah perubahan berarti.

## Aturan database

- **RLS adalah batas keamanan yang sebenarnya.** Cek di proxy dan route hanya
  lapis tambahan.
- Setiap view **wajib** `with (security_invoker = true)`. Tanpa itu view berjalan
  sebagai owner dan melewati RLS tabel di bawahnya.
- `revoke all ... from anon` untuk setiap tabel dan view baru.
- Fungsi `security definer` wajib `set search_path = public`.
- Stok hanya ledger bertanda. Tidak ada kolom saldo yang bisa diedit.
- Status (pengambilan, pembayaran) dihitung di view, tidak disimpan sebagai
  kolom.
- Koreksi pakai baris pembalik atau void beralasan, bukan `delete`/`update`.
- Operasi yang menyentuh stok atau uang lewat RPC dengan advisory lock dan
  idempotency key.
- Migrasi bersifat append-only: tambah file baru, jangan edit yang sudah jalan
  di database.

## Keamanan

- **Service role key tidak boleh masuk kode browser** dan tidak boleh diberi
  awalan `NEXT_PUBLIC_`.
- Jangan commit `.env.local` atau kredensial apa pun.
- Bukti bayar dan lampiran disimpan di bucket privat, diakses via signed URL.
  Simpan object path, bukan URL publik.
- Endpoint bertoken untuk peserta harus punya masa berlaku dan tidak boleh
  membocorkan data peserta lain.

## Desain

- Desktop-first untuk dashboard, tetapi halaman operasional (pengambilan,
  gudang) harus terpakai di ponsel.
- Merah sebagai aksen utama; hijau/amber/merah-alert hanya untuk status.
- Angka pakai `tabular-nums` (`class="numeric"`) supaya kolom tidak bergeser.
- Bahasa antarmuka: Indonesia.
