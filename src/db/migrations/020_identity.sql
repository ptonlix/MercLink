-- Identity and access tables. Catalog and commerce tables stay in later migrations.

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

CREATE TABLE sms_sends (
  id text PRIMARY KEY,
  phone text NOT NULL,
  sent_at timestamptz NOT NULL
);

CREATE INDEX sms_sends_phone_sent_idx ON sms_sends (phone, sent_at DESC);

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
