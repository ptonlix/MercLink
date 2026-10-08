-- Channel is chosen once and stored on the payment, not the order header.
-- Existing rows are desktop. Old inserts that omit the column also land on desktop.

ALTER TABLE payments
  ADD COLUMN channel text NOT NULL DEFAULT 'desktop';

ALTER TABLE payments
  ADD CONSTRAINT payments_channel_check CHECK (channel IN ('desktop', 'mobile'));
