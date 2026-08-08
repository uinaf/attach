CREATE INDEX objects_principal_expiry_idx
ON objects(principal_id, expires_at)
WHERE deleted_at IS NULL;

INSERT INTO principal_usage (principal_id, live_bytes)
SELECT p.id, COALESCE(SUM(o.size_bytes), 0)
FROM principals p
LEFT JOIN objects o
  ON o.principal_id = p.id
 AND o.deleted_at IS NULL
 AND o.expires_at > (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
GROUP BY p.id
ON CONFLICT(principal_id) DO UPDATE
SET live_bytes = excluded.live_bytes;
