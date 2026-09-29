import toast from 'react-hot-toast'
import { supabase } from '../supabase/supabaseClient'

// Writes one row to public.activity_log.
//
// ─── WHY THIS LIVES HERE ──────────────────────────────────────────────
// It used to be defined inside OfficialDashboard, which meant the nurse
// dashboard had no way to reach it -- so not a single nurse action was
// ever recorded. Moving it into a module is the whole fix for that.
//
// ─── WHY IT NO LONGER SWALLOWS ERRORS ─────────────────────────────────
// The previous version caught every failure into console.error and
// returned. That hid a real, live bug for months: `action` and
// `entity_type` are constrained by CHECK constraints (migration 015),
// and the document-request handler passes the new status straight
// through as the action. So marking a request 'ready_for_pickup' or
// 'claimed' violated the constraint, raised 23514, and disappeared --
// which is why the live table contained zero document_request rows
// despite a request sitting at ready_for_pickup.
//
// Migration 016 widens the vocabulary so those values are accepted. But
// a silent audit trail is a trap regardless of today's vocabulary, so a
// failure is now visible.
//
// ─── WHY A FAILED LOG IS NOT A FAILED ACTION ──────────────────────────
// By the time we get here the approval, edit or deletion has already
// been written. Telling the official their action failed would be a
// lie, and re-trying or rolling back would be worse. So the toast says
// exactly what happened: the change was saved, the record of it was
// not. That is the honest message, and it gives them something to
// report rather than a silence nobody notices.
//
// Never pass ID-document contents, passwords, tokens or signed URLs in
// `details`. Officials' own typed reasons are the intended content.

// Mirrors the CHECK constraints in migration 016. Kept here so a typo
// in a call site is caught while developing rather than becoming an
// invisible 23514 in production.
export const ACTIONS = Object.freeze([
  // present since migration 015
  'approved',
  'declined',
  'verified',
  'rejected',
  'marked ineligible',
  'cancelled',
  // added by migration 016
  'added',
  'edited',
  'deleted',
  'archived',
  'restored',
  'reopened',
  'ready_for_pickup',
  'claimed',
])

export const ENTITY_TYPES = Object.freeze([
  // present since migration 015
  'reservation',
  'document_request',
  'resident_account',
  // added by migration 016
  'official',
  'announcement',
  'event',
  'waste_schedule',
  'registry_entry',
  'medicine',
  'health_event',
  'medical_program',
])

export const logActivity = async ({
  action,
  entityType,
  entityId,
  subject,
  details,
}) => {
  // Caught in development, before it can become a silent 23514.
  if (process.env.NODE_ENV !== 'production') {
    if (!ACTIONS.includes(action)) {
      console.error(
        `logActivity: "${action}" is not in the activity_log action vocabulary. `
        + 'Add it to migration 016 and to ACTIONS, or use an existing value.',
      )
    }
    if (!ENTITY_TYPES.includes(entityType)) {
      console.error(
        `logActivity: "${entityType}" is not in the activity_log entity_type `
        + 'vocabulary. Add it to migration 016 and to ENTITY_TYPES.',
      )
    }
  }

  // actor_id and actor_name are deliberately NOT sent. The
  // stamp_activity_actor trigger (migration 015) takes both from the
  // caller's own token and profile and discards anything the client
  // supplies, so sending them would be theatre.
  const { error } = await supabase.from('activity_log').insert([{
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    subject: subject ?? null,
    details: details ?? null,
  }])

  if (error) {
    console.error('Activity log write failed:', error.message, { action, entityType })
    toast.error(
      'The change was saved, but it could not be recorded in the Activity Log.',
      { id: 'activity-log-failure' },
    )
    return false
  }

  return true
}
