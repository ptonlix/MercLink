-- MercLink schema. One file because this database has never been migrated.
-- Do not add rename or drop migrations for names that were never shipped.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Identity and access. SMS send counts live in Redis, not in a table.

CREATE TABLE admins (
  id text PRIMARY KEY,
  phone text NOT NULL,
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX admins_phone_active_uidx ON admins (phone) WHERE deleted_at IS NULL;

CREATE TABLE merchants (
  id text PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  password_hash text NOT NULL,
  status text NOT NULL,
  created_by text NOT NULL REFERENCES admins (id),
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT merchants_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX merchants_phone_active_uidx ON merchants (phone) WHERE deleted_at IS NULL;

CREATE TABLE buyers (
  id text PRIMARY KEY,
  phone text NOT NULL,
  email text,
  password_hash text NOT NULL,
  phone_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX buyers_phone_active_uidx ON buyers (phone) WHERE deleted_at IS NULL;

CREATE TABLE api_keys (
  id text PRIMARY KEY,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  prefix text NOT NULL,
  hash text NOT NULL,
  scopes text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT api_keys_owner_type_check CHECK (owner_type IN ('merchant', 'buyer'))
);

CREATE INDEX api_keys_hash_idx ON api_keys (hash);

CREATE TABLE oauth_grants (
  id text PRIMARY KEY,
  owner_type text NOT NULL,
  owner_id text NOT NULL,
  client_name text NOT NULL,
  scopes text[] NOT NULL,
  refresh_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT oauth_grants_owner_type_check CHECK (owner_type IN ('merchant', 'buyer'))
);

CREATE INDEX oauth_grants_owner_idx ON oauth_grants (owner_type, owner_id);

CREATE TABLE used_captcha_params (
  captcha_hash text PRIMARY KEY,
  used_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registration_challenges (
  id text PRIMARY KEY,
  phone text NOT NULL,
  captcha_hash text NOT NULL,
  sms_verified_at timestamptz,
  wrong_checks integer NOT NULL DEFAULT 0,
  invalidated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX registration_challenges_phone_idx ON registration_challenges (phone, created_at DESC);

CREATE TABLE oidc_records (
  model text NOT NULL,
  id text NOT NULL,
  payload jsonb NOT NULL,
  grant_id text,
  user_code text,
  uid text,
  expires_at timestamptz,
  PRIMARY KEY (model, id)
);

CREATE INDEX oidc_records_grant_idx ON oidc_records (grant_id);
CREATE INDEX oidc_records_user_code_idx ON oidc_records (model, user_code);
CREATE INDEX oidc_records_uid_idx ON oidc_records (model, uid);

CREATE TABLE oauth_signing_keys (
  kid text PRIMARY KEY,
  jwk jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Catalog books, fields, products, axes, and sellable variants.

CREATE TABLE catalogs (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  schema_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT catalogs_name_not_blank CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT catalogs_currency_code CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT catalogs_revision_nonneg CHECK (schema_revision >= 0)
);

CREATE INDEX catalogs_merchant_active ON catalogs (merchant_id) WHERE deleted_at IS NULL;

CREATE TABLE schema_revisions (
  id text PRIMARY KEY,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  revision integer NOT NULL,
  op text NOT NULL,
  before jsonb,
  after jsonb,
  affected_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schema_revisions_catalog_revision UNIQUE (catalog_id, revision),
  CONSTRAINT schema_revisions_affected_nonneg CHECK (affected_count >= 0)
);

CREATE TABLE product_fields (
  id text PRIMARY KEY,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL,
  required boolean NOT NULL,
  choices jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CONSTRAINT product_fields_catalog_key UNIQUE (catalog_id, key),
  CONSTRAINT product_fields_type CHECK (type IN ('text', 'number', 'boolean', 'single-select')),
  CONSTRAINT product_fields_status CHECK (status IN ('active', 'retired')),
  CONSTRAINT product_fields_choices_json CHECK (choices IS NULL OR jsonb_typeof(choices) = 'array')
);

CREATE INDEX product_fields_catalog ON product_fields (catalog_id);

CREATE TABLE products (
  id text PRIMARY KEY,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  title text NOT NULL,
  status text NOT NULL,
  cover text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT products_status CHECK (status IN ('on', 'off')),
  CONSTRAINT products_fields_object CHECK (jsonb_typeof(fields) = 'object'),
  CONSTRAINT products_revision_nonneg CHECK (schema_revision >= 0)
);

CREATE INDEX products_catalog_active ON products (catalog_id) WHERE deleted_at IS NULL;

CREATE TABLE product_axes (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id),
  key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_axes_product_key UNIQUE (product_id, key),
  CONSTRAINT product_axes_position_nonneg CHECK (position >= 0)
);

CREATE TABLE variants (
  id text PRIMARY KEY,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  product_id text NOT NULL REFERENCES products (id),
  sku text,
  option_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  price integer NOT NULL,
  stock integer,
  status text NOT NULL,
  cover text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT variants_status CHECK (status IN ('on', 'off')),
  CONSTRAINT variants_price_nonneg CHECK (price >= 0),
  CONSTRAINT variants_stock_nonneg CHECK (stock IS NULL OR stock >= 0),
  CONSTRAINT variants_option_values_object CHECK (jsonb_typeof(option_values) = 'object')
);

CREATE UNIQUE INDEX variants_catalog_sku_active
  ON variants (catalog_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX variants_product_axes_active
  ON variants (product_id, option_values)
  WHERE deleted_at IS NULL;

CREATE INDEX variants_product_active ON variants (product_id) WHERE deleted_at IS NULL;

-- Orders, lines, and payments. Cross-slice foreign keys are added below.
CREATE TABLE orders (
  id text PRIMARY KEY,
  buyer_id text NOT NULL,
  oauth_grant_id text NOT NULL,
  client_order_no text NOT NULL,
  currency text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  paid_at timestamptz,
  expires_at timestamptz NOT NULL,
  CONSTRAINT orders_status_check CHECK (status IN ('pending', 'paid', 'closed')),
  CONSTRAINT orders_amount_check CHECK (amount >= 0),
  CONSTRAINT orders_buyer_client_order_no_unique UNIQUE (buyer_id, client_order_no)
);

CREATE INDEX orders_status_expires_at_idx ON orders (status, expires_at);

CREATE TABLE order_items (
  id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES orders (id),
  catalog_id text NOT NULL,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  title_snapshot text NOT NULL,
  variant_snapshot jsonb NOT NULL,
  price_snapshot integer NOT NULL,
  fields_snapshot jsonb NOT NULL,
  schema_revision integer NOT NULL,
  qty integer NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT order_items_qty_check CHECK (qty > 0),
  CONSTRAINT order_items_amount_check CHECK (amount >= 0),
  CONSTRAINT order_items_price_check CHECK (price_snapshot >= 0)
);

CREATE INDEX order_items_catalog_id_idx ON order_items (catalog_id);
CREATE INDEX order_items_order_id_idx ON order_items (order_id);

CREATE TABLE payments (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES orders (id),
  provider text NOT NULL,
  provider_trade_no text,
  status text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  paid_at timestamptz,
  CONSTRAINT payments_status_check CHECK (status IN ('pending', 'paid', 'closed')),
  CONSTRAINT payments_amount_check CHECK (amount >= 0)
);

CREATE UNIQUE INDEX payments_provider_trade_no_unique
  ON payments (provider_trade_no)
  WHERE provider_trade_no IS NOT NULL;

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

-- Cross-slice foreign keys. A fresh database has no orphan rows. If one exists, fail instead of deleting it.

DO $$
DECLARE
  orphan_ids text;
BEGIN
  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM catalogs AS catalog
  WHERE NOT EXISTS (
    SELECT 1 FROM merchants AS merchant WHERE merchant.id = catalog.merchant_id
  );
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan catalogs: %', orphan_ids;
  END IF;

  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM orders AS purchase
  WHERE NOT EXISTS (
    SELECT 1 FROM buyers AS buyer WHERE buyer.id = purchase.buyer_id
  );
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan orders: %', orphan_ids;
  END IF;

  SELECT string_agg(id, ', ' ORDER BY id) INTO orphan_ids
  FROM order_items AS item
  WHERE NOT EXISTS (SELECT 1 FROM catalogs AS catalog WHERE catalog.id = item.catalog_id)
     OR NOT EXISTS (SELECT 1 FROM products AS product WHERE product.id = item.product_id)
     OR NOT EXISTS (SELECT 1 FROM variants AS variant WHERE variant.id = item.variant_id);
  IF orphan_ids IS NOT NULL THEN
    RAISE EXCEPTION 'orphan order_items: %', orphan_ids;
  END IF;
END $$;

ALTER TABLE catalogs
  ADD CONSTRAINT catalogs_merchant_id_fkey FOREIGN KEY (merchant_id) REFERENCES merchants (id);

ALTER TABLE orders
  ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES buyers (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_catalog_id_fkey FOREIGN KEY (catalog_id) REFERENCES catalogs (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id);

ALTER TABLE order_items
  ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES variants (id);
