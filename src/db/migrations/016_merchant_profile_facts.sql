-- Optional license and contact facts on the existing profile row.
-- Do not backfill. Existing rows keep these columns null.
-- Do not copy account phone, email, or merchants.name into these columns.

ALTER TABLE merchant_profiles
  ADD COLUMN license_name text,
  ADD COLUMN license_credit_code text,
  ADD COLUMN license_legal_person text,
  ADD COLUMN license_registered_address text,
  ADD COLUMN license_image_url text,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_label text,
  ADD COLUMN contact_qr_url text;

ALTER TABLE merchant_profiles
  ADD CONSTRAINT merchant_profiles_license_group CHECK (
    (
      license_name IS NULL
      AND license_credit_code IS NULL
      AND license_legal_person IS NULL
      AND license_registered_address IS NULL
      AND license_image_url IS NULL
    )
    OR (
      license_name IS NOT NULL
      AND char_length(btrim(license_name)) BETWEEN 1 AND 80
      AND license_credit_code IS NOT NULL
      AND char_length(license_credit_code) = 18
      AND license_legal_person IS NOT NULL
      AND char_length(btrim(license_legal_person)) BETWEEN 1 AND 40
      AND license_registered_address IS NOT NULL
      AND char_length(btrim(license_registered_address)) BETWEEN 1 AND 200
      AND license_image_url IS NOT NULL
      AND char_length(btrim(license_image_url)) BETWEEN 1 AND 500
    )
  ),
  ADD CONSTRAINT merchant_profiles_contact_group CHECK (
    (
      contact_phone IS NULL
      AND contact_label IS NULL
      AND contact_qr_url IS NULL
    )
    OR (
      (contact_phone IS NOT NULL OR contact_qr_url IS NOT NULL)
      AND (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 5 AND 20)
      AND (contact_label IS NULL OR char_length(btrim(contact_label)) BETWEEN 1 AND 20)
      AND (contact_qr_url IS NULL OR char_length(btrim(contact_qr_url)) BETWEEN 1 AND 500)
    )
  );

-- Profile images are not catalog images. Bytes stay in the configured object bucket.
-- merchant_id is required text and intentionally has no foreign key to merchants.

CREATE TABLE merchant_profile_images (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  purpose text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchant_profile_images_purpose CHECK (purpose IN ('license', 'contact_qr')),
  CONSTRAINT merchant_profile_images_content_type CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT merchant_profile_images_byte_size CHECK (byte_size > 0 AND byte_size <= 5242880)
);
