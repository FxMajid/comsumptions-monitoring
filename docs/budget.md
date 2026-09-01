# Model Anggaran

Tiga angka yang sering dicampur dan di sini dipisah tegas:

| Istilah | Arti | Sumber |
| --- | --- | --- |
| Pagu (`allocated`) | batas yang disetujui | `budgets.allocated_amount` |
| Tagihan (`invoiced`) | komitmen yang sudah masuk, belum tentu dibayar | `expenses.amount` |
| Dibayar (`paid`) | kas yang benar-benar keluar | `expense_payments.amount` |

Turunannya:

```text
outstanding = invoiced - paid      -- utang ke vendor
remaining   = allocated - invoiced -- sisa pagu
```

`remaining` sengaja memakai `invoiced`, bukan `paid`. Sisa pagu yang dihitung
dari kas keluar akan terlihat besar padahal tagihannya sudah masuk, dan itu
justru cara paling mudah untuk kebobolan anggaran.

## Kenapa status pembayaran tidak disimpan

Tidak ada kolom `payment_status` di `expenses`. Statusnya dihitung view
`expense_payment_statuses` dari total pembayaran yang benar-benar tercatat:

| Status | Kondisi |
| --- | --- |
| `VOID` | `expenses.voided_at` terisi |
| `UNPAID` | belum ada pembayaran |
| `PARTIALLY_PAID` | 0 < dibayar < tagihan |
| `PAID` | dibayar = tagihan |
| `OVERPAID` | dibayar > tagihan |

Kolom status yang disimpan akan melenceng begitu ada satu pembayaran yang
diinput tanpa memperbarui kolomnya. View tidak bisa melenceng.

## Refund adalah baris negatif

`expense_payments` adalah ledger bertanda dengan `check (amount <> 0)`.
Pengembalian dana dicatat sebagai baris negatif, bukan dengan menghapus atau
mengedit pembayaran lama. Jejak kas tetap utuh, dan tagihan yang tadinya `PAID`
otomatis kembali ke `PARTIALLY_PAID`.

## Pembatalan tagihan

Tagihan salah dibatalkan dengan `voided_at` + `void_reason`; constraint
`check (voided_at is null or void_reason is not null)` memastikan tidak ada
pembatalan tanpa alasan. Tagihan `VOID` dikecualikan dari `budget_realizations`,
tetapi barisnya tetap ada.

## Nilai pesanan vendor dipisah

`consumption_cost_projections` menghitung nilai pesanan dari
`consumption_request_items.requested_quantity × unit_price`. View ini **tidak**
digabung ke view anggaran, supaya satu belanja tidak dihitung dua kali: sekali
sebagai pesanan dan sekali lagi sebagai tagihan.

## Bukti bayar

`expenses.receipt_path` menyimpan object path di bucket privat `receipts`, bukan
URL. Akses selalu lewat signed URL berumur pendek, jadi path yang bocor bukan
berarti dokumennya bocor.

## Rollup

- `budget_realizations`: per pos anggaran, plus `utilization_percent`
  (`invoiced / allocated`, `null` bila pagu 0).
- `event_budget_summary`: total per event, mengecualikan pos `CANCELLED`.

Halaman `/anggaran` menampilkan `budget_realizations` per baris dengan total dari
`event_budget_summary`, sehingga baris `CANCELLED` terlihat tetapi tidak ikut
dijumlahkan.

## Siapa yang boleh menulis

Baca: semua enam role. Tulis `budgets`, `expenses`, `expense_payments`: hanya
`ADMIN` dan `CONSUMPTION_MANAGER`. `anon` dicabut seluruhnya.
