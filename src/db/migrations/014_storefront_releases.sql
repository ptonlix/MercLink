-- One deployment keeps immutable storefront releases and a single pointer.
-- Uploading a release does not activate it. Rollback only moves the pointer.

CREATE TABLE storefront_releases (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  source_key text NOT NULL,
  fallback text,
  authorize_buyer text,
  authorize_merchant text,
  created_at timestamptz NOT NULL,
  CONSTRAINT storefront_releases_fallback_check CHECK (
    fallback IS NULL OR fallback = 'index.html'
  )
);

CREATE TABLE storefront_files (
  release_id text NOT NULL REFERENCES storefront_releases (id),
  path text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  PRIMARY KEY (release_id, path),
  CONSTRAINT storefront_files_byte_size_check CHECK (byte_size >= 0)
);

CREATE TABLE storefront_pointer (
  id text PRIMARY KEY,
  active_release_id text REFERENCES storefront_releases (id),
  previous_release_id text REFERENCES storefront_releases (id),
  updated_at timestamptz NOT NULL,
  CONSTRAINT storefront_pointer_singleton_check CHECK (id = 'current')
);

INSERT INTO storefront_pointer (id, active_release_id, previous_release_id, updated_at)
VALUES ('current', NULL, NULL, now());
