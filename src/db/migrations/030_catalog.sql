-- Catalog books, current field definitions, products, and sellable variants.
-- merchant_id is required text and intentionally has no foreign key to merchants.
-- The integration migration 050_foreign_keys.sql owns that constraint.

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
  options jsonb,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CONSTRAINT product_fields_catalog_key UNIQUE (catalog_id, key),
  CONSTRAINT product_fields_type CHECK (type IN ('text', 'number', 'boolean', 'single-select')),
  CONSTRAINT product_fields_status CHECK (status IN ('active', 'retired')),
  CONSTRAINT product_fields_options_json CHECK (options IS NULL OR jsonb_typeof(options) = 'array')
);

CREATE INDEX product_fields_catalog ON product_fields (catalog_id);

CREATE TABLE products (
  id text PRIMARY KEY,
  catalog_id text NOT NULL REFERENCES catalogs (id),
  title text NOT NULL,
  status text NOT NULL,
  cover text,
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT products_status CHECK (status IN ('on', 'off')),
  CONSTRAINT products_attrs_object CHECK (jsonb_typeof(attrs) = 'object'),
  CONSTRAINT products_revision_nonneg CHECK (schema_revision >= 0)
);

CREATE INDEX products_catalog_active ON products (catalog_id) WHERE deleted_at IS NULL;

CREATE TABLE product_options (
  id text PRIMARY KEY,
  product_id text NOT NULL REFERENCES products (id),
  key text NOT NULL,
  label text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_options_product_key UNIQUE (product_id, key),
  CONSTRAINT product_options_position_nonneg CHECK (position >= 0)
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

CREATE UNIQUE INDEX variants_product_options_active
  ON variants (product_id, option_values)
  WHERE deleted_at IS NULL;

CREATE INDEX variants_product_active ON variants (product_id) WHERE deleted_at IS NULL;
