CREATE TABLE IF NOT EXISTS runtime_settings (
  namespace text NOT NULL,
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace, key)
);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id bigint PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS processed_actions (
  action_key text PRIMARY KEY,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_processed_actions_processed_at ON processed_actions (processed_at);

CREATE TABLE IF NOT EXISTS bot_sessions (
  session_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_bot_sessions_expires_at ON bot_sessions (expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text PRIMARY KEY,
  count integer NOT NULL,
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_rate_limits_expires_at ON rate_limits (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_applications_single_active_per_user
ON applications (telegram_id)
WHERE status = 'IN_PROGRESS';

CREATE INDEX IF NOT EXISTS ix_applications_status_telegram_updated
ON applications (status, telegram_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_course_enrollments_status_created
ON course_enrollments (status, created_at DESC);
