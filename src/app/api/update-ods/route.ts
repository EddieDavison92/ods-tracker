// src/app/api/update-ods/route.ts
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { fetchAllOrganizations, fetchOrganizationDetails } from '@/lib/ods/fetch'
import { transformToPractice, transformToPCN, calculatePCNMemberships } from '@/lib/ods/transform'
import { saveToDatabase } from '@/lib/ods/database'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  return POST()
}

export async function POST() {
  try {
    // 1. Fetch all organizations
    const organizations = await fetchAllOrganizations()
    
    // 2. Fetch details for each organization
    const orgDetails = await Promise.all(
      organizations.map(org => fetchOrganizationDetails(org.OrgLink))
    )

    // 3. Transform data
    const practices = orgDetails
      .filter((org): org is NonNullable<typeof org> => org !== null)
      .map(transformToPractice)
      .filter((practice): practice is NonNullable<typeof practice> => practice !== null)

    const pcns = orgDetails
      .filter((org): org is NonNullable<typeof org> => org !== null)
      .map(transformToPCN)
      .filter((pcn): pcn is NonNullable<typeof pcn> => pcn !== null)

    // 4. Calculate PCN memberships
    calculatePCNMemberships(practices, pcns)

    // 5. Save to database
    const { changes } = await saveToDatabase(practices, pcns)

    // 6. Revalidate the home page
    revalidatePath('/')

    return NextResponse.json({
      success: true,
      summary: {
        totalPractices: practices.length,
        totalPCNs: pcns.length,
        changes: changes.length
      }
    })

  } catch (error) {
    console.error('[API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch ODS data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}