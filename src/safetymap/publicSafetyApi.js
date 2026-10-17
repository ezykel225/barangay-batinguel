// Final Integration — the PUBLIC Community Safety Map's four reads.
//
// ⚠️ THIS MODULE MUST NEVER CALL AN OFFICIAL READER. The four RPCs below are
// migration 045's, and they are the only functions in this project that read
// `incidents` without an official gate -- which is exactly why they return
// integers and grid-cell centres and nothing else. `incident_map_points`,
// `incident_queue`, `incident_detail`, `incident_location_frequency`,
// `tanod_roster` and `tanod_coverage_summary` are all gated on
// `current_official_is_active()`; an anonymous visitor is refused 42501 by
// every one of them, measured. A test asserts none of their names appears in
// this file.
//
// ⚠️ And there is no `supabase.from` here either. The six Combined Phase 2
// tables carry zero client privilege, so a table read would be refused --
// and writing one would imply a filter is what protects the data.

import { supabase } from '../supabase/supabaseClient'

const logFailure = (what, error) => console.warn(`[community-safety] ${what} failed`, error)

const call = async (fn, args, what) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) { logFailure(what, error); throw new Error('loadFailed') }
  return data || []
}

const range = ({ from, to } = {}) => ({ p_from: from || null, p_to: to || null })

// One row: total_incidents, mapped_incidents, zone_count.
// ⚠️ `mapped_incidents` and `zone_count` are counted from
// `public_safety_zones` INSIDE the function, so the number this page prints
// and the circles the map draws come from one definition of which areas are
// publishable.
export const loadPublicOverview = async (opts) => {
  const rows = await call('public_safety_overview', range(opts), 'Public overview')
  return rows[0] || { total_incidents: 0, mapped_incidents: 0, zone_count: 0 }
}

export const loadPublicZones = (opts) => call(
  'public_safety_zones', range(opts), 'Public zones'
)

export const loadPublicTypeCounts = (opts) => call(
  'public_safety_type_counts', range(opts), 'Public type counts'
)

export const loadPublicMonthly = (opts) => call(
  'public_safety_monthly', range(opts), 'Public monthly'
)
