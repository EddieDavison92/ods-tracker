import type { Practice, PCN } from '@/types/database.types'
import type { ODSOrganisation } from '@/types/ods.types'

const BASE_URL = 'https://directory.spineservices.nhs.uk/ORD/2-0-0'

async function getRelatedOrgs(odsCode: string, notify: (message: string) => Promise<void>) {
  console.log('[ODS] Starting getRelatedOrgs for:', odsCode)
  const params = new URLSearchParams({
    RelTypeId: 'RE4,RE6',  // IS COMMISSIONED BY, IS OPERATED BY
    TargetOrgId: odsCode,
    _format: 'json'
  })

  try {
    const response = await fetch(`${BASE_URL}/organisations?${params}`, {
      headers: { 'Accept': 'application/json' }
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch organizations: ${response.statusText}`)
    }

    const data = await response.json()
    const totalCount = response.headers.get('X-Total-Count')
    await notify(`Found ${totalCount} organisations to process`)
    
    let allOrgs = data.Organisations || []
    let nextPage = response.headers.get('next-page')
    
    while (nextPage) {
      console.log(`[ODS] Fetching next page: ${nextPage}`)
      const pageResponse = await fetch(nextPage, {
        headers: { 'Accept': 'application/json' }
      })
      const pageData = await pageResponse.json()
      allOrgs = allOrgs.concat(pageData.Organisations || [])
      nextPage = pageResponse.headers.get('next-page')
    }
    
    return allOrgs
  } catch (error) {
    console.error('[ODS] Error getting related organisations:', error)
    throw error
  }
}

interface Contact {
  type: string
  value: string
}

function extractPracticeData(orgData: ODSOrganisation): Practice | null {
  const org = orgData.Organisation
  if (!org.Roles?.Role) return null

  const roles = Array.isArray(org.Roles.Role) ? org.Roles.Role : [org.Roles.Role]
  
  // Find the GP Practice role (RO76)
  const gpRole = roles.find(r => r.id === 'RO76')
  if (!gpRole) return null  // Must be a GP Practice

  // Get GP Practice role start date
  const gpRoleDates = gpRole.Date ? 
    (Array.isArray(gpRole.Date) ? gpRole.Date : [gpRole.Date]) : []
  const gpRoleOperationalDate = gpRoleDates.find(d => d.Type === 'Operational')
  const gpRoleStart = gpRoleOperationalDate?.Start || null

  // Extract contacts
  const contacts = org.Contacts?.Contact || []
  const contactArray = Array.isArray(contacts) ? contacts : [contacts]

  // Extract organization dates for other fields
  const dates = Array.isArray(org.Date) ? org.Date : [org.Date]
  const operationalDates = dates.find(d => d.Type === 'Operational')
  const legalDates = dates.find(d => d.Type === 'Legal')

  // Log the dates we find for debugging
  console.log('[ODS] Practice dates for', org.Name, {
    gpRole: {
      id: gpRole.id,
      dates: gpRoleDates,
      operationalDate: gpRoleOperationalDate,
      startDate: gpRoleStart
    },
    orgDates: {
      dates,
      operationalDates,
      operationalStart: operationalDates?.Start
    },
    finalStartDate: gpRoleStart
  })

  const practiceData = {
    ods_code: org.OrgId.extension,
    name: org.Name,
    status: org.Status,
    operational_start: gpRoleStart,  // Only use RO76 role start date
    operational_end: gpRole.Status === 'Inactive' ? gpRoleOperationalDate?.End || null : null,
    legal_start: legalDates?.Start || null,
    legal_end: legalDates?.End || null,
    address: org.GeoLoc?.Location?.AddrLn1 || null,
    address_lines: [
      org.GeoLoc?.Location?.AddrLn1,
      org.GeoLoc?.Location?.AddrLn2,
      org.GeoLoc?.Location?.AddrLn3
    ].filter(Boolean).join(', ') || null,
    town: org.GeoLoc?.Location?.Town || null,
    county: org.GeoLoc?.Location?.County || null,
    country: org.GeoLoc?.Location?.Country || null,
    postcode: org.GeoLoc?.Location?.PostCode || null,
    uprn: org.GeoLoc?.Location?.UPRN || null,
    current_pcn_code: getCurrentPCN(org.Rels),
    phone: contactArray.find((c: Contact) => c.type === 'tel')?.value || null,
    email: contactArray.find((c: Contact) => c.type === 'email')?.value || null,
    website: contactArray.find((c: Contact) => c.type === 'url')?.value || null,
    prescribing_code: org.Prescribing?.code || null,
    primary_role: roles.find(r => r.primaryRole)?.id || null,
    org_record_class: org.orgRecordClass || null,
    roles: roles.map(r => ({
      id: r.id,
      uniqueRoleId: r.uniqueRoleId,
      primaryRole: r.primaryRole || false,
      Status: r.Status,
      Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : []).filter((d): d is { Type: string; Start?: string; End?: string } => d !== undefined)
    })),
    relationships: org.Rels?.Rel ? (Array.isArray(org.Rels.Rel) ? org.Rels.Rel : [org.Rels.Rel]) : null,
    last_changed: org.LastChangeDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  // Log the final practice data
  console.log('[ODS] Final practice data for', org.Name, {
    ods_code: practiceData.ods_code,
    operational_start: practiceData.operational_start,
    roles: roles.map(r => ({
      id: r.id,
      dates: r.Date
    }))
  })

  return practiceData
}

function extractPCNData(orgData: ODSOrganisation): PCN | null {
  const org = orgData.Organisation
  if (!org.Roles?.Role) return null

  const roles = Array.isArray(org.Roles.Role) ? org.Roles.Role : [org.Roles.Role]
  
  // Must be a PCN (RO272) and it must be the primary role
  if (!roles.some(r => r.id === 'RO272' && r.primaryRole)) return null

  // Extract dates
  const dates = Array.isArray(org.Date) ? org.Date : [org.Date]
  const operationalDates = dates.find(d => d.Type === 'Operational')
  const legalDates = dates.find(d => d.Type === 'Legal')

  return {
    ods_code: org.OrgId.extension,
    name: org.Name,
    status: org.Status,
    operational_start: operationalDates?.Start || null,
    operational_end: operationalDates?.End || null,
    legal_start: legalDates?.Start || null,
    legal_end: legalDates?.End || null,
    address: org.GeoLoc?.Location?.AddrLn1 || null,
    address_lines: [
      org.GeoLoc?.Location?.AddrLn1,
      org.GeoLoc?.Location?.AddrLn2,
      org.GeoLoc?.Location?.AddrLn3
    ].filter(Boolean).join(', ') || null,
    town: org.GeoLoc?.Location?.Town || null,
    county: org.GeoLoc?.Location?.County || null,
    country: org.GeoLoc?.Location?.Country || null,
    postcode: org.GeoLoc?.Location?.PostCode || null,
    uprn: org.GeoLoc?.Location?.UPRN || null,
    member_count: 0,  // This will be calculated later
    org_record_class: org.orgRecordClass || null,
    roles: roles.map(r => ({
      id: r.id,
      uniqueRoleId: r.uniqueRoleId,
      primaryRole: r.primaryRole || false,
      Status: r.Status,
      Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : []).filter((d): d is { Type: string; Start?: string; End?: string } => d !== undefined)
    })),
    relationships: org.Rels?.Rel ? 
      (Array.isArray(org.Rels.Rel) ? org.Rels.Rel : [org.Rels.Rel]) : 
      null,
    last_changed: org.LastChangeDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

// Helper functions
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

export async function fetchODSData(
  onProgress?: (message: string) => Promise<void>
) {
  const notify = onProgress || (async (msg: string) => {
    console.log('[ODS]', msg)
    return Promise.resolve()
  })
  
  try {
    console.log('[ODS] fetchODSData started')
    await notify('Starting ODS data fetch...')
    const NCL_ICB_CODE = '93C'
    
    console.log('[ODS] Calling getRelatedOrgs')
    const orgs = await getRelatedOrgs(NCL_ICB_CODE, notify)
    console.log('[ODS] getRelatedOrgs returned', orgs.length, 'organizations')
    await notify(`Found ${orgs.length} organisations`)

    const practices: Practice[] = []
    const pcns: PCN[] = []
    
    await notify('Processing organisations...')
    let processed = 0
    const total = orgs.length

    for (const org of orgs) {
      processed++
      const ods_code = org.OrgId.extension
      if (ods_code) {
        const org_details = await getOrgDetails(ods_code)
        if (org_details) {
          const practice = extractPracticeData(org_details)
          if (practice) practices.push(practice)
          
          const pcn = extractPCNData(org_details)
          if (pcn) pcns.push(pcn)
        }
      }
      
      if (processed % 10 === 0) {
        await notify(`Processed ${processed}/${total} organisations`)
      }
    }

    await notify(`Found ${practices.length} practices and ${pcns.length} PCNs`)
    return { practices, pcns }
  } catch (error) {
    console.error('[ODS] Error in fetchODSData:', error)
    throw error
  }
}

async function getOrgDetails(odsCode: string): Promise<ODSOrganisation | null> {
  try {
    const response = await fetch(
      `${BASE_URL}/organisations/${odsCode}?_format=json`,
      { headers: { 'Accept': 'application/json' } }
    )
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error(`Error fetching details for ${odsCode}:`, error)
    return null
  }
}