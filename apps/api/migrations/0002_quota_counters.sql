-- Atomic put-rate and live-storage counters (concurrency-safe quotas).
CREATE TABLE quota_windows (
  principal_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  puts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (principal_id, window_start)
);

CREATE TABLE principal_usage (
  principal_id TEXT PRIMARY KEY REFERENCES principals(id),
  live_bytes INTEGER NOT NULL DEFAULT 0
);
