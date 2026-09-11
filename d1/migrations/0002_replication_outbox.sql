-- SHUNTU D1 warm-standby replication outbox.
-- D1 remains the only authoritative writer after cutover; this table records
-- post-commit row-state events for asynchronous replication to Lovable/Supabase.

CREATE TABLE IF NOT EXISTS replication_outbox (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'profiles.upsert',
    'generation_tasks.upsert',
    'generation_history.upsert',
    'credit_usage_logs.upsert',
    'user_orders.upsert',
    'coupons.upsert',
    'redeem_logs.upsert',
    'profiles.delete',
    'generation_tasks.delete',
    'generation_history.delete',
    'credit_usage_logs.delete',
    'user_orders.delete',
    'coupons.delete',
    'redeem_logs.delete'
  )),
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'profiles',
    'generation_tasks',
    'generation_history',
    'credit_usage_logs',
    'user_orders',
    'coupons',
    'redeem_logs'
  )),
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  locked_at TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at TEXT,
  CHECK (length(CAST(payload AS BLOB)) < 2000000),
  CHECK ((status = 'synced' AND synced_at IS NOT NULL) OR status <> 'synced')
);

CREATE UNIQUE INDEX IF NOT EXISTS replication_outbox_idempotency_key_uidx
  ON replication_outbox (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_replication_outbox_status_created
  ON replication_outbox (status, created_at);

CREATE INDEX IF NOT EXISTS idx_replication_outbox_entity
  ON replication_outbox (entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_replication_outbox_pending_attempts
  ON replication_outbox (status, attempt_count, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed');
