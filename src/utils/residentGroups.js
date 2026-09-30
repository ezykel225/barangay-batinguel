// Resident account vocabulary, grouping, searching and account/registry
// reconciliation -- in one module, deliberately.
//
// Three surfaces need the same answers and used to derive them
// separately: the Residents tab (which accounts are which), the Reports
// tab (how many of each) and the Resident Portal (what the resident is
// told about their own account). Splitting that logic three ways is how
// a dashboard ends up showing a count that disagrees with the list
// underneath it, and how an official and a resident end up reading two
// different words for the same stored state.
//
// Everything here is pure: no Supabase, no React. That is what lets it
// be unit-tested without the environment variables the client throws
// for, and `residentGroups.test.js` exercises each rule in both
// directions.
//
// ⚠️ Nothing in this file changes what is STORED. `verification_status`
// keeps its four values (`pending`, `verified`, `rejected`,
// `ineligible`) with exactly the meanings migration 007 gave them. This
// module only decides how they are grouped, labelled and searched.

import { PUROKS } from '../constants/barangay'

// ── Name normalisation ───────────────────────────────────────
//
// One function, used by BOTH the registry badge on a resident row and
// the reconciliation panel. Two separate normalisations would let the
// badge say "in registry" while the panel counted the same account as
// missing from it -- a disagreement the official has no way to resolve.
//
// Trim, collapse runs of whitespace, lowercase. Nothing cleverer: no
// accent folding, no nickname table, no initial matching. This is a
// string comparison, never a claim about identity -- see
// findReconciliationIssues below.
export const normalizeName = (value) =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase()

export const normalizePurok = (value) =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase()

// A purok value the barangay's own list recognises. The list in
// constants/barangay.js is the authoritative one -- it is what the
// signup and settings dropdowns offer -- so anything outside it is a
// legacy free-text value from before the dropdown existed.
export const isKnownPurok = (value) =>
  PUROKS.some((purok) => normalizePurok(purok) === normalizePurok(value))

// Sentinel for the purok filter's last option. Covers both a blank
// purok and an off-list one, because from an official's side they are
// the same job: a value that cannot be grouped or matched and needs
// correcting with the resident.
export const PUROK_FILTER_UNLISTED = '__unlisted__'

export const purokMatchesFilter = (value, filter) => {
  if (!filter || filter === 'all') return true
  if (filter === PUROK_FILTER_UNLISTED) return !isKnownPurok(value)
  return normalizePurok(value) === normalizePurok(filter)
}

// ── The status vocabulary ────────────────────────────────────
//
// `label` is what an official sees, `residentLabel` what the account
// holder sees. They are close on purpose: an official reading "Awaiting
// review" and a resident reading "Pending verification" about the same
// row is how a support conversation goes wrong.
//
// `meaning` is the one-line explanation shown beside the badge, so the
// difference between "rejected" (fix it and resubmit) and "not a
// resident" (terminal, official only) is on screen rather than implied
// by two shades of red.
export const VERIFICATION_STATES = {
  pending: {
    group: 'requests',
    label: 'Awaiting review',
    residentLabel: 'Awaiting review',
    tone: 'pending',
    meaning: 'An official has not checked this account against an ID yet.',
  },
  verified: {
    group: 'residents',
    label: 'Verified',
    residentLabel: 'Verified',
    tone: 'approved',
    meaning: 'Checked against an ID by an official. Can request documents.',
  },
  rejected: {
    group: 'requests',
    label: 'Rejected — can resubmit',
    residentLabel: 'Rejected — you can resubmit',
    tone: 'declined',
    meaning: 'Details were wrong. The resident may correct them and return to review.',
  },
  ineligible: {
    group: 'notResidents',
    label: 'Not a resident',
    residentLabel: 'Not a resident of this barangay',
    tone: 'ineligible',
    meaning: 'Established not to be a resident of this barangay. Permanent — only an official can reopen it.',
  },
}

// An unrecognised stored value must not vanish from all three groups,
// or the counts stop adding up to the number of accounts. It lands in
// Requests -- the group that means "somebody needs to look at this" --
// and findReconciliationIssues reports it as well.
export const UNKNOWN_STATE = {
  group: 'requests',
  label: 'Unrecognised status',
  residentLabel: 'Awaiting review',
  tone: 'pending',
  meaning: 'This account holds a verification status the app does not recognise.',
}

