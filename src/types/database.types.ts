// src/types/database.types.ts
export interface Practice {
  ods_code: string
  name: string
  status: string
  operational_start: string | null
  operational_end: string | null
  legal_start: string | null
  legal_end: string | null
  address: string | null
  address_lines: string | null
  town: string | null
  county: string | null
  country: string | null
  postcode: string | null
  uprn: number | null
  current_pcn_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  prescribing_code: string | null
  primary_role: string | null
  org_record_class: string | null
  roles: {
    id: string
    uniqueRoleId: number
    primaryRole: boolean
    Status: string
    Date: Array<{
      Type: string
      Start?: string
      End?: string
    }>
  }[] | null
  relationships: {
    id: string
    uniqueRelId: number
    Status: string
    Target: {
      OrgId: {
        extension: string
      }
      PrimaryRoleId: {
        id: string
        uniqueRoleId: string
      }
    }
    Date: Array<{
      Type: string
      Start?: string
      End?: string
    }>
  }[] | null
  last_changed: string
  created_at: string
  updated_at: string
}

export interface PCN {
  ods_code: string
  name: string
  status: string
  operational_start: string | null
  operational_end: string | null
  legal_start: string | null
  legal_end: string | null
  address: string | null
  address_lines: string | null
  town: string | null
  county: string | null
  country: string | null
  postcode: string | null
  uprn: number | null
  member_count: number
  org_record_class: string | null
  roles: {
    id: string
    uniqueRoleId: number
    primaryRole: boolean
    Status: string
    Date: Array<{
      Type: string
      Start?: string
      End?: string
    }>
  }[] | null
  relationships: {
    id: string
    uniqueRelId: number
    Status: string
    Target: {
      OrgId: {
        extension: string
      }
      PrimaryRoleId: {
        id: string
        uniqueRoleId: string
      }
    }
    Date: Array<{
      Type: string
      Start?: string
      End?: string
    }>
  }[] | null
  last_changed: string
  created_at: string
  updated_at: string
  member_practices?: PCNMemberPractice[]
}

export type ChangeValue = {
  [K in 'name' | 'address' | 'phone' | 'email' | 'website' | 'status' | 'pcn_code']?: string | null
}

export type ChangeType = 
  | 'new_practice' 
  | 'status_change' 
  | 'pcn_change' 
  | 'practice_closed' 
  | 'details_change'

export type EntityType = 'practice' | 'pcn'

export interface TrackedChange {
  id: number
  change_date: string
  change_type: ChangeType
  entity_type: EntityType
  ods_code: string
  name: string
  old_value: Practice | PCN | Record<string, unknown> | null
  new_value: Practice | PCN | Record<string, unknown> | null
  created_at: string
}

export interface PCNMemberHistory {
  start: string | null
  end: string | null
}

export interface PCNMemberPractice {
  pcn_code: string
  ods_code: string
  name: string
  join_date: string | null
  history: PCNMemberHistory[]
} 