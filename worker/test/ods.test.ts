import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOrgBlock } from '../src/ods/xml.ts'
import { fromOrd, type OrdOrganisation } from '../src/ods/ord.ts'
import { diffOrg } from '../src/ods/diff.ts'
import { hashOrg, makeOrg, type OrgRecord } from '../src/ods/model.ts'
import { summarise } from '../src/api/summary.ts'

const XML = `<Organisation orgRecordClass="RC1">
    <Name>ARCHWAY &amp; CO MEDICAL CENTRE</Name>
    <Date><Type value="Operational" /><Start value="1974-04-01" /></Date>
    <OrgId root="x" assigningAuthorityName="HSCIC" extension="F83004" />
    <Status value="Active" />
    <LastChangeDate value="2024-04-01" />
    <GeoLoc><Location><AddrLn1>652 HOLLOWAY ROAD</AddrLn1><AddrLn3>ISLINGTON</AddrLn3><Town>LONDON</Town><PostCode>N19 3NU</PostCode><UPRN>5300048749</UPRN></Location></GeoLoc>
    <Contacts><Contact type="tel" value="020 72720111" /></Contacts>
    <Roles>
      <Role id="RO177" uniqueRoleId="90828" primaryRole="true"><Date><Type value="Operational" /><Start value="1974-04-01" /></Date><Status value="Active" /></Role>
      <Role id="RO76" uniqueRoleId="183613"><Date><Type value="Operational" /><Start value="2014-04-15" /></Date><Status value="Active" /></Role>
    </Roles>
    <Rels>
      <Rel id="RE8" uniqueRelId="738125">
        <Date><Type value="Legal" /><Start value="2021-05-01" /></Date>
        <Date><Type value="Operational" /><Start value="2021-04-30" /></Date>
        <Status value="Active" />
        <Target><OrgId root="x" assigningAuthorityName="HSCIC" extension="U02795" /><PrimaryRoleId id="RO272" uniqueRoleId="413691" /></Target>
      </Rel>
    </Rels>
  </Organisation>`

const ORD: OrdOrganisation = {
  Name: 'ARCHWAY & CO MEDICAL CENTRE',
  Date: [{ Type: 'Operational', Start: '1974-04-01' }],
  OrgId: { extension: 'F83004' },
  Status: 'Active',
  LastChangeDate: '2024-04-01',
  orgRecordClass: 'RC1',
  GeoLoc: { Location: { AddrLn1: '652 HOLLOWAY ROAD', AddrLn2: 'ISLINGTON', Town: 'LONDON', PostCode: 'N19 3NU', UPRN: 5300048749 } },
  Contacts: { Contact: [{ type: 'tel', value: '020 72720111' }] },
  Roles: {
    Role: [
      { id: 'RO76', uniqueRoleId: 183613, Date: [{ Type: 'Operational', Start: '2014-04-15' }], Status: 'Active' },
      { id: 'RO177', uniqueRoleId: 90828, primaryRole: true, Date: [{ Type: 'Operational', Start: '1974-04-01' }], Status: 'Active' },
    ],
  },
  Rels: {
    Rel: {
      id: 'RE8', uniqueRelId: 738125, Status: 'Active',
      Date: [{ Type: 'Legal', Start: '2021-05-01' }, { Type: 'Operational', Start: '2021-04-30' }],
      Target: { OrgId: { extension: 'U02795' }, PrimaryRoleId: { id: 'RO272' } },
    },
  },
}

test('XML and ORD JSON parse to the same record', () => {
  const a = parseOrgBlock(XML)
  const b = fromOrd(ORD)
  assert.deepEqual(a, b)
  assert.equal(hashOrg(a), hashOrg(b))
  assert.equal(a.name, 'ARCHWAY & CO MEDICAL CENTRE')
  assert.equal(a.addr2, 'ISLINGTON')
  assert.equal(a.addr3, null)
})

test('hash ignores child order', () => {
  const a = fromOrd(ORD)
  const b = makeOrg({ ...a, roles: [...a.roles].reverse() })
  assert.equal(hashOrg(a), hashOrg(b))
})

test('PCN move produces left/joined events', () => {
  const before = fromOrd(ORD)
  const after: OrgRecord = makeOrg({
    ...before,
    lastChange: '2026-06-01',
    rels: [
      { ...before.rels[0], opEnd: '2026-05-31', status: 'Inactive' },
      { id: 999, type: 'RE8', target: 'U99999', targetRole: 'RO272', status: 'Active', opStart: '2026-06-01', opEnd: null, legalStart: null, legalEnd: null },
    ],
  })
  const { events, rels } = diffOrg(before, after)
  assert.deepEqual(events.map((e) => [e.kind, e.related, e.effectiveDate]), [
    ['rel_added', 'U99999', '2026-06-01'],
    ['rel_ended', 'U02795', '2026-05-31'],
  ])
  assert.equal(rels.upsert.length, 2)
  const names = (c: string | null) => c ?? ''
  const text = events.map((e) => summarise({ ...e, relatedName: 'X PCN' }, names, names))
  assert.deepEqual(text, ['Joined PCN X PCN (U99999)', 'Left PCN X PCN (U02795)'])
})

test('closure emits closed but not status', () => {
  const before = fromOrd(ORD)
  const after = makeOrg({ ...before, status: 'Inactive', opEnd: '2026-03-31' })
  assert.deepEqual(diffOrg(before, after).events.map((e) => e.kind), ['closed'])
})

test('unchanged org has no events', () => {
  const a = fromOrd(ORD)
  assert.deepEqual(diffOrg(a, fromOrd(ORD)).events, [])
})
