-- One public profile row per merchant account.
-- Do not copy the admin-provisioned merchants.name into this table.

CREATE TABLE merchant_profiles (
  merchant_id text PRIMARY KEY REFERENCES merchants (id),
  display_name text NOT NULL,
  summary text NOT NULL,
  website_url text,
  logo_url text,
  area_served text,
  address text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchant_profiles_display_name_len CHECK (char_length(display_name) <= 40),
  CONSTRAINT merchant_profiles_summary_len CHECK (char_length(summary) <= 300),
  CONSTRAINT merchant_profiles_website_len CHECK (website_url IS NULL OR char_length(website_url) <= 200),
  CONSTRAINT merchant_profiles_logo_len CHECK (logo_url IS NULL OR char_length(logo_url) <= 200),
  CONSTRAINT merchant_profiles_area_len CHECK (area_served IS NULL OR char_length(area_served) <= 40),
  CONSTRAINT merchant_profiles_address_len CHECK (address IS NULL OR char_length(address) <= 120),
  CONSTRAINT merchant_profiles_published_text CHECK (
    published = false
    OR (char_length(btrim(display_name)) > 0 AND char_length(btrim(summary)) > 0)
  )
);

CREATE INDEX merchant_profiles_published_idx
  ON merchant_profiles (updated_at DESC, merchant_id)
  WHERE published = true;
