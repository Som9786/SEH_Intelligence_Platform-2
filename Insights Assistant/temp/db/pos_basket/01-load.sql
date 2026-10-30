-- Loads the POSBasket CSV export (SQL Server dbo.POSBasket) into public.pos_basket_line.
-- Run by load.ps1, which passes the CSV path as the psql variable csv.
-- The CSV is read into an all-text staging table first, so every cast below is checked explicitly
-- rather than relying on COPY's parsing (codes arrive as "14.0", booleans as "False").

CREATE TEMP TABLE staging (
    idtuuid text, transaction_start_time text, transaction_end_time text, transaction_end_date text,
    str_num text, single_item_id text, single_item_desc text, true_item_id text, true_item_desc text,
    psa_cd text, cat_cd text, price_multiple text, line_type text, promo_item_id text, promo_desc text,
    is_ebt text, return_regular text, qty text, amount text, row_hash text, load_dte text
) ON COMMIT DROP;

-- \copy doesn't expand variables itself, so build the command in a variable first.
\set copy_csv '\\copy staging FROM ' :'csv' ' WITH (FORMAT csv, HEADER true)'
:copy_csv

-- One scanned line within one basket. Basket-level columns repeat on every line of the basket.
CREATE TABLE public.pos_basket_line (
    row_hash               varchar(50)  NOT NULL,
    idtuuid                uuid         NOT NULL,
    transaction_start_time timestamp(3) NOT NULL,
    transaction_end_time   timestamp(3) NOT NULL,
    transaction_end_date   date         NOT NULL,
    str_num                integer      NOT NULL,
    single_item_id         varchar(50)  NOT NULL,
    single_item_desc       varchar(50),
    -- NULL on 2 lines (scanned code 320131), which the graph sync falls back to single_item_id for.
    true_item_id           varchar(50),
    true_item_desc         varchar(50),
    psa_cd                 smallint,
    cat_cd                 smallint,
    price_multiple         smallint,
    line_type              varchar(50)  NOT NULL,
    promo_item_id          integer,
    promo_desc             varchar(100),
    is_ebt                 boolean      NOT NULL,
    return_regular         varchar(50)  NOT NULL,
    qty                    numeric(10,3),
    -- No fixed scale: PROMO discounts split across a mix-and-match deal carry fractions of a cent
    -- (e.g. -0.2341176470588235), and rounding them would change the total.
    amount                 numeric      NOT NULL,
    load_dte               timestamp(3),
    CONSTRAINT pos_basket_line_pk PRIMARY KEY (row_hash)
);

-- Codes are stored as floats in the source; refuse to load if any isn't a whole number.
DO $$
DECLARE bad bigint;
BEGIN
    SELECT count(*) INTO bad FROM staging
    WHERE (psa_cd IS NOT NULL AND psa_cd::numeric <> trunc(psa_cd::numeric))
       OR (cat_cd IS NOT NULL AND cat_cd::numeric <> trunc(cat_cd::numeric))
       OR (price_multiple IS NOT NULL AND price_multiple::numeric <> trunc(price_multiple::numeric))
       OR (promo_item_id IS NOT NULL AND promo_item_id::numeric <> trunc(promo_item_id::numeric));
    IF bad > 0 THEN
        RAISE EXCEPTION '% rows have fractional codes', bad;
    END IF;
END $$;

INSERT INTO public.pos_basket_line
SELECT row_hash, idtuuid::uuid, transaction_start_time::timestamp, transaction_end_time::timestamp,
       transaction_end_date::date, str_num::integer, single_item_id, single_item_desc, true_item_id, true_item_desc,
       psa_cd::numeric::smallint, cat_cd::numeric::smallint, price_multiple::numeric::smallint, line_type,
       promo_item_id::numeric::integer, promo_desc, is_ebt::boolean, return_regular, qty::numeric, amount::numeric,
       load_dte::timestamp
FROM staging;

CREATE INDEX pos_basket_line_basket ON public.pos_basket_line (idtuuid);
CREATE INDEX pos_basket_line_checkout ON public.pos_basket_line (transaction_end_time, idtuuid);
CREATE INDEX pos_basket_line_store_date ON public.pos_basket_line (str_num, transaction_end_date);
CREATE INDEX pos_basket_line_item ON public.pos_basket_line (true_item_id);

COMMENT ON TABLE public.pos_basket_line IS
    'One scanned line within one POS basket (source: SQL Server dbo.POSBasket). Basket attributes repeat on every line, '
    'so count baskets with COUNT(DISTINCT idtuuid). Discounts are their own PROMO rows with a negative amount, so SUM(amount) is net.';
COMMENT ON COLUMN public.pos_basket_line.idtuuid IS 'Basket ID: one checkout. Not unique per row.';
COMMENT ON COLUMN public.pos_basket_line.transaction_end_time IS 'Checkout time; use for time-of-day analysis.';
COMMENT ON COLUMN public.pos_basket_line.transaction_end_date IS 'Business date; use for daily reporting.';
COMMENT ON COLUMN public.pos_basket_line.str_num IS 'Store number.';
COMMENT ON COLUMN public.pos_basket_line.true_item_id IS 'Item sold (resolved pack or parent item). Use for item and basket analysis. dept* codes are non-merchandise department sales.';
COMMENT ON COLUMN public.pos_basket_line.psa_cd IS 'Product SubCategory Analysis code (main category). Independent of cat_cd.';
COMMENT ON COLUMN public.pos_basket_line.cat_cd IS 'Category code. Independent of psa_cd.';
COMMENT ON COLUMN public.pos_basket_line.price_multiple IS 'Units per pack. Never SUM.';
COMMENT ON COLUMN public.pos_basket_line.line_type IS 'REGULAR, PROMO (discount), DEPARTMENT SALE, REWARDS (7Rewards loyalty), COUPON, 7-DIGIT ITEM.';
COMMENT ON COLUMN public.pos_basket_line.promo_item_id IS 'Offer code; only on PROMO lines.';
COMMENT ON COLUMN public.pos_basket_line.is_ebt IS 'Basket paid with EBT / SNAP.';
COMMENT ON COLUMN public.pos_basket_line.return_regular IS 'regular or return, for the whole basket.';
COMMENT ON COLUMN public.pos_basket_line.qty IS 'Units sold. NULL on PROMO and return lines.';
COMMENT ON COLUMN public.pos_basket_line.amount IS 'Signed line amount, excluding tax and bottle deposit. Negative for discounts, rewards, coupons and returns.';
COMMENT ON COLUMN public.pos_basket_line.load_dte IS 'ETL load time; populated on a minority of rows. Not meaningful.';

ANALYZE public.pos_basket_line;
