// Derived tables rebuilt after loads and syncs: org_scope (group, parent, area) and cached stats.
import { groupSql } from '../ods/groups.ts'

// Area and parent links, preferring the open relationship, else the most recently ended one:
//   RE8 -> RO272 PCN; RE4/RE5 -> RO98 Sub-ICB location (formerly CCG); RE4/RE5 -> RO261 ICB
//   (formerly STP); RE2/RE4/RE5 -> RO209 NHS England region; RE6 -> parent ("is operated by").
// Missing levels are filled upwards (PCN -> Sub-ICB -> ICB -> region), then inherited from the parent,
// so trust sites, branch surgeries and care home sites take their operator's area.
const SCOPE_CALC = `
WITH links AS (
  SELECT code, target, op_start, op_end, rel_id,
    CASE
      WHEN rel_type = 'RE8' AND target_role = 'RO272' THEN 'pcn'
      WHEN rel_type IN ('RE4', 'RE5') AND target_role = 'RO98' THEN 'sicbl'
      WHEN rel_type IN ('RE4', 'RE5') AND target_role = 'RO261' THEN 'icb'
      WHEN rel_type IN ('RE2', 'RE4', 'RE5') AND target_role = 'RO209' THEN 'region'
      WHEN rel_type = 'RE6' THEN 'parent'
    END AS kind
  FROM org_rel WHERE rel_type IN ('RE2', 'RE4', 'RE5', 'RE6', 'RE8')
),
ranked AS (
  SELECT code, kind, target,
    ROW_NUMBER() OVER (
      PARTITION BY code, kind ORDER BY (op_end IS NULL) DESC, op_end DESC, op_start DESC, rel_id DESC
    ) AS rn
  FROM links WHERE kind IS NOT NULL
),
top AS (
  SELECT code,
    MAX(CASE WHEN kind = 'pcn' THEN target END) AS pcn,
    MAX(CASE WHEN kind = 'sicbl' THEN target END) AS sicbl,
    MAX(CASE WHEN kind = 'icb' THEN target END) AS icb,
    MAX(CASE WHEN kind = 'region' THEN target END) AS region,
    MAX(CASE WHEN kind = 'parent' THEN target END) AS parent
  FROM ranked WHERE rn = 1 GROUP BY code
),
own AS (
  SELECT o.code, ${groupSql('o')} AS grp, t.parent,
    CASE WHEN o.primary_role = 'RO272' THEN o.code ELSE t.pcn END AS pcn,
    CASE WHEN o.primary_role = 'RO98' THEN o.code ELSE t.sicbl END AS sicbl,
    CASE WHEN o.primary_role = 'RO261' THEN o.code ELSE t.icb END AS icb,
    CASE WHEN o.primary_role = 'RO209' THEN o.code ELSE t.region END AS region
  FROM org o LEFT JOIN top t ON t.code = o.code
),
up1 AS (
  SELECT a.code, a.grp, a.parent, a.pcn, COALESCE(a.sicbl, p.sicbl) AS sicbl, a.icb, a.region
  FROM own a LEFT JOIN top p ON p.code = a.pcn
),
up2 AS (
  SELECT a.code, a.grp, a.parent, a.pcn, a.sicbl, COALESCE(a.icb, s.icb) AS icb, a.region
  FROM up1 a LEFT JOIN top s ON s.code = a.sicbl
),
up3 AS (
  SELECT a.code, a.grp, a.parent, a.pcn, a.sicbl, a.icb, COALESCE(a.region, i.region) AS region
  FROM up2 a LEFT JOIN top i ON i.code = a.icb
)
SELECT a.code, a.grp, a.parent,
  COALESCE(a.pcn, p.pcn) AS pcn,
  COALESCE(a.sicbl, p.sicbl) AS sicbl,
  COALESCE(a.icb, p.icb) AS icb,
  COALESCE(a.region, p.region) AS region
FROM up3 a LEFT JOIN up3 p ON p.code = a.parent`

// Writes only rows that changed.
export const REFRESH_SCOPE_SQL = [
  `INSERT OR REPLACE INTO org_scope (code, grp, parent, pcn, sicbl, icb, region)
   SELECT c.code, c.grp, c.parent, c.pcn, c.sicbl, c.icb, c.region FROM (${SCOPE_CALC}) c
   LEFT JOIN org_scope s ON s.code = c.code
   WHERE s.code IS NULL OR c.grp IS NOT s.grp OR c.parent IS NOT s.parent OR c.pcn IS NOT s.pcn
      OR c.sicbl IS NOT s.sicbl OR c.icb IS NOT s.icb OR c.region IS NOT s.region`,
  `DELETE FROM org_scope WHERE code NOT IN (SELECT code FROM org)`,
]

// Headline counts cached in meta.stats.
export const STATS_SQL = `
  SELECT
    (SELECT COUNT(*) FROM org) AS orgs,
    (SELECT COUNT(*) FROM org WHERE status = 'Active') AS active_orgs,
    (SELECT COUNT(*) FROM org_scope WHERE grp = 'gp') AS practices,
    (SELECT COUNT(*) FROM org_scope s JOIN org o ON o.code = s.code WHERE s.grp = 'gp' AND o.status = 'Active') AS active_practices,
    (SELECT COUNT(*) FROM org WHERE primary_role = 'RO272') AS pcns,
    (SELECT COUNT(*) FROM org WHERE primary_role = 'RO272' AND status = 'Active') AS active_pcns,
    (SELECT COUNT(*) FROM org_role r JOIN org o ON o.code = r.code WHERE r.role = 'RO319' AND r.status = 'Active') AS active_sicbls,
    (SELECT COUNT(*) FROM org_role r JOIN org o ON o.code = r.code WHERE r.role = 'RO318' AND r.status = 'Active') AS active_icbs,
    (SELECT COUNT(*) FROM change_event) AS events,
    (SELECT COUNT(*) FROM change_event WHERE detected_at >= date('now', '-30 days')) AS events_30d`

export const GROUP_COUNTS_SQL = `
  SELECT s.grp AS grp, SUM(o.status = 'Active') AS active, COUNT(*) AS total
  FROM org_scope s JOIN org o ON o.code = s.code GROUP BY s.grp`

// Active org counts per area, for the areas page and scope picker.
export const AREA_COUNTS_SQL = `
  SELECT s.region, s.icb, s.sicbl,
    SUM(o.status = 'Active') AS active,
    SUM(s.grp = 'gp' AND o.status = 'Active') AS gp,
    SUM(s.grp = 'pcn' AND o.status = 'Active') AS pcn
  FROM org_scope s JOIN org o ON o.code = s.code
  WHERE s.region IS NOT NULL OR s.icb IS NOT NULL OR s.sicbl IS NOT NULL
  GROUP BY s.region, s.icb, s.sicbl`

export const REINDEX_SEARCH_SQL = [
  `DELETE FROM org_search`,
  `INSERT INTO org_search (code, name, town, postcode) SELECT code, name, town, postcode FROM org`,
]
