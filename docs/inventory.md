# Model Stok

Stok berbasis transaksi dan **hanya ledger**. Tidak boleh ada tabel saldo yang
bisa diubah langsung, seperti:

```sql
update inventory set quantity = ...
```

## Rumus saldo

```text
stock_balance(event, item, slot, location)
= sum(inventory_transactions.quantity)
```

Yang tersedia di database:

- fungsi `get_stock_balance(event_id, item_id, location_id, slot_id)`
- view `stock_balances`

## Jenis transaksi

| Jenis | Tanda | Keterangan |
| --- | --- | --- |
| `RECEIVING` | positif | penerimaan dari vendor |
| `TRANSFER_OUT` | negatif | keluar dari lokasi asal |
| `TRANSFER_IN` | positif | masuk ke lokasi tujuan |
| `PICKUP` | negatif | entitlement dipenuhi |
| `WASTE` | negatif | rusak, kedaluwarsa, tidak terpakai |
| `ADJUSTMENT` | bertanda | hasil rekonsiliasi yang disetujui |
| `REVERSAL` | bertanda | kebalikan dari transaksi asal |

## Alur penerimaan

`receive_consumption` mengunci baris request item dan kunci stok tujuan,
menambah `received_quantity`, memposting transaksi `RECEIVING`, memperbarui
status request, lalu menulis audit — semuanya dalam satu transaksi.

## Alur transfer

`transfer_inventory` memvalidasi stok asal, membuat dokumen distribusi, lalu
memposting kedua sisi:

```text
Gudang Pusat  -100  TRANSFER_OUT
Stok Area     +100  TRANSFER_IN
```

## Strategi konkurensi

Membaca saldo saja tidak cukup untuk operasi paralel. Fungsi RPC memakai
advisory lock ber-scope transaksi per event, item, dan lokasi sebelum memeriksa
stok tersedia dan memposting pergerakan.

Ini mencegah dua operator bersamaan sama-sama mengambil unit stok terakhir.

## Pembalikan

Transaksi tidak pernah dihapus. Pergerakan yang salah dikoreksi lewat
`reverse_transaction`: baris `REVERSAL` baru dengan kuantitas berlawanan, dan
metadata pembalikan ditandai pada baris aslinya.
