# pos_basket in PostgreSQL

The POS basket feed (SQL Server `dbo.POSBasket`), loaded from [data/pos_basket_august2.csv.gz](../../data/pos_basket_august2.csv.gz) into the PostgreSQL database `pos_basket` on `localhost:5432`, as one table: `public.pos_basket_line`.

One row is one scanned line in one basket (checkout). It holds 1,258,956 lines in 434,755 baskets from 67 stores, for 2026-08-16 to 2026-08-22. Column meanings and business rules come from the data owner's review in [data/POSBasket_KnowledgeModel_Review 1.xlsx](../../data/), and are stored as column comments (`\d+ pos_basket_line`).

## Files

| File | Contents |
|---|---|
| `load.ps1` | Drops and recreates `pos_basket`, then runs `01-load.sql` on the CSV. It unzips `pos_basket_august2.csv.gz` first when there's no plain `pos_basket_august2.csv`. |
| `01-load.sql` | Table, typed load through a text staging table, indexes, comments |

## Load

```powershell
$env:PGPASSWORD = "<postgres password>"
.\db\pos_basket\load.ps1
```

Run it from the `temp` folder. It takes about a minute. If PostgreSQL isn't in `%USERPROFILE%postgresql-18pgsqlin`, add `-PsqlBin "<PostgreSQL's bin folder>"`. Everything runs in one transaction, so a failure leaves an empty database.

## Changes from the CSV

| CSV | Table |
|---|---|
| Last row cut off partway (basket `87F63136-…`, store 54107), the workbook's "corrupt row" | Not loaded. The owner said it can be deleted. `load.ps1` drops the incomplete last line. |
| Codes as floats (`psa_cd` `14.0`, `promo_item_id` `310061.0`) | `smallint` / `integer`. The load fails if any code isn't a whole number. |
| `idtuuid` text, `is_ebt` `True`/`False` | `uuid`, `boolean` |
| `amount` float | `numeric` with no fixed scale. 4,669 PROMO lines carry fractions of a cent, because a mix-and-match discount is split across its items, so rounding to cents would lose $0.79. |
| `true_item_id` empty on 2 lines (scanned code 320131) | Kept NULL. The graph sync uses `single_item_id` for them. |

`row_hash` is unique on every loaded row and is the primary key.

## Where this data differs from the review workbook

The workbook was measured on the SQL Server table; this CSV differs in two places:

| | Workbook | This CSV |
|---|---|---|
| `SUM(amount)` | 8,144,077.26 | 8,144,077.28 |
| `qty` on return lines | NULL, `SUM(qty)` = 1,437,033 | −1 to −11 on REGULAR and DEPARTMENT SALE return lines, so `SUM(qty)` = 1,435,315 (net of returns) |

Everything else checked matches: line, basket, store and item counts, the date range, line type counts, basket attributes identical on every line of a basket, and `psa_cd` / `cat_cd` stable per item.
