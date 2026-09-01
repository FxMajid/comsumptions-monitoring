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
