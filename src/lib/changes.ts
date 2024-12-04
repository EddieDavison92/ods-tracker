import type { Practice, TrackedChange, ChangeValue } from '@/types/database.types'

export function detectChanges(oldPractices: Practice[], newPractices: Practice[]): Omit<TrackedChange, 'id'>[] {
  const changes: Omit<TrackedChange, 'id'>[] = []
  const now = new Date().toISOString()

  // Create maps for easier lookup
  const oldMap = new Map(oldPractices.map(p => [p.ods_code, p]))
  const newMap = new Map(newPractices.map(p => [p.ods_code, p]))

  // Check all practices in both old and new data
  const allOdsCodes = new Set([...oldMap.keys(), ...newMap.keys()])

  for (const odsCode of allOdsCodes) {
    const oldPractice = oldMap.get(odsCode)
    const newPractice = newMap.get(odsCode)

    // New practice
    if (!oldPractice && newPractice) {
      changes.push({
        change_date: now,
        change_type: 'new_practice',
        entity_type: 'practice',
        ods_code: odsCode,
        name: newPractice.name,
        old_value: null,
        new_value: newPractice,
        created_at: now
      })
      continue
    }

    // Practice closed
    if (oldPractice && !newPractice) {
      changes.push({
        change_date: now,
        change_type: 'practice_closed',
        entity_type: 'practice',
        ods_code: odsCode,
        name: oldPractice.name,
        old_value: oldPractice,
        new_value: null,
        created_at: now
      })
      continue
    }

    // Check for changes in existing practice
    if (oldPractice && newPractice) {
      // Status change
      if (oldPractice.status !== newPractice.status) {
        const change: ChangeValue = { status: newPractice.status }
        const oldChange: ChangeValue = { status: oldPractice.status }
        changes.push({
          change_date: now,
          change_type: 'status_change',
          entity_type: 'practice',
          ods_code: odsCode,
          name: newPractice.name,
          old_value: oldChange,
          new_value: change,
          created_at: now
        })
      }

      // PCN change
      if (oldPractice.current_pcn_code !== newPractice.current_pcn_code) {
        const change: ChangeValue = { pcn_code: newPractice.current_pcn_code }
        const oldChange: ChangeValue = { pcn_code: oldPractice.current_pcn_code }
        changes.push({
          change_date: now,
          change_type: 'pcn_change',
          entity_type: 'practice',
          ods_code: odsCode,
          name: newPractice.name,
          old_value: oldChange,
          new_value: change,
          created_at: now
        })
      }

      // Other details changes
      const detailFields = ['name', 'address', 'phone', 'email', 'website'] as const
      const changedDetails: ChangeValue = {}
      const oldDetails: ChangeValue = {}

      for (const field of detailFields) {
        if (oldPractice[field] !== newPractice[field]) {
          changedDetails[field] = newPractice[field]
          oldDetails[field] = oldPractice[field]
        }
      }

      if (Object.keys(changedDetails).length > 0) {
        changes.push({
          change_date: now,
          change_type: 'details_change',
          entity_type: 'practice',
          ods_code: odsCode,
          name: newPractice.name,
          old_value: oldDetails,
          new_value: changedDetails,
          created_at: now
        })
      }
    }
  }

  return changes
} 