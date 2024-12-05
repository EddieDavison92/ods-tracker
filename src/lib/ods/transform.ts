// src/lib/ods/transform.ts
import type { ODSOrganisation } from '@/types/ods.types'
import type { Practice, PCN } from '@/types/database.types'

export function transformToPractice(org: ODSOrganisation): Practice | null {
  const roles = org.Organisation.Roles.Role
  const roleArray = Array.isArray(roles) ? roles : [roles]

  // Check if it's a practice (has RO76 role)
  if (!roleArray.some(role => role.id === 'RO76')) {
    return null
  }

  return {
    ods_code: org.Organisation.OrgId.extension,
    name: org.Organisation.Name,
    status: org.Organisation.Status,
    operational_start: getDate(org.Organisation.Date, 'Operational', 'Start'),
    operational_end: getDate(org.Organisation.Date, 'Operational', 'End'),
    legal_start: getDate(org.Organisation.Date, 'Legal', 'Start'),
    legal_end: getDate(org.Organisation.Date, 'Legal', 'End'),
    address: org.Organisation.GeoLoc?.Location?.AddrLn1 || null,
    address_lines: [
      org.Organisation.GeoLoc?.Location?.AddrLn1,
      org.Organisation.GeoLoc?.Location?.AddrLn2,
      org.Organisation.GeoLoc?.Location?.AddrLn3
    ].filter(Boolean).join(', ') || null,
    town: org.Organisation.GeoLoc?.Location?.Town || null,
    county: org.Organisation.GeoLoc?.Location?.County || null,
    country: org.Organisation.GeoLoc?.Location?.Country || null,
    postcode: org.Organisation.GeoLoc?.Location?.PostCode || null,
    uprn: Number(org.Organisation.GeoLoc?.Location?.UPRN) || null,
    current_pcn_code: getCurrentPCN(org.Organisation.Rels),
    phone: getContact(org.Organisation.Contacts, 'tel'),
    email: getContact(org.Organisation.Contacts, 'email'),
    website: getContact(org.Organisation.Contacts, 'url'),
    prescribing_code: org.Organisation.Prescribing?.code || null,
    primary_role: roleArray.find(r => r.primaryRole)?.id || null,
    org_record_class: org.Organisation.orgRecordClass || null,
    roles: roleArray.map(r => ({
      id: r.id,
      uniqueRoleId: r.uniqueRoleId,
      primaryRole: r.primaryRole || false,
      Status: r.Status,
      Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : [])
        .filter((d): d is { Type: string; Start?: string; End?: string } => !!d)
    })),
    relationships: org.Organisation.Rels?.Rel ? 
      (Array.isArray(org.Organisation.Rels.Rel) ? org.Organisation.Rels.Rel : [org.Organisation.Rels.Rel]) : 
      null,
    last_changed: org.Organisation.LastChangeDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

export function transformToPCN(org: ODSOrganisation): PCN | null {
  const roles = org.Organisation.Roles.Role
  const roleArray = Array.isArray(roles) ? roles : [roles]

  // Must be a PCN (RO272) and it must be the primary role
  if (!roleArray.some(r => r.id === 'RO272' && r.primaryRole)) {
    return null
  }

  return {
    ods_code: org.Organisation.OrgId.extension,
    name: org.Organisation.Name,
    status: org.Organisation.Status,
    operational_start: getDate(org.Organisation.Date, 'Operational', 'Start'),
    operational_end: getDate(org.Organisation.Date, 'Operational', 'End'),
    legal_start: getDate(org.Organisation.Date, 'Legal', 'Start'),
    legal_end: getDate(org.Organisation.Date, 'Legal', 'End'),
    address: org.Organisation.GeoLoc?.Location?.AddrLn1 || null,
    address_lines: [
      org.Organisation.GeoLoc?.Location?.AddrLn1,
      org.Organisation.GeoLoc?.Location?.AddrLn2,
      org.Organisation.GeoLoc?.Location?.AddrLn3
    ].filter(Boolean).join(', ') || null,
    town: org.Organisation.GeoLoc?.Location?.Town || null,
    county: org.Organisation.GeoLoc?.Location?.County || null,
    country: org.Organisation.GeoLoc?.Location?.Country || null,
    postcode: org.Organisation.GeoLoc?.Location?.PostCode || null,
    uprn: Number(org.Organisation.GeoLoc?.Location?.UPRN) || null,
    member_count: 0,  // Will be calculated later
    org_record_class: org.Organisation.orgRecordClass || null,
    roles: roleArray.map(r => ({
      id: r.id,
      uniqueRoleId: r.uniqueRoleId,
      primaryRole: r.primaryRole || false,
      Status: r.Status,
      Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : [])
        .filter((d): d is { Type: string; Start?: string; End?: string } => !!d)
    })),
    relationships: org.Organisation.Rels?.Rel ? 
      (Array.isArray(org.Organisation.Rels.Rel) ? org.Organisation.Rels.Rel : [org.Organisation.Rels.Rel]) : 
      null,
    last_changed: org.Organisation.LastChangeDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

export function calculatePCNMemberships(practices: Practice[], pcns: PCN[]) {
  for (const pcn of pcns) {
    // Find all practices that have ever been members of this PCN
    const memberPractices = practices.filter(practice => 
      practice.relationships?.some(rel => 
        rel.Target.OrgId.extension === pcn.ods_code && 
        rel.Target.PrimaryRoleId.id === 'RO272'
      )
    )

    // Calculate member count
    pcn.member_count = memberPractices.length
  }
}

// Helper functions
function getDate(dates: ODSOrganisation['Organisation']['Date'], type: string, field: 'Start' | 'End'): string | null {
  if (!dates) return null
  const dateArray = Array.isArray(dates) ? dates : [dates]
  const date = dateArray.find(d => d.Type === type)
  return date?.[field] || null
}

function getCurrentPCN(relationships: ODSOrganisation['Organisation']['Rels']): string | null {
  if (!relationships?.Rel) return null
  const rels = Array.isArray(relationships.Rel) ? relationships.Rel : [relationships.Rel]
  const pcnRel = rels.find(rel => 
    rel.Target.PrimaryRoleId.id === 'RO272' && 
    rel.Status === 'Active' &&
    !rel.Date.some(d => d.End)
  )
  return pcnRel?.Target.OrgId.extension || null
}

function getContact(contacts: ODSOrganisation['Organisation']['Contacts'], type: string): string | null {
  if (!contacts?.Contact) return null
  const contactArray = Array.isArray(contacts.Contact) ? contacts.Contact : [contacts.Contact]
  return contactArray.find(c => c.type === type)?.value || null
} 