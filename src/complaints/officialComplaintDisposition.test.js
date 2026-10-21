import { officialComplaintDisposition } from './officialComplaintDisposition'
const confirmed = outcome => ({ is_open: false, confirmed_at: '2026-10-21T00:00:00Z', confirmed_outcome: outcome })
test('awaiting, absent, concluded, and unlinked cases retain generic review labels', () => {
  for (const records of [null, { screening: { is_open: true } },
    { screening: confirmed('proceed_to_kp_process'), kpCase: null },
    { screening: confirmed('proceed_to_kp_process'), kpCase: { status: 'concluded' } }]) {
    expect(officialComplaintDisposition('under_review', records).label).toBe('Under barangay review')
  }
})
test('referral never implies an ongoing KP case, even with an older linked case', () => {
  expect(officialComplaintDisposition('screened', { screening: confirmed('refer_for_further_action'), kpCase: { status: 'in_process' } }).label).toBe('Referred for further action')
})