export const describeVerification = (status) =>
  VERIFICATION_STATES[status] || UNKNOWN_STATE

export const groupIdForStatus = (status) => describeVerification(status).group

// ── The three groups ─────────────────────────────────────────
//
// Derived entirely from `verification_status`, which already is the
// authoritative record of this decision. No new table, no new column,
// and no second copy of the classification that could drift from it.
export const RESIDENT_GROUPS = [
  {
    id: 'requests',
    label: 'Requests',
    description:
      'Accounts still going through verification — waiting for an official, '
      + 'or sent back to the resident to correct.',
    emptyMessage: 'No accounts are waiting for verification.',
  },
  {
    id: 'residents',
    label: 'Residents',
    description:
      'Accounts an official has checked against an ID. Only these can request documents.',
    emptyMessage: 'No accounts have been verified yet.',
  },
  {
    id: 'notResidents',
    label: 'Not Residents',
    description:
      'Accounts established not to belong to a resident of this barangay. '
      + 'Permanent — only an official can reopen one.',
    emptyMessage: 'No accounts have been marked as not a resident.',
  },
]

export const groupResidents = (list = []) => {
  const groups = { requests: [], residents: [], notResidents: [] }
  list.forEach((resident) => {
    groups[groupIdForStatus(resident?.verification_status)].push(resident)
  })
  return groups
}

// ── Search ───────────────────────────────────────────────────
//
// Case-insensitive substring across the fields that actually exist on
// the row. No fuzzy scoring and no dependency: the IT evaluator's
// complaint was scrolling, and a substring match over a handful of
// columns solves that completely at this data size.
export const matchesSearch = (row, query, fields) => {
  const needle = (query || '').trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) =>
    String(row?.[field] ?? '').toLowerCase().includes(needle)
  )
}

export const RESIDENT_SEARCH_FIELDS = ['full_name', 'contact_number', 'purok']
export const REGISTRY_SEARCH_FIELDS = [
  'full_name', 'purok', 'household_number', 'contact_number',
]

export const filterRows = (list = [], { query = '', purok = 'all', fields }) =>
  list.filter(
    (row) => matchesSearch(row, query, fields) && purokMatchesFilter(row?.purok, purok)
  )

