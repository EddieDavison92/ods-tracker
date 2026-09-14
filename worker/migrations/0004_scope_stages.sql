-- Staged area derivation, so refreshes stay well inside D1's per-query time limit and syncs can
-- recompute only the orgs they touched. See src/db/derived.ts.
--   scope_top:   each org's own preferred links (PCN, Sub-ICB, ICB, region, parent) from org_rel.
--   scope_chain: each org's type and area after filling levels upwards (PCN -> Sub-ICB -> ICB -> region),
--                before inheriting from its parent. org_scope adds the parent inheritance.
CREATE TABLE scope_top (
  code TEXT PRIMARY KEY,
  pcn TEXT,
  sicbl TEXT,
  icb TEXT,
  region TEXT,
  parent TEXT
);

CREATE TABLE scope_chain (
  code TEXT PRIMARY KEY,
  grp TEXT,
  parent TEXT,
  pcn TEXT,
  sicbl TEXT,
  icb TEXT,
  region TEXT
);
