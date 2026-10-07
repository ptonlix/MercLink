-- Product image metadata. Bytes stay in the configured object bucket, not in PostgreSQL.
-- merchant_id is required text and intentionally has no foreign key to merchants.

CREATE TABLE product_images (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_content_type CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT product_images_byte_size CHECK (byte_size > 0 AND byte_size <= 5242880)
);
