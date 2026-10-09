-- Saved pay URL, order-time connection address, and finite-stock grace.
-- Existing payment rows stay on provider alipay. New columns are empty.
-- Do not put provider or exception status on the order header.

ALTER TABLE payments
  ADD COLUMN action_url text,
  ADD COLUMN client_address text,
  ADD COLUMN stock_release_at timestamptz;

CREATE TABLE unapplied_receipts (
  id text PRIMARY KEY,
  payment_id text NOT NULL UNIQUE REFERENCES payments (id),
  provider_trade_no text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL,
  failure_reason text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT unapplied_receipts_status_check CHECK (
    status IN ('open', 'fulfilled_manually', 'refunded', 'refund_failed')
  ),
  CONSTRAINT unapplied_receipts_amount_check CHECK (amount >= 0)
);
