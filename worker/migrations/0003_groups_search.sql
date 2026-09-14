-- org_scope now covers every org: its browse group, parent (the org it is operated by) and
-- area (PCN, Sub-ICB, ICB, region). Computed in src/db/derived.ts, so the view is no longer needed.
DROP VIEW IF EXISTS scope_calc;
ALTER TABLE org_scope ADD COLUMN grp TEXT;
ALTER TABLE org_scope ADD COLUMN parent TEXT;
CREATE INDEX org_scope_grp ON org_scope (grp);
CREATE INDEX org_scope_parent ON org_scope (parent);
CREATE INDEX org_scope_icb_grp ON org_scope (icb, grp);
CREATE INDEX org_scope_sicbl_grp ON org_scope (sicbl, grp);
CREATE INDEX org_scope_region_grp ON org_scope (region, grp);

-- Full-text search over code, name, town and postcode. Rebuilt with POST /admin/reindex after a
-- bulk load; kept current by sync writes.
CREATE VIRTUAL TABLE org_search USING fts5(
  code, name, town, postcode,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3 4'
);
INSERT INTO org_search (code, name, town, postcode) SELECT code, name, town, postcode FROM org;