// ── D6: account ↔ registry reconciliation ────────────────────
//
// ⚠️ READ THIS BEFORE ADDING A RULE.
//
// There is no deterministic link between a resident account and a
// registry entry. `profiles` has no registry reference,
// `residents_registry` has no profile reference (`added_by` is the
// official who typed it), and `profiles.system_id` is null on every
// resident account, so it cannot serve as one either. The only thing
// the two tables share is the name string -- the same fragility
// documented for officials in CLAUDE.md.
//
// So this panel INFORMS; it never concludes, and it never writes.
// Nothing here merges records, rewrites a name, creates or deletes an
// account, or edits a registry entry. Every issue is something an
// official then decides about by hand.
//
// Two deliberate limits:
//
// 1. Exact normalised equality only. The resident row's registry badge
//    also shows a "similar name" case, and that substring test is
//    useful as a prompt to look closer -- but it is fuzzy, so it must
//    not drive a list captioned "problems". A near-match here would
//    report two different people as one, which is worse than reporting
//    nothing.
// 2. A missing optional field is never a finding. An uploaded ID is
//    optional by design -- requiring one would exclude the residents
//    who most need barangay documents -- so "verified without an ID on
//    file" is not listed. It describes the intended flow for a resident
//    verified in person.
//
// The proper fix for the whole class is the `profile_id` foreign key
// already recorded as outstanding in CLAUDE.md. That is a schema
// change, so it is not in this file's gift; until it exists, this is
// detection only.
const countByKey = (rows, keyOf) => {
  const counts = new Map()
  rows.forEach((row) => {
    const key = keyOf(row)
    if (!key) return
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return counts
}

export const findReconciliationIssues = ({
  residents = [],
  registryEntries = [],
} = {}) => {
  const registryNames = new Set(
    registryEntries.map((entry) => normalizeName(entry.full_name)).filter(Boolean)
  )
  const inRegistry = (row) => registryNames.has(normalizeName(row.full_name))

  const accountNameCounts = countByKey(residents, (r) => normalizeName(r.full_name))
  const registryNameCounts = countByKey(registryEntries, (e) => normalizeName(e.full_name))

  const issues = [
    {
      id: 'verified-not-in-registry',
      severity: 'notice',
      title: 'Verified accounts with no registry entry of the same name',
      explanation:
        'The registry is incomplete, so this is not evidence of anything wrong — '
        + 'and it is not a reason to reverse a verification. It is a prompt to add '
        + 'the resident to the registry once their residency is independently '
        + 'established. Never add someone to the registry in order to verify them: '
        + 'that makes the cross-reference circular while still looking reassuring.',
      items: residents
        .filter((r) => r.verification_status === 'verified' && !inRegistry(r))
        .map((r) => ({ key: r.id, label: r.full_name, detail: r.purok || 'no purok recorded' })),
    },
    {
      id: 'not-resident-in-registry',
      severity: 'warning',
      title: 'Accounts marked “Not a resident” whose name is in the registry',
      explanation:
        'Two barangay records disagree: the account says this person is not a '
        + 'resident, the registry lists the name. One of them is wrong, or they are '
        + 'two different people who share a name. Worth a look before the resident '
        + 'is turned away again — the account state is terminal and only an official '
        + 'can reopen it.',
      items: residents
        .filter((r) => r.verification_status === 'ineligible' && inRegistry(r))
        .map((r) => ({ key: r.id, label: r.full_name, detail: r.purok || 'no purok recorded' })),
    },
    {
      id: 'duplicate-account-names',
      severity: 'warning',
      title: 'Resident accounts sharing an identical name',
      explanation:
        'Any name-based cross-reference is ambiguous for these accounts, and an '
        + 'official acting on the wrong row would not see an error. Two residents '
        + 'may genuinely share a name — the point is that the name alone can no '
        + 'longer tell them apart.',
      items: residents
        .filter((r) => accountNameCounts.get(normalizeName(r.full_name)) > 1)
        .map((r) => ({
          key: r.id,
          label: r.full_name,
          detail: describeVerification(r.verification_status).label,
        })),
    },
    {
      id: 'duplicate-registry-names',
      severity: 'warning',
      title: 'Registry entries sharing an identical name',
      explanation:
        'The registry lists this name more than once, so a match against it does '
        + 'not identify one household. Merge or distinguish them by hand — the '
        + 'entries may be two real people or one entered twice, and only the '
        + 'barangay knows which.',
      items: registryEntries
        .filter((e) => registryNameCounts.get(normalizeName(e.full_name)) > 1)
        .map((e) => ({
          key: e.id,
          label: e.full_name,
          detail: e.household_number ? `household ${e.household_number}` : 'no household number',
        })),
    },
    {
      id: 'account-purok-unlisted',
      severity: 'notice',
      title: 'Accounts whose purok is blank or not on the barangay’s list',
      explanation:
        'Free-text entry predates the purok dropdown, so some accounts hold a '
        + 'spelling the system cannot group or match. Existing values are left '
        + 'exactly as stored — correct one only with the resident, and it is '
        + 'corrected permanently the next time they save their details, because '
        + 'the form now offers the list instead of a text box.',
      items: residents
        .filter((r) => !isKnownPurok(r.purok))
        .map((r) => ({
          key: r.id,
          label: r.full_name,
          detail: r.purok ? `recorded as “${r.purok}”` : 'no purok recorded',
        })),
    },
    {
      id: 'registry-purok-unlisted',
      severity: 'notice',
      title: 'Registry entries whose purok is blank or not on the barangay’s list',
      explanation:
        'Same cause as above, on the barangay’s own record. Editing the entry now '
        + 'offers the purok list.',
      items: registryEntries
        .filter((e) => !isKnownPurok(e.purok))
        .map((e) => ({
          key: e.id,
          label: e.full_name,
          detail: e.purok ? `recorded as “${e.purok}”` : 'no purok recorded',
        })),
    },
    {
      id: 'unrecognised-status',
      severity: 'warning',
      title: 'Accounts holding an unrecognised verification status',
      explanation:
        'The stored value is not one of the four this app knows. Such an account '
        + 'is shown under Requests so that it cannot disappear from every group '
        + 'and leave the counts short.',
      items: residents
        .filter((r) => !VERIFICATION_STATES[r.verification_status])
        .map((r) => ({
          key: r.id,
          label: r.full_name,
          detail: `stored as “${r.verification_status ?? 'null'}”`,
        })),
    },
  ]

  return issues.filter((issue) => issue.items.length > 0)
}
