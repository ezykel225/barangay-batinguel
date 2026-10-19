import { supabase } from '../supabase/supabaseClient'
import { loadMyTanodIdentity, loadMyDuty, loadMyReports, checkIn, checkOut, addFollowup, loadMyFollowups, loadAccountStates, setAccountLink, loadPublicTanodDuty } from './tanodPortalApi'
jest.mock('../supabase/supabaseClient', () => ({ supabase: { rpc: jest.fn() } }))
beforeEach(() => { supabase.rpc.mockResolvedValue({ data: [], error: null }) })
test.each([
  [loadMyTanodIdentity,'tanod_my_identity'],[loadMyDuty,'tanod_my_duty'],[loadMyReports,'tanod_my_reports'],
  [loadAccountStates,'tanod_account_states'],[loadPublicTanodDuty,'public_tanod_on_duty'],
])('%p calls %s with no frontend identity selector', async (reader,name) => {
  await reader('spoofed-other-tanod')
  expect(supabase.rpc).toHaveBeenCalledWith(name,{})
})
test('attendance RPCs accept only their record IDs, never a Tanod or timestamp', async () => {
  await checkIn('assignment-a','spoofed-tanod','spoofed-time')
  expect(supabase.rpc).toHaveBeenLastCalledWith('tanod_check_in',{ p_assignment_id: 'assignment-a' })
  await checkOut('attendance-a','spoofed-tanod','spoofed-time')
  expect(supabase.rpc).toHaveBeenLastCalledWith('tanod_check_out',{ p_attendance_id: 'attendance-a' })
})
test('operational follow-up sends incident UUID and trimmed note only', async () => {
  await addFollowup('incident-a','  Observation  ','spoofed-tanod')
  expect(supabase.rpc).toHaveBeenLastCalledWith('tanod_add_followup',{ p_incident_id: 'incident-a',p_note: 'Observation' })
  await loadMyFollowups('incident-a','spoofed-tanod')
  expect(supabase.rpc).toHaveBeenLastCalledWith('tanod_my_followups',{ p_incident_id: 'incident-a' })
})
test('authorized account linking uses two stable IDs and an explicit null for unlinking', async () => {
  await setAccountLink('tanod-a','profile-a')
  expect(supabase.rpc).toHaveBeenLastCalledWith('set_tanod_account_link',{ p_tanod_id: 'tanod-a',p_profile_id: 'profile-a' })
  await setAccountLink('tanod-a',null)
  expect(supabase.rpc).toHaveBeenLastCalledWith('set_tanod_account_link',{ p_tanod_id: 'tanod-a',p_profile_id: null })
})
test('server refusals do not leak SQL/policy details into the UI', async () => {
  supabase.rpc.mockResolvedValue({ data: null,error: { message: 'sensitive SQL/table detail' } })
  await expect(loadMyDuty()).rejects.toThrow('The Tanod operation could not be completed')
  await expect(loadMyDuty()).rejects.not.toThrow('sensitive SQL')
})
