-- Local-first D1 authentication primitives. This migration is not applied to production.
CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  disabled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Preserves source identity identifiers during an approved migration. Only stable,
-- non-secret identity fields belong here; provider tokens/identity_data are excluded.
CREATE TABLE IF NOT EXISTS auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES auth_credentials(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES auth_credentials(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_expiry_idx
  ON auth_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_one_time_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES auth_credentials(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER
);

-- Applies bans to every profile, including accounts whose credentials are not migrated yet.
CREATE TABLE IF NOT EXISTS auth_user_controls (
  user_id TEXT PRIMARY KEY,
  disabled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);
