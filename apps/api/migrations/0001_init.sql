CREATE TABLE principals (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'app')),
  display TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE api_keys (
  key_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  key_hash BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX api_keys_principal_idx ON api_keys(principal_id);

CREATE TABLE objects (
  object_key TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES principals(id),
  key_id TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  digest TEXT NOT NULL,
  repo TEXT,
  pr INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX objects_principal_live_idx ON objects(principal_id, deleted_at);

CREATE TABLE put_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX put_events_principal_time_idx ON put_events(principal_id, created_at);

CREATE TABLE enroll_events (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX enroll_events_principal_time_idx ON enroll_events(principal_id, created_at);
