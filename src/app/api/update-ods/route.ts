// src/app/api/update-ods/route.ts
import { NextResponse } from 'next/server'
import type { ODSListOrganisation, ODSOrganisation } from '@/types/ods.types'
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Practice, PCN, TrackedChange } from '@/types/database.types'
import type { PostgrestError } from '@supabase/supabase-js'

const BASE_URL = 'https://directory.spineservices.nhs.uk/ORD/2-0-0'
const NCL_ICB_CODE = '93C'

interface ODSResponse {
  Organisations: ODSListOrganisation[]
}

// Add export config to disable caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST() {
  console.log('[API] Starting ODS fetch')

  try {
    // 1. First get all organizations
    const params = new URLSearchParams({
      RelTypeId: 'RE4,RE6',
      TargetOrgId: NCL_ICB_CODE,
      _format: 'json'
    })
    let url = `${BASE_URL}/organisations?${params}`
    let allOrgs: ODSListOrganisation[] = []

    // Fetch all pages
    while (url) {
      console.log('[API] Fetching:', url)
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as ODSResponse
      allOrgs = allOrgs.concat(data.Organisations || [])
      console.log('[API] Retrieved', data.Organisations?.length, 'organizations')

      url = response.headers.get('next-page') || ''
    }

    console.log('[API] Getting full details for all organizations...')
    const orgDetails: Record<string, ODSOrganisation> = {}
    
    for (const org of allOrgs) {
      console.log(`[API] Fetching details for: ${org.Name}`)
      const response = await fetch(org.OrgLink, {
        headers: { 'Accept': 'application/json' }
      })
      if (response.ok) {
        const data = await response.json()
        orgDetails[org.OrgId] = data
      }
    }

    // Filter and structure practices and PCNs
    const practices: Practice[] = []
    const pcns: PCN[] = []

    for (const org of Object.values(orgDetails)) {
      const roles = org.Organisation.Roles.Role
      const roleArray = Array.isArray(roles) ? roles : [roles]

      // Check if it's a practice
      if (roleArray.some(role => role.id === 'RO76')) {
        const practice: Practice = {
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
            Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : []).filter((d): d is { Type: string; Start?: string; End?: string } => !!d)
          })),
          relationships: org.Organisation.Rels?.Rel ? 
            (Array.isArray(org.Organisation.Rels.Rel) ? org.Organisation.Rels.Rel : [org.Organisation.Rels.Rel]) : 
            null,
          last_changed: org.Organisation.LastChangeDate,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        practices.push(practice)
      }

      // Check if it's a PCN
      if (roleArray.some(role => role.id === 'RO272' && role.primaryRole)) {
        const pcn: PCN = {
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
            Date: (r.Date ? (Array.isArray(r.Date) ? r.Date : [r.Date]) : []).filter((d): d is { Type: string; Start?: string; End?: string } => !!d)
          })),
          relationships: org.Organisation.Rels?.Rel ? 
            (Array.isArray(org.Organisation.Rels.Rel) ? org.Organisation.Rels.Rel : [org.Organisation.Rels.Rel]) : 
            null,
          last_changed: org.Organisation.LastChangeDate,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        pcns.push(pcn)
      }
    }

    // Save to Supabase
    const supabase = createServerSupabaseClient()

    // Get existing data
    const { data: existingPractices, error: existingPracticesError } = await supabase
      .from('practices')
      .select('*') as { data: Practice[] | null, error: PostgrestError | null }
    if (existingPracticesError) throw existingPracticesError

    // Track changes
    const changes: Omit<TrackedChange, 'id'>[] = []
    const now = new Date().toISOString()

    // Check for practice changes
    for (const practice of practices) {
      const existing = existingPractices?.find(p => p.ods_code === practice.ods_code)
      
      if (!existing) {
        // New practice
        changes.push({
          change_date: now,
          change_type: 'new_practice',
          entity_type: 'practice',
          ods_code: practice.ods_code,
          name: practice.name,
          old_value: null,
          new_value: practice,
          created_at: now
        })
      } else {
        // Check for status change
        if (existing.status !== practice.status) {
          changes.push({
            change_date: now,
            change_type: 'status_change',
            entity_type: 'practice',
            ods_code: practice.ods_code,
            name: practice.name,
            old_value: { status: existing.status },
            new_value: { status: practice.status },
            created_at: now
          })
        }

        // Check for PCN change
        if (existing.current_pcn_code !== practice.current_pcn_code) {
          changes.push({
            change_date: now,
            change_type: 'pcn_change',
            entity_type: 'practice',
            ods_code: practice.ods_code,
            name: practice.name,
            old_value: { pcn_code: existing.current_pcn_code },
            new_value: { pcn_code: practice.current_pcn_code },
            created_at: now
          })
        }

        // Check for other detail changes
        const detailFields = ['name', 'address', 'phone', 'email', 'website'] as const
        type DetailField = typeof detailFields[number]
        const changedDetails: Partial<Record<DetailField, string | null>> = {}
        const oldDetails: Partial<Record<DetailField, string | null>> = {}

        for (const field of detailFields) {
          if (existing[field] !== practice[field]) {
            changedDetails[field] = practice[field]
            oldDetails[field] = existing[field]
          }
        }

        if (Object.keys(changedDetails).length > 0) {
          changes.push({
            change_date: now,
            change_type: 'details_change',
            entity_type: 'practice',
            ods_code: practice.ods_code,
            name: practice.name,
            old_value: oldDetails,
            new_value: changedDetails,
            created_at: now
          })
        }
      }
    }

    // Check for closed practices
    for (const existing of existingPractices || []) {
      if (!practices.find(p => p.ods_code === existing.ods_code)) {
        changes.push({
          change_date: now,
          change_type: 'practice_closed',
          entity_type: 'practice',
          ods_code: existing.ods_code,
          name: existing.name,
          old_value: existing,
          new_value: null,
          created_at: now
        })
      }
    }

    // Record changes if any
    if (changes.length > 0) {
      const { error: changesError } = await supabase
        .from('tracked_changes')
        .insert(changes)
      if (changesError) throw changesError
    }

    // Before saving to Supabase, calculate PCN member practices
    for (const pcn of pcns) {
      // Find all practices that have ever been members of this PCN
      const memberPractices = practices.filter(practice => 
        practice.relationships?.some(rel => 
          rel.Target.OrgId.extension === pcn.ods_code && 
          rel.Target.PrimaryRoleId.id === 'RO272'
        )
      ).map(practice => {
        // Find all relationships with this PCN
        const pcnRels = practice.relationships?.filter(rel => 
          rel.Target.OrgId.extension === pcn.ods_code && 
          rel.Target.PrimaryRoleId.id === 'RO272'
        ) || []

        // Find current active relationship (no end date)
        const activeRel = pcnRels.find(rel => 
          rel.Status === 'Active' && 
          !rel.Date.some(d => d.End)
        )

        // Find historical relationships (must have an end date AND no active relationship)
        const historicalRels = activeRel ? [] : pcnRels.filter(rel => 
          rel.Date.some(d => d.End)
        )

        // Debug log for Oak Lodge Medical Centre
        if (practice.ods_code === 'E83032') {
          console.log('[PCN Debug] Oak Lodge relationships:', JSON.stringify({
            pcn: pcn.name,
            relationships: pcnRels.map(rel => ({
              status: rel.Status,
              dates: rel.Date,
              target: rel.Target.OrgId.extension
            }))
          }, null, 2))

          console.log('[PCN Debug] Oak Lodge membership:', JSON.stringify({
            activeRel: activeRel ? {
              status: activeRel.Status,
              dates: activeRel.Date
            } : null,
            historicalRels: historicalRels.map(rel => ({
              status: rel.Status,
              dates: rel.Date
            }))
          }, null, 2))
        }

        return {
          pcn_code: pcn.ods_code,
          ods_code: practice.ods_code,
          name: practice.name,
          join_date: activeRel?.Date.find(d => d.Type === 'Operational')?.Start || null,
          history: historicalRels.map(rel => ({
            start: rel.Date.find(d => d.Type === 'Operational')?.Start || null,
            end: rel.Date.find(d => d.Type === 'Operational')?.End || null
          }))
        }
      })

      // Update PCN member count - count practices with an active relationship
      pcn.member_count = memberPractices.filter(p => p.join_date !== null).length

      // First delete existing relationships
      const { error: deleteError } = await supabase
        .from('pcn_member_practices')
        .delete()
        .eq('pcn_code', pcn.ods_code)
      if (deleteError) throw deleteError

      // Then insert new ones if there are any
      if (memberPractices.length > 0) {
        const { error: insertError } = await supabase
          .from('pcn_member_practices')
          .insert(memberPractices)
        if (insertError) throw insertError
      }
    }

    // Update practices
    const { error: practiceUpsertError } = await supabase
      .from('practices')
      .upsert(practices, {
        onConflict: 'ods_code',
        ignoreDuplicates: false
      })
    if (practiceUpsertError) throw practiceUpsertError

    // Update PCNs
    const { error: pcnUpsertError } = await supabase
      .from('pcns')
      .upsert(pcns, {
        onConflict: 'ods_code',
        ignoreDuplicates: false
      })
    if (pcnUpsertError) throw pcnUpsertError

    return NextResponse.json(
      {
        success: true,
        summary: {
          totalPractices: practices.length,
          totalPCNs: pcns.length,
        }
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      }
    )

  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ODS data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
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
  const pcnRel = rels.find((rel: { 
    Target: { PrimaryRoleId: { id: string } }
    Status: string
    Date: Array<{ End?: string }>
  }) => 
    rel.Target.PrimaryRoleId.id === 'RO272' && 
    rel.Status === 'Active' &&
    !rel.Date.some(d => d.End)
  )
  return pcnRel?.Target.OrgId.extension || null
}

function getContact(contacts: ODSOrganisation['Organisation']['Contacts'], type: string): string | null {
  if (!contacts?.Contact) return null
  const contactArray = Array.isArray(contacts.Contact) ? contacts.Contact : [contacts.Contact]
  return contactArray.find((c: { type: string, value: string }) => c.type === type)?.value || null
}