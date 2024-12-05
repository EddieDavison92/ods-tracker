// src/lib/ods/database.ts
import { createServerSupabaseClient } from '@/lib/supabase'
import type { Practice, PCN } from '@/types/database.types'
import { detectChanges } from '@/lib/changes'

export async function saveToDatabase(practices: Practice[], pcns: PCN[]) {
  const supabase = createServerSupabaseClient()
  console.log('[DB] Starting database updates')

  // Get existing data for change detection
  const { data: existingPractices } = await supabase
    .from('practices')
    .select('*')

  // Detect changes
  const changes = detectChanges(existingPractices || [], practices)

  // Save changes if any
  if (changes.length > 0) {
    await supabase.from('tracked_changes').insert(changes)
  }

  // Update practices and PCNs
  await supabase
    .from('practices')
    .upsert(practices, {
      onConflict: 'ods_code',
      ignoreDuplicates: false
    })

  await supabase
    .from('pcns')
    .upsert(pcns, {
      onConflict: 'ods_code',
      ignoreDuplicates: false
    })

  return { changes }
} 