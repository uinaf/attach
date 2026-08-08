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

-- Short-lived put reservations so crash-after-claim can be reclaimed.
CREATE TABLE put_reservations (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX put_reservations_expires_idx ON put_reservations(expires_at);

-- Seed counters from objects already live at migrate time.
INSERT INTO principal_usage (principal_id, live_bytes)
SELECT principal_id, COALESCE(SUM(size_bytes), 0)
FROM objects
WHERE deleted_at IS NULL AND expires_at > (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
GROUP BY principal_id;

-- Soft-delete already-expired rows without touching live_bytes (they were
-- never counted above). Application code adjusts live_bytes on delete so a
-- migrate-before-deploy rollout cannot desync while the old worker is live.
UPDATE objects
SET deleted_at = (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
WHERE deleted_at IS NULL
  AND expires_at <= (CAST(strftime('%s', 'now') AS INTEGER) * 1000);
