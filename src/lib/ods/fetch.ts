// src/lib/ods/fetch.ts
import type { ODSListOrganisation, ODSOrganisation } from '@/types/ods.types'

const BASE_URL = 'https://directory.spineservices.nhs.uk/ORD/2-0-0'
const NCL_ICB_CODE = '93C'

export async function fetchAllOrganizations() {
  console.log('[ODS] Starting organization fetch')
  const params = new URLSearchParams({
    RelTypeId: 'RE4,RE6', // RE4 = Practice, RE6 = PCN - expand this list if we want to track other organisation types
    TargetOrgId: NCL_ICB_CODE,
    _format: 'json'
  })

  let url = `${BASE_URL}/organisations?${params}`
  let allOrgs: ODSListOrganisation[] = []

  while (url) {
    console.log('[ODS] Fetching:', url)
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    allOrgs = allOrgs.concat(data.Organisations || [])
    url = response.headers.get('next-page') || ''
  }

  return allOrgs
}

export async function fetchOrganizationDetails(orgLink: string): Promise<ODSOrganisation | null> {
  console.log(`[ODS] Fetching details from: ${orgLink}`)
  try {
    const response = await fetch(orgLink, {
      headers: { 'Accept': 'application/json' }
    })
    if (!response.ok) return null
    return response.json()
  } catch (error) {
    console.error(`Error fetching details:`, error)
    return null
  }
} 