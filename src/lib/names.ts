// ODS publishes names and addresses in capitals. Display them in title case, keeping acronyms and codes.

const ACRONYMS = new Set([
  'NHS', 'ICB', 'ICS', 'PCN', 'PCNS', 'CCG', 'GP', 'GPS', 'UK', 'CIC', 'LLP', 'CSU', 'UCL', 'UCLH', 'KCL', 'HMP',
  'HMYOI', 'YOI', 'SARC', 'ADHD', 'CAMHS', 'IAPT', 'UTC', 'MIU', 'OOH', 'NHSE', 'DHSC', 'UKHSA', 'A&E', 'PCT',
  'SHA', 'CQC', 'BMA', 'PMS', 'APMS', 'GMS', 'MH', 'LD', 'ASD', 'STP', 'ED', 'OPD', 'ENT', 'ICU', 'HDU', 'MRI',
  'CT', 'IT', 'NW', 'NE', 'SW', 'SE', 'UHB', 'NHSBT', 'BUPA', 'HCRG', 'EMIS', 'TPP', 'SEL', 'NEL', 'NCL', 'NWL',
  'SWL', 'BOB', 'BLMK', 'BSW', 'LLR', 'PICU', 'CYP', 'LGBT', 'HIV', 'GUM', 'TB', 'RAF', 'MOD', 'DMS', 'IOW',
  'CHC', 'MSK', 'COPD', 'COVID', 'COVID-19', 'OT', 'SALT', 'PPG', 'AQP', 'CAS', 'NHS111', 'LSC', 'KMPT', 'SPA',
  'UCC', 'WIC', 'PLC', 'CBT', 'EIP', 'ARRS', 'GMC', 'SEND', 'ECT', 'HA', 'DHA', 'FHSA', 'AHA',
])
const LOWER = new Set(['and', 'of', 'the', 'for', 'in', 'on', 'at', 'to', 'by', 'with', 'a', 'an', 'upon', 'de', 'la', 'le', 'du', 'or'])
const MIXED: Record<string, string> = { DR: 'Dr', DRS: 'Drs', ST: 'St', MR: 'Mr', MRS: 'Mrs', MS: 'Ms', LTD: 'Ltd', MT: 'Mt' }

function capitalise(w: string): string {
  const lower = w.toLowerCase()
  // O'BRIEN -> O'Brien, JOHN'S -> John's
  return lower.replace(/(^|['’])(\p{L})(\p{L}*)/gu, (_, p: string, c: string, rest: string) =>
    p && rest.length === 0 ? p + c : p + c.toUpperCase() + rest)
}

function word(w: string, first: boolean): string {
  const core = w.replace(/^[^\p{L}\p{N}&]+|[^\p{L}\p{N}&]+$/gu, '')
  if (!core || !/\p{Lu}/u.test(core)) return w
  const [lead, trail] = [w.slice(0, w.indexOf(core)), w.slice(w.indexOf(core) + core.length)]
  let out: string
  if (ACRONYMS.has(core)) out = core
  else if (MIXED[core]) out = MIXED[core]
  else if (/\d/.test(core)) out = core
  else if (core.length <= 6 && !/[AEIOUY]/.test(core)) out = core // no vowels: an acronym, e.g. KCHFT, BNSSG
  else if (!first && LOWER.has(core.toLowerCase())) out = core.toLowerCase()
  else out = capitalise(core)
  return lead + out + trail
}

export function displayName(name: string | null | undefined): string {
  if (!name) return ''
  // Leave names that already use mixed case.
  if (/\p{Ll}/u.test(name)) return name
  let first = true
  return name
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token
      const parts = token.split('-')
      const out = parts.map((p, i) => word(p, first && i === 0) || p).join('-')
      first = false
      return out
    })
    .join('')
}

export function displayAddress(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).map((p) => displayName(p)).join(', ')
}
