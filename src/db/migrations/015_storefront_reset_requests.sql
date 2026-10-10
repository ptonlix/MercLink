-- Agent may request a storefront reset. Only an admin session may execute it.

CREATE TABLE storefront_reset_requests (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  decided_at timestamptz,
  CONSTRAINT storefront_reset_requests_status_check CHECK (
    status IN ('pending', 'executed', 'rejected')
  )
);
