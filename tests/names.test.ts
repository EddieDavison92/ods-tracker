import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayAddress, displayName } from '../src/lib/names.ts'

test('title-cases ODS names and keeps acronyms and codes', () => {
  const cases: [string, string][] = [
    ['ARCHWAY MEDICAL CENTRE', 'Archway Medical Centre'],
    ['NHS WEST AND NORTH LONDON ICB - 93C', 'NHS West and North London ICB - 93C'],
    ['NORTH 2 ISLINGTON PCN', 'North 2 Islington PCN'],
    ['STOCKTON-ON-TEES', 'Stockton-on-Tees'],
    ["ST JOHN'S SURGERY", "St John's Surgery"],
    ["O'BRIEN & CO", "O'Brien & Co"],
    ['DR ABU & DR CRIGHTON-ADELUGBA', 'Dr Abu & Dr Crighton-Adelugba'],
    ['THE ADHD SERVICE', 'The ADHD Service'],
    ['UNIVERSITY COLLEGE LONDON HOSPITALS NHS FOUNDATION TRUST', 'University College London Hospitals NHS Foundation Trust'],
    ['KCHFT PRESCRIBING', 'KCHFT Prescribing'],
    ['PALOMA HEALTH ADHD : LSC ICB', 'Paloma Health ADHD : LSC ICB'],
    ['CAMDEN & ISLINGTON HA', 'Camden & Islington HA'],
  ]
  for (const [input, expected] of cases) assert.equal(displayName(input), expected)
})

test('leaves mixed-case names and empty values alone', () => {
  assert.equal(displayName('Boots UK Ltd'), 'Boots UK Ltd')
  assert.equal(displayName(''), '')
  assert.equal(displayName(null), '')
  assert.equal(displayName(undefined), '')
})

test('handles punctuation-only and odd tokens without throwing', () => {
  for (const s of ['-', '--', '()', '& &', '88-90', '(U02795)', 'A', '  SPACED   OUT  ', 'ÉCOLE FRANÇAISE', '"QUOTED"']) {
    assert.doesNotThrow(() => displayName(s))
  }
  assert.equal(displayName('(U02795)'), '(U02795)')
})

test('formats addresses', () => {
  assert.equal(displayAddress(['652 HOLLOWAY ROAD', null, 'LONDON']), '652 Holloway Road, London')
})
