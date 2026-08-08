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

-- Seed counters from objects already live at migrate time.
INSERT INTO principal_usage (principal_id, live_bytes)
SELECT principal_id, COALESCE(SUM(size_bytes), 0)
FROM objects
WHERE deleted_at IS NULL AND expires_at > (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
GROUP BY principal_id;
