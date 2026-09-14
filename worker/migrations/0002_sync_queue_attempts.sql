-- Track fetch failures so one bad org can't block the sync queue from draining.
ALTER TABLE sync_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_queue ADD COLUMN last_error TEXT;
ALTER TABLE sync_run ADD COLUMN failed INTEGER;
