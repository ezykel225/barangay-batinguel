import { supabase } from '../supabase/supabaseClient'

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw error
  return data
}

export const getResidentCreditProfile = residentId => rpc('community_credit_profile', { p_resident_id: residentId })
export const getMyCreditProfile = () => rpc('my_community_credit_profile')
export const getCreditAdminState = () => rpc('community_credit_admin_state')
export const saveCreditPolicy = policy => rpc('save_community_credit_policy', {
  p_id: policy.id || null, p_name: policy.name, p_description: policy.description || '',
  p_base_score: Number(policy.base_score), p_minimum_score: Number(policy.minimum_score), p_maximum_score: Number(policy.maximum_score),
})
export const activateCreditPolicy = id => rpc('activate_community_credit_policy', { p_id: id })
export const retireCreditPolicy = id => rpc('retire_community_credit_policy', { p_id: id })
export const saveCreditRule = rule => rpc('save_community_credit_rule', {
  p_id: rule.id || null, p_policy_id: rule.policy_id, p_rule_code: rule.rule_code, p_title: rule.title,
  p_description: rule.description || '', p_category: rule.category, p_source_domain: rule.source_domain,
  p_points_delta: Number(rule.points_delta), p_repairable: Boolean(rule.repairable),
})
export const setCreditRuleActive = (id, active) => rpc('set_community_credit_rule_active', { p_id: id, p_active: active })

