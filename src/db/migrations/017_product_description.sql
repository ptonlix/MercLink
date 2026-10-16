-- Optional product description and the order-line copy of it.
-- Fail when a catalog field already uses this key. Do not copy or retire that field.
-- Do not backfill. Existing products and order lines keep these columns null.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM product_fields WHERE key = 'description') THEN
    RAISE EXCEPTION 'product_fields.key description already exists';
  END IF;
END $$;

ALTER TABLE products
  ADD COLUMN description text;

ALTER TABLE order_items
  ADD COLUMN description_snapshot text;
