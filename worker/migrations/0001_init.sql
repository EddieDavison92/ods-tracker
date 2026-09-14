-- Current ODS state: one row per organisation, plus its roles, relationships and successions.
-- Child tables carry ODS operational/legal date ranges, so they hold full temporal history.
CREATE TABLE org (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  record_class TEXT,
  primary_role TEXT,
  op_start TEXT,
  op_end TEXT,
  legal_start TEXT,
  legal_end TEXT,
  addr1 TEXT,
  addr2 TEXT,
  addr3 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT,
  uprn INTEGER,
  tel TEXT,
  fax TEXT,
  url TEXT,
  last_change TEXT,
  hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX org_primary_role ON org (primary_role, status);
CREATE INDEX org_postcode ON org (postcode);
CREATE INDEX org_name ON org (name);

CREATE TABLE org_role (
  code TEXT NOT NULL,
  role_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  is_primary INTEGER NOT NULL,
  status TEXT,
  op_start TEXT,
  op_end TEXT,
  legal_start TEXT,
  legal_end TEXT,
  PRIMARY KEY (code, role_id)
);
CREATE INDEX org_role_role ON org_role (role, code);

CREATE TABLE org_rel (
  code TEXT NOT NULL,
  rel_id INTEGER NOT NULL,
  rel_type TEXT NOT NULL,
  target TEXT NOT NULL,
  target_role TEXT,
  status TEXT,
  op_start TEXT,
  op_end TEXT,
  legal_start TEXT,
  legal_end TEXT,
  PRIMARY KEY (code, rel_id)
);
CREATE INDEX org_rel_target ON org_rel (target, rel_type);

CREATE TABLE org_succ (
  code TEXT NOT NULL,
  succ_id INTEGER NOT NULL,
  succ_type TEXT NOT NULL,
  target TEXT NOT NULL,
  target_role TEXT,
  start_date TEXT,
  PRIMARY KEY (code, succ_id)
);
CREATE INDEX org_succ_target ON org_succ (target);

CREATE TABLE role_ref (code TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE rel_type_ref (code TEXT PRIMARY KEY, name TEXT NOT NULL);

-- Current (or last known) primary care hierarchy per org. Refreshed from scope_calc after each load.
CREATE TABLE org_scope (
  code TEXT PRIMARY KEY,
  pcn TEXT,
  sicbl TEXT,
  icb TEXT,
  region TEXT
);
CREATE INDEX org_scope_pcn ON org_scope (pcn);
CREATE INDEX org_scope_sicbl ON org_scope (sicbl);
CREATE INDEX org_scope_icb ON org_scope (icb);
CREATE INDEX org_scope_region ON org_scope (region);

-- Hierarchy links, preferring the open relationship, else the most recently ended one:
--   RE8 -> RO272 PCN, RE4 -> RO98 Sub-ICB location (formerly CCG),
--   RE5 -> RO261 ICB (formerly STP), RE2 -> RO209 NHS England region.
CREATE VIEW scope_calc AS
WITH ranked AS (
  SELECT code, rel_type, target,
    ROW_NUMBER() OVER (
      PARTITION BY code, rel_type
      ORDER BY (op_end IS NULL) DESC, op_end DESC, op_start DESC, rel_id DESC
    ) AS rn
  FROM org_rel
  WHERE (rel_type = 'RE8' AND target_role = 'RO272')
     OR (rel_type = 'RE4' AND target_role = 'RO98')
     OR (rel_type = 'RE5' AND target_role = 'RO261')
     OR (rel_type = 'RE2' AND target_role = 'RO209')
),
top AS (
  SELECT code,
    MAX(CASE WHEN rel_type = 'RE8' THEN target END) AS pcn,
    MAX(CASE WHEN rel_type = 'RE4' THEN target END) AS sicbl,
    MAX(CASE WHEN rel_type = 'RE5' THEN target END) AS icb,
    MAX(CASE WHEN rel_type = 'RE2' THEN target END) AS region
  FROM ranked WHERE rn = 1 GROUP BY code
),
own AS (
  SELECT o.code,
    CASE WHEN o.primary_role = 'RO272' THEN o.code ELSE t.pcn END AS pcn,
    CASE WHEN o.primary_role = 'RO98' THEN o.code ELSE t.sicbl END AS sicbl,
    CASE WHEN o.primary_role = 'RO261' THEN o.code ELSE t.icb END AS icb,
    CASE WHEN o.primary_role = 'RO209' THEN o.code ELSE t.region END AS region
  FROM org o LEFT JOIN top t ON t.code = o.code
  WHERE t.code IS NOT NULL OR o.primary_role IN ('RO272', 'RO98', 'RO261', 'RO209')
),
with_sicbl AS (
  SELECT a.code, a.pcn, COALESCE(a.sicbl, p.sicbl) AS sicbl, a.icb, a.region
  FROM own a LEFT JOIN top p ON p.code = a.pcn
),
with_icb AS (
  SELECT a.code, a.pcn, a.sicbl, COALESCE(a.icb, s.icb) AS icb, a.region
  FROM with_sicbl a LEFT JOIN top s ON s.code = a.sicbl
)
SELECT a.code, a.pcn, a.sicbl, a.icb, COALESCE(a.region, i.region) AS region
FROM with_icb a LEFT JOIN top i ON i.code = a.icb;

-- Detected changes. detected_at is when the change first appeared (snapshot or sync date);
-- effective_date is the date ODS gives for it, where known.
CREATE TABLE change_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  primary_role TEXT,
  kind TEXT NOT NULL,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  related TEXT,
  detail TEXT,
  effective_date TEXT,
  detected_at TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX change_event_detected ON change_event (detected_at, id);
CREATE INDEX change_event_code ON change_event (code, detected_at);
CREATE INDEX change_event_related ON change_event (related, detected_at);
CREATE INDEX change_event_kind ON change_event (kind, detected_at);

-- Orgs reported changed by the ORD sync endpoint, awaiting a detail fetch.
CREATE TABLE sync_queue (code TEXT PRIMARY KEY, queued_at TEXT NOT NULL);

CREATE TABLE sync_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger TEXT NOT NULL,
  since TEXT,
  listed INTEGER,
  processed INTEGER,
  changed INTEGER,
  events INTEGER,
  remaining INTEGER,
  status TEXT NOT NULL,
  error TEXT
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
