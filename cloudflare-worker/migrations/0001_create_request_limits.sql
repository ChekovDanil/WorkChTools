CREATE TABLE IF NOT EXISTS request_limits (
  visitor_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS request_limits_updated_at_idx
  ON request_limits (updated_at);
