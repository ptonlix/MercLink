-- Commerce tables. No cross-slice foreign keys. Payment channel stays on payments, not orders.
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
