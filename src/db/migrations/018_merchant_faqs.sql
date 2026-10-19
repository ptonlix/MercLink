-- One store FAQ row per merchant (product_id IS NULL) and one row per product.
-- Soft-delete only sets products.deleted_at. Do not cascade-delete these rows.
-- Do not backfill and do not insert default questions.

CREATE TABLE merchant_faqs (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants (id),
  product_id text REFERENCES products (id),
  published boolean NOT NULL DEFAULT false,
  items jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchant_faqs_items_array CHECK (jsonb_typeof(items) = 'array')
);

CREATE UNIQUE INDEX merchant_faqs_store_uidx
  ON merchant_faqs (merchant_id)
  WHERE product_id IS NULL;

CREATE UNIQUE INDEX merchant_faqs_product_uidx
  ON merchant_faqs (product_id);
