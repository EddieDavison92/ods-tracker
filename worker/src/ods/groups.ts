// Browsable organisation types, derived from the ODS primary role. GP practices are identified by
// the GP practice role (RO76), since their primary role is the generic prescribing cost centre.
// Shared by the Worker (SQL) and the UI (labels, icons).

export type Family = 'primary' | 'community' | 'hospital' | 'social' | 'commissioning' | 'public' | 'other'

export type GroupKey =
  | 'gp' | 'pcn' | 'branch' | 'prescribing' | 'pharmacy' | 'dental' | 'optical' | 'trust' | 'trust_site'
  | 'independent' | 'social_care' | 'commissioner' | 'local_authority' | 'school' | 'justice' | 'devolved'
  | 'legacy' | 'other'

export interface GroupDef {
  key: GroupKey
  label: string
  singular: string
  family: Family
  // Primary role codes. Empty for 'gp' (role-based) and 'other' (fallback).
  roles: string[]
  blurb: string
}

export const GP_ROLE = 'RO76'

export const GROUPS: GroupDef[] = [
  { key: 'gp', label: 'GP practices', singular: 'GP practice', family: 'primary', roles: [], blurb: 'General practices holding the GP practice role' },
  { key: 'pcn', label: 'Primary care networks', singular: 'PCN', family: 'primary', roles: ['RO272'], blurb: 'Groups of practices working together' },
  { key: 'branch', label: 'Branch surgeries', singular: 'Branch surgery', family: 'primary', roles: ['RO96'], blurb: 'Additional sites of GP practices' },
  { key: 'prescribing', label: 'Other prescribing settings', singular: 'Prescribing setting', family: 'primary', roles: ['RO177', 'RO88'], blurb: 'Prescribing cost centres that are not GP practices' },
  { key: 'pharmacy', label: 'Pharmacies', singular: 'Pharmacy', family: 'community', roles: ['RO182', 'RO181', 'RO280', 'RO94'], blurb: 'Community pharmacies, head offices and appliance contractors' },
  { key: 'dental', label: 'Dental practices', singular: 'Dental practice', family: 'community', roles: ['RO110', 'RO65'], blurb: 'NHS and private dental practices' },
  { key: 'optical', label: 'Opticians', singular: 'Optician', family: 'community', roles: ['RO167', 'RO166'], blurb: 'Optical sites and head offices' },
  { key: 'trust', label: 'NHS trusts', singular: 'NHS trust', family: 'hospital', roles: ['RO197', 'RO57', 'RO107'], blurb: 'Acute, mental health, community and ambulance trusts' },
  { key: 'trust_site', label: 'Trust sites', singular: 'Trust site', family: 'hospital', roles: ['RO198', 'RO108', 'RO173'], blurb: 'Hospitals, clinics, wards and labs run by trusts' },
  { key: 'independent', label: 'Independent providers', singular: 'Independent provider', family: 'hospital', roles: ['RO172', 'RO176', 'RO150'], blurb: 'Independent sector healthcare providers and their sites' },
  { key: 'social_care', label: 'Social care', singular: 'Social care organisation', family: 'social', roles: ['RO104', 'RO101'], blurb: 'Care providers and care home sites' },
  { key: 'commissioner', label: 'Commissioners', singular: 'Commissioner', family: 'commissioning', roles: ['RO98', 'RO261', 'RO209', 'RO210', 'RO99', 'RO212', 'RO213', 'RO214', 'RO216', 'RO217', 'RO185'], blurb: 'ICBs, Sub-ICB locations, NHS England regions and CSUs' },
  { key: 'local_authority', label: 'Local authorities', singular: 'Local authority', family: 'public', roles: ['RO141', 'RO222', 'RO119', 'RO122', 'RO123'], blurb: 'Councils and their sites' },
  { key: 'school', label: 'Schools and education', singular: 'School', family: 'public', roles: ['RO221', 'RO288', 'RO289', 'RO117'], blurb: 'Schools with an NHS organisation code' },
  { key: 'justice', label: 'Justice and custody', singular: 'Justice setting', family: 'public', roles: ['RO175', 'RO228', 'RO230', 'RO231', 'RO232', 'RO233', 'RO234', 'RO235', 'RO236'], blurb: 'Prisons, courts, police custody and SARCs' },
  { key: 'devolved', label: 'Wales, Scotland and NI', singular: 'Devolved organisation', family: 'other', roles: ['RO227', 'RO315', 'RO148', 'RO142', 'RO144', 'RO149', 'RO190', 'RO155', 'RO153', 'RO154', 'RO322', 'RO328', 'RO200'], blurb: 'Health boards and practices outside England' },
  { key: 'legacy', label: 'Legacy NHS bodies', singular: 'Legacy body', family: 'other', roles: ['RO179', 'RO180', 'RO171', 'RO111', 'RO114', 'RO109', 'RO132', 'RO136', 'RO106'], blurb: 'Former PCTs, SHAs, health authorities and DMUs' },
  { key: 'other', label: 'Other organisations', singular: 'Organisation', family: 'other', roles: [], blurb: 'Non-NHS organisations, agencies and suppliers' },
]

export const GROUP_KEYS = new Set<GroupKey>(GROUPS.map((g) => g.key))
export const groupDef = (key: string | null | undefined): GroupDef =>
  GROUPS.find((g) => g.key === key) ?? GROUPS[GROUPS.length - 1]

// SQL CASE assigning a group to org alias `o`.
export function groupSql(o = 'o'): string {
  const whens = GROUPS.filter((g) => g.roles.length)
    .map((g) => `WHEN ${o}.primary_role IN (${g.roles.map((r) => `'${r}'`).join(', ')}) THEN '${g.key}'`)
  return `CASE WHEN EXISTS (SELECT 1 FROM org_role gr WHERE gr.code = ${o}.code AND gr.role = '${GP_ROLE}') THEN 'gp' ${whens.join(' ')} ELSE 'other' END`
}
