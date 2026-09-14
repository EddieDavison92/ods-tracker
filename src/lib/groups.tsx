import {
  Baby, Briefcase, Building, Building2, Eye, Gavel, GraduationCap, Heart, Hospital, Landmark, Library, Network,
  Pill, Smile, Stethoscope, Archive, Globe, HousePlus, type LucideIcon,
} from 'lucide-react'
import { GROUPS, groupDef, type Family, type GroupKey } from '../../worker/src/ods/groups'

export { GROUPS, groupDef }
export type { Family, GroupKey }

export const GROUP_ICONS: Record<GroupKey, LucideIcon> = {
  gp: Stethoscope,
  pcn: Network,
  branch: HousePlus,
  prescribing: Briefcase,
  pharmacy: Pill,
  dental: Smile,
  optical: Eye,
  trust: Hospital,
  trust_site: Building2,
  independent: Heart,
  social_care: Baby,
  commissioner: Landmark,
  local_authority: Building,
  school: GraduationCap,
  justice: Gavel,
  devolved: Globe,
  legacy: Archive,
  other: Library,
}

// Identity hues per family (validated categorical palette); used for icon marks only, never text.
export const FAMILY_COLOURS: Record<Family, string> = {
  primary: '#2a78d6',
  community: '#1baf7a',
  hospital: '#4a3aa7',
  social: '#eb6834',
  commissioning: '#e87ba4',
  public: '#eda100',
  other: '#898781',
}

export const FAMILY_LABELS: Record<Family, string> = {
  primary: 'Primary care',
  community: 'Pharmacy, dental and optical',
  hospital: 'Hospital and specialist care',
  social: 'Social care',
  commissioning: 'Commissioning',
  public: 'Public sector',
  other: 'Other',
}

export const FAMILY_ORDER: Family[] = ['primary', 'community', 'hospital', 'social', 'commissioning', 'public', 'other']

export const groupColour = (key: GroupKey | null | undefined) => FAMILY_COLOURS[groupDef(key).family]
