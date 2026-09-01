# Model Rekonsiliasi

Rekonsiliasi membandingkan tahap rencana → pesanan → vendor → stok →
pengambilan dengan rumus yang konsisten.

## Sumber angka per tahap

| Tahap | Sumber |
| --- | --- |
| Rencana | `consumption_plans.planned_quantity` |
| Dipesan | `consumption_request_items.requested_quantity` |
| Dikirim | `consumption_request_items.sent_quantity` |
| Diterima | `consumption_request_items.received_quantity` dan ledger `RECEIVING` |
| Masuk gudang pusat | ledger `RECEIVING` |
| Didistribusikan | `TRANSFER_OUT` dari pusat atau `TRANSFER_IN` ke area |
| Diambil | ledger `PICKUP` dan pickup item yang `POSTED` |
| Sisa | `stock_balances` |
| Rusak/terbuang | ledger `WASTE` |
| Penyesuaian | ledger `ADJUSTMENT` |
| Selisih | aktual dikurangi baseline per tahap |

## Selisih pesanan

`consumption_request_variances` menyediakan:

```text
sent_vs_requested     = sent_quantity - requested_quantity
received_vs_sent      = received_quantity - sent_quantity
received_vs_requested = received_quantity - requested_quantity
```

## Rekonsiliasi stok fisik

Per lokasi/item/slot:

```text
system_quantity = saldo ledger
variance        = physical_quantity - system_quantity
```

Bila disetujui, selisih diposting sebagai transaksi `ADJUSTMENT`.

## Rumus tahap gudang pusat

```text
received = distributed_out + central_remaining + central_waste + central_adjustment
```

## Rumus seluruh jaringan

```text
received = picked_up + remaining + waste + adjustment
```

Transfer internal saling menghapus di level jaringan karena setiap
`TRANSFER_OUT` selalu berpasangan dengan satu `TRANSFER_IN`.

## Contoh

```text
Rencana              = 300
Dipesan              = 300
Dikirim vendor       = 300
Diterima             = 295
Masuk gudang pusat   = 295
Dikirim ke area      = 290
Diambil              = 280
Rusak                = 0
Sisa menurut sistem  = 10
Hitung fisik         =  9
Selisih              = -1
Penyesuaian          = -1
```
