# Model Pengambilan

Pengambilan (pickup) adalah pemenuhan sebuah entitlement. Ini bukan pencatatan
kehadiran, dan bukan distribusi stok antar lokasi.

## Yang dicatat setiap pengambilan

penerima, entitlement, item, slot, kuantitas, lokasi stok, operator, waktu,
idempotency key, dan status.

## Kuantitas entitlement

```text
entitlement = penerima + item + slot + kuantitas
```

Untuk penerima grup, kuantitas mengikuti kuantitas grup — grup tidak dipecah
menjadi orang-orang fiktif.

```text
PIJAR RETAIL
beneficiary_type   = GROUP
beneficiary qty    = 7
entitlement qty    = 7
```

## Pengambilan grup sebagian

Satu entitlement boleh dipenuhi lewat beberapa transaksi:

```text
Entitlement = 7
Pickup 1    = 3
Pickup 2    = 2
Pickup 3    = 2
Total       = 7
```

RPC menolak total pengambilan `POSTED` yang melebihi kuantitas entitlement,
kecuali override manual dipakai secara eksplisit.

## Status entitlement dihitung, bukan disimpan

View `entitlement_statuses` menurunkan status dari pembatalan, kedaluwarsa, dan
kuantitas pengambilan yang sudah `POSTED`: `PENDING`, `PARTIALLY_PICKED`,
`PICKED_UP`, `EXPIRED`, `CANCELLED`.

Status tidak disimpan sebagai kolom karena kolom seperti itu akan melenceng dari
transaksi pengambilan yang sebenarnya terjadi.

## Token klaim & QR

Peserta tidak punya akun. Yang dipegangnya satu token acak 32 byte
(base64url) di dalam QR, dan token itu **bearer secret**: siapa pun yang
memegangnya bisa melihat hak konsumsi penerima tersebut.

Karena itu tiga hal wajib, dan ketiganya dijaga di database:

- `expires_at` tidak nullable — tautan tanpa masa berlaku akan tetap membuka
  data peserta setelah event selesai.
- Pencabutan selalu mungkin lewat `revoked_at` + `revocation_reason`.
- Hanya satu token hidup per penerima, dijaga index unik parsial
  `idx_beneficiary_access_tokens_live`. Mengganti QR berarti mencabut yang lama,
  jadi QR yang sudah dicetak tidak pernah diam-diam tetap berlaku berdampingan
  dengan penggantinya.

### Hanya hash yang disimpan

`beneficiary_access_tokens.token_hash` menyimpan SHA-256 dari token, bukan
tokennya. Tabel ini bocor pun tidak menghasilkan QR yang bisa dipakai.

Konsekuensinya yang harus diterima: **token mentah hanya tampil sekali**, di
layar yang menerbitkannya. Tautan yang hilang tidak bisa dicari, hanya bisa
diganti dengan yang baru — dan menerbitkan yang baru otomatis mencabut yang lama.
Itu sebabnya halaman penerbitan menampilkan daftar tautan dalam format
tab-separated, supaya bisa ditempel ke spreadsheet untuk mail merge sebelum
ditinggalkan.

### Dua pintu untuk satu token

| Rute | Siapa | Yang terjadi |
| --- | --- | --- |
| `/klaim/{token}` | peserta, tanpa login | daftar haknya sendiri + QR untuk ditunjukkan ke petugas |
| `/pengambilan/t/{token}` | staff, setelah memindai | redirect ke halaman pencatatan penerima itu |

Bedanya bukan hanya tampilan, tapi seberapa banyak yang boleh diberitahu:

- Sisi peserta menjawab **sama** untuk token tidak dikenal, dicabut, dan
  kedaluwarsa. Membedakannya akan mengubah halaman itu menjadi alat untuk menebak
  token mana yang ada.
- Sisi operator menyebut alasannya — dicabut, kedaluwarsa, atau tidak dikenal —
  beserta waktu dan alasan pencabutan, karena ada orang yang sedang berdiri di
  meja menunggu jawaban. Operator sudah lolos autentikasi dan memang boleh
  membaca tabel token.

### Jalur data peserta

`anon` tidak menyentuh tabel mana pun. Halaman peserta hanya memanggil dua fungsi
`security definer`, `resolve_claim_token()` dan `get_claim_entitlements()`,
keduanya menyaring pada satu baris token dan **tidak menerima parameter
beneficiary id** — jadi tidak ada parameter yang bisa dibengkokkan ke arah hak
orang lain. Keduanya juga menolak token yang dicabut, kedaluwarsa, atau milik
penerima nonaktif, sehingga penolakan terjadi di database, bukan di aplikasi.

Hasil kedua fungsi itu diparse Zod di `src/lib/domain/claim.ts`, bukan dicast:
ini satu-satunya permukaan yang dibuka ke pengunjung tanpa akun.

### Pemindaian di browser

Pemindai memakai `BarcodeDetector`, yang ada di Chrome dan Edge tetapi belum di
Safari dan Firefox. Kamera **hanya menyala setelah operator menekan tombol**, dan
di sebelahnya selalu ada kolom manual untuk menempel tautan atau token — jadi
stasiun yang browsernya tidak mendukung, atau yang izin kameranya ditolak, tetap
bisa bekerja.

## Idempotensi

`pickup_transactions.idempotency_key` unik secara global. Bila permintaan yang
sama diulang dengan key yang sama, `pickup_entitlement` mengembalikan id
transaksi yang lama dan tidak membuat pengambilan kedua. Ini yang membuat scan
QR ganda atau koneksi yang terputus tidak berujung stok terpotong dua kali.

## Transaksi atomik

`pickup_entitlement` menjalankan langkah berikut dalam satu transaksi
PostgreSQL:

1. Validasi role.
2. Validasi idempotency key.
3. Kunci idempotency key.
4. Kunci baris entitlement.
5. Validasi pembatalan dan kedaluwarsa.
6. Kunci kunci stok.
7. Validasi sisa kuantitas entitlement.
8. Validasi stok tersedia.
9. Buat header dan item pengambilan.
10. Buat transaksi stok `PICKUP` negatif.
11. Tulis audit log.

Bila satu langkah gagal, seluruh perubahan dibatalkan.

## Pembalikan

Pengambilan yang salah dibalik lewat `reverse_transaction` terhadap transaksi
stoknya. Pengambilan asli tetap tersimpan, pembalikan memulihkan stok, dan
header pengambilan ditandai `REVERSED`.
