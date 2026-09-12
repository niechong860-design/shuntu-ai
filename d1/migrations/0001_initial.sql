-- SHUNTU Cloudflare D1 initial schema.
-- Source of truth: Supabase migrations + generated Supabase types as of ad135041.
-- PostgreSQL-only features (RLS, RPCs, triggers, auth.uid, plpgsql) are intentionally excluded.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  credits INTEGER NOT NULL DEFAULT 20 CHECK (credits >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user', 'founder')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_uidx
  ON user_roles (user_id, role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON user_roles (user_id);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  is_used INTEGER NOT NULL DEFAULT 0 CHECK (is_used IN (0, 1)),
  used_by TEXT,
  used_by_email TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uidx
  ON coupons (code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_used
  ON coupons (is_used);
CREATE INDEX IF NOT EXISTS idx_coupons_used_by
  ON coupons (used_by);
CREATE INDEX IF NOT EXISTS idx_coupons_created_at
  ON coupons (created_at DESC);

CREATE TABLE IF NOT EXISTS generation_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generation_task_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_gh_created_at
  ON generation_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gh_model
  ON generation_history (model);
CREATE INDEX IF NOT EXISTS idx_gh_user
  ON generation_history (user_id);
CREATE INDEX IF NOT EXISTS gh_user_created_idx
  ON generation_history (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS generation_history_generation_task_id_uidx
  ON generation_history (generation_task_id)
  WHERE generation_task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS models_config (
  id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cost INTEGER NOT NULL DEFAULT 100,
  sort_order INTEGER NOT NULL DEFAULT 0,
  api_url TEXT,
  api_key TEXT,
  request_format TEXT NOT NULL DEFAULT 'async_id'
    CHECK (request_format IN ('async_id', 'sync_url')),
  prompt_key TEXT NOT NULL DEFAULT 'prompt',
  fetch_url TEXT,
  extra_params TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_params)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS models_config_model_key_uidx
  ON models_config (model_key);
CREATE INDEX IF NOT EXISTS idx_models_config_enabled_sort
  ON models_config (is_enabled, sort_order);

CREATE TABLE IF NOT EXISTS global_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_url TEXT NOT NULL DEFAULT 'https://api.wuyinkeji.com',
  global_api_key TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  link_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ads_active_sort
  ON ads (is_active, sort_order);

CREATE TABLE IF NOT EXISTS admin_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_password TEXT NOT NULL DEFAULT '888888',
  system_prompt TEXT NOT NULL DEFAULT '',
  contact_wechat TEXT NOT NULL DEFAULT '',
  contact_qq TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS style_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_style_templates_sort_order
  ON style_templates (sort_order);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'info',
  image_url TEXT,
  link_url TEXT,
  link_label TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_announcements_published_created
  ON announcements (is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned_created
  ON announcements (is_pinned, created_at DESC);

CREATE TABLE IF NOT EXISTS inspiration_cases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  model_key TEXT,
  model_name TEXT,
  aspect_ratio TEXT,
  size TEXT,
  style_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  views INTEGER NOT NULL DEFAULT 0,
  likes_count INTEGER NOT NULL DEFAULT 0,
  favorites_count INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inspiration_cases_created
  ON inspiration_cases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspiration_cases_user
  ON inspiration_cases (user_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_cases_style
  ON inspiration_cases (style_id);
CREATE INDEX IF NOT EXISTS idx_inspiration_cases_published_created
  ON inspiration_cases (is_published, created_at DESC);

CREATE TABLE IF NOT EXISTS case_likes (
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, user_id),
  FOREIGN KEY (case_id) REFERENCES inspiration_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_likes_user
  ON case_likes (user_id);

CREATE TABLE IF NOT EXISTS case_favorites (
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, user_id),
  FOREIGN KEY (case_id) REFERENCES inspiration_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_favorites_user
  ON case_favorites (user_id);

CREATE TABLE IF NOT EXISTS case_comments (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES inspiration_cases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_case_comments_case
  ON case_comments (case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_comments_user
  ON case_comments (user_id);

CREATE TABLE IF NOT EXISTS recharge_packages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  price TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  features TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(features)),
  badge_text TEXT,
  is_popular INTEGER NOT NULL DEFAULT 0 CHECK (is_popular IN (0, 1)),
  highlighted INTEGER NOT NULL DEFAULT 0 CHECK (highlighted IN (0, 1)),
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  button_text TEXT NOT NULL DEFAULT '立即购买',
  purchase_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (purchase_url IS NULL OR trim(purchase_url) = '' OR purchase_url LIKE 'http://%' OR purchase_url LIKE 'https://%')
);

CREATE INDEX IF NOT EXISTS idx_recharge_packages_visible_sort
  ON recharge_packages (is_visible, sort_order);

CREATE TABLE IF NOT EXISTS user_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  out_trade_no TEXT NOT NULL,
  amount INTEGER NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  pay_type TEXT,
  trade_no TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS user_orders_out_trade_no_uidx
  ON user_orders (out_trade_no);
CREATE INDEX IF NOT EXISTS idx_user_orders_user_id
  ON user_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_user_orders_status
  ON user_orders (status);
CREATE INDEX IF NOT EXISTS idx_user_orders_created_at
  ON user_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS redeem_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 0 CHECK (success IN (0, 1)),
  error_message TEXT,
  redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redeem_logs_user
  ON redeem_logs (user_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_code
  ON redeem_logs (code);
CREATE INDEX IF NOT EXISTS idx_redeem_logs_success
  ON redeem_logs (success);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  model_id TEXT NOT NULL,
  prompt TEXT,
  input_params TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(input_params)),
  credits_required INTEGER NOT NULL DEFAULT 0,
  deduction_status TEXT NOT NULL DEFAULT 'not_charged'
    CHECK (deduction_status IN ('not_charged', 'charged', 'refund_pending', 'refunded', 'charge_failed')),
  deduction_id TEXT,
  charged_at TEXT,
  refunded_at TEXT,
  result_image_url TEXT,
  result_payload TEXT CHECK (result_payload IS NULL OR json_valid(result_payload)),
  error_code TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_tasks_request_id_uidx
  ON generation_tasks (request_id);
CREATE INDEX IF NOT EXISTS generation_tasks_user_id_status_idx
  ON generation_tasks (user_id, status);
CREATE INDEX IF NOT EXISTS generation_tasks_user_id_created_at_idx
  ON generation_tasks (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_model_id
  ON generation_tasks (model_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_deduction_id
  ON generation_tasks (deduction_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_status_created
  ON generation_tasks (status, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL,
  model_key TEXT,
  model_name TEXT,
  generation_history_id TEXT,
  generation_task_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT CHECK (metadata IS NULL OR json_valid(metadata))
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_user_created
  ON credit_usage_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_model_key_created
  ON credit_usage_logs (model_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_usage_logs_generation_task_id
  ON credit_usage_logs (generation_task_id);
CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_idempotency_key_uidx
  ON credit_usage_logs (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_generation_history_id_uidx
  ON credit_usage_logs (generation_history_id)
  WHERE generation_history_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS credit_usage_logs_generation_task_id_uidx
  ON credit_usage_logs (generation_task_id)
  WHERE generation_task_id IS NOT NULL;
