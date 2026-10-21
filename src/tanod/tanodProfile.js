import { supabase } from '../supabase/supabaseClient'
import { pathFromPublicUrl } from '../utils/storagePath'

export const TANOD_PROFILE_FIELDS = 'id,role,full_name,first_name,middle_name,last_name,suffix,contact_number,photo_url,verification_status'

// Presentation only. Structured profile parts take precedence over legacy names.
export function compactTanodName(profile, rosterName = '') {
  if (profile?.first_name || profile?.last_name) {
    const first = profile.first_name?.trim()
    const last = profile.last_name?.trim()
    return first ? first + (last ? ` ${Array.from(last)[0].toLocaleUpperCase()}.` : '') : 'Barangay Tanod'
  }
  const parts = (profile?.full_name || rosterName).trim().split(/\s+/).filter(Boolean)
  if (/^(jr\.?|sr\.?|iii|iv|ii)$/i.test(parts[parts.length - 1] || '')) parts.pop()
  return parts.length > 1 ? `${parts[0]} ${Array.from(parts[parts.length - 1])[0].toLocaleUpperCase()}.` : parts[0] || 'Barangay Tanod'
}

export async function loadTanodProfile(userId) {
  if (!userId) throw new Error('Sign in with your linked Tanod account.')
  const { data, error } = await supabase.from('profiles').select(TANOD_PROFILE_FIELDS).eq('id', userId).eq('role', 'tanod').single()
  if (error || !data || data.id !== userId || data.role !== 'tanod') throw new Error('Your Tanod profile could not be loaded.')
  return data
}

async function updateOwnProfile(userId, payload) {
  if (!userId) throw new Error('Sign in with your linked Tanod account.')
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', userId).eq('role', 'tanod').select(TANOD_PROFILE_FIELDS)
  if (error || !data?.length || data[0].id !== userId || data[0].role !== 'tanod') throw new Error('Your profile change could not be confirmed. Refresh before trying again.')
  return data[0]
}

export async function saveTanodDetails(userId, details) {
  if (!details.first_name?.trim() || !details.last_name?.trim()) throw new Error('Please enter your first name and last name.')
  // Never send role, UUID, roster identity, link, verification or operational fields.
  const payload = Object.fromEntries(['first_name','middle_name','last_name','suffix','contact_number'].map(key => [key, details[key]?.trim() || null]))
  return updateOwnProfile(userId, payload)
}

const PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export function avatarProblem(file) {
  if (!file || !Object.prototype.hasOwnProperty.call(PHOTO_TYPES, file.type)) return 'Choose a JPG, PNG or WebP image.'
  if (!file.size || file.size > 5 * 1024 * 1024) return 'Choose an image up to 5 MB.'
  return ''
}
export async function saveTanodPhoto(userId, file, previousUrl) {
  if (!userId) throw new Error('Sign in with your linked Tanod account.')
  const problem = avatarProblem(file)
  if (problem) throw new Error(problem)
  const bucket = supabase.storage.from('resident-photos')
  const path = `${userId}/${Date.now()}.${PHOTO_TYPES[file.type]}`
  const { error } = await bucket.upload(path, file, { upsert: true })
  if (error) throw new Error('The photo could not be uploaded. Please try again.')
  const { data } = bucket.getPublicUrl(path)
  let profile
  try { profile = await updateOwnProfile(userId, { photo_url: data.publicUrl }) }
  catch (failure) { await bucket.remove([path]).catch(() => {}); throw failure }
  const previous = pathFromPublicUrl(previousUrl, 'resident-photos')
  // Replace the reference first; never delete another account's object.
  if (previous?.startsWith(`${userId}/`) && previous !== path) {
    try { await bucket.remove([previous]) } catch { /* A failed tidy-up must not undo a saved photo. */ }
  }
  return profile
}
