// src/types/ods.types.ts
export interface ODSOrganisation {
  Organisation: {
    Name: string
    Date: Array<{
      Type: string
      Start?: string
      End?: string
    }> | {
      Type: string
      Start?: string
      End?: string
    }
    OrgId: {
      extension: string
    }
    Status: string
    LastChangeDate: string
    orgRecordClass: string
    GeoLoc?: {
      Location: {
        AddrLn1?: string
        AddrLn2?: string
        AddrLn3?: string
        Town?: string
        County?: string
        Country?: string
        PostCode?: string
        UPRN?: number
      }
    }
    Roles: {
      Role: Array<{
        id: string
        uniqueRoleId: number
        primaryRole: boolean
        Status: string
        Date?: Array<{
          Type: string
          Start?: string
          End?: string
        }> | {
          Type: string
          Start?: string
          End?: string
        }
      }> | {
        id: string
        uniqueRoleId: number
        primaryRole: boolean
        Status: string
        Date?: Array<{
          Type: string
          Start?: string
          End?: string
        }> | {
          Type: string
          Start?: string
          End?: string
        }
      }
    }
    Contacts?: {
      Contact: Array<{
        type: string
        value: string
      }> | {
        type: string
        value: string
      }
    }
    Rels?: {
      Rel: Array<{
        id: string
        uniqueRelId: number
        Target: {
          OrgId: {
            extension: string
          }
          Name?: string
          PrimaryRoleId: {
            id: string
            uniqueRoleId: string
          }
        }
        Status: string
        Date: Array<{
          Type: string
          Start?: string
          End?: string
        }>
      }> | {
        id: string
        uniqueRelId: number
        Target: {
          OrgId: {
            extension: string
          }
          Name?: string
          PrimaryRoleId: {
            id: string
            uniqueRoleId: string
          }
        }
        Status: string
        Date: Array<{
          Type: string
          Start?: string
          End?: string
        }>
      }
    }
    Prescribing?: {
      code: string
    }
  }
}

export interface ODSListOrganisation {
  Name: string
  OrgId: string
  Status: 'Active' | 'Inactive'
  OrgRecordClass: string
  PostCode: string
  LastChangeDate: string
  PrimaryRoleId: string
  PrimaryRoleDescription: string
  OrgLink: string
}

export interface ODSListResponse {
  Organisations: ODSListOrganisation[]
} 