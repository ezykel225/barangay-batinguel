import { supabase } from '../supabase/supabaseClient'

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export const getResidentCreditProfile = residentId => rpc('community_credit_profile', { p_resident_id: residentId })
export const getMyCreditProfile = () => rpc('my_community_credit_profile')
export const getCreditAdminState = () => rpc('community_credit_admin_state')
export const getCreditDirectory = () => rpc('community_credit_resident_directory')
export const getCreditActivities = () => rpc('community_credit_activities_list', { p_year: null })
export const getMyCorrections = () => rpc('my_community_credit_correction_requests')
export const getAdminCorrections = () => rpc('community_credit_correction_requests_admin', { p_status: null })
export const submitCreditCorrection = args => rpc('submit_community_credit_correction_request', args)
export const creditWorkflow = (name, args) => {
  const allowed = ['save_community_credit_v2_policy','approve_community_credit_v2_policy','save_community_credit_v2_rule','approve_community_credit_v2_rule','create_community_credit_activity','verify_community_credit_participation','award_community_credit_participation','reverse_community_credit_award','reaward_community_credit_participation','resolve_community_credit_correction_request']
  if (!allowed.includes(name)) return Promise.reject(new Error('Unsupported credit workflow'))
  return rpc(name, args)
}
export const saveCreditPolicy = policy => rpc('save_community_credit_policy', {
  p_id: policy.id || null, p_name: policy.name, p_description: policy.description || '',
  p_base_score: Number(policy.base_score), p_minimum_score: Number(policy.minimum_score), p_maximum_score: Number(policy.maximum_score),
})
export const activateCreditPolicy = id => rpc('activate_community_credit_policy', { p_id: id })
export const retireCreditPolicy = id => rpc('retire_community_credit_policy', { p_id: id })
export const enrollActiveResidents = id => rpc('community_credit_enroll_active_residents', { p_policy_id: id })
export const saveCreditRule = rule => rpc('save_community_credit_rule', {
  p_id: rule.id || null, p_policy_id: rule.policy_id, p_rule_code: rule.rule_code, p_title: rule.title,
  p_description: rule.description || '', p_category: rule.category, p_source_domain: rule.source_domain,
  p_points_delta: Number(rule.points_delta), p_repairable: Boolean(rule.repairable),
})
export const setCreditRuleActive = (id, active) => rpc('set_community_credit_rule_active', { p_id: id, p_active: active })

