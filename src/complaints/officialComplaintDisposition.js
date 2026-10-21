import { describeComplaintStatus } from './complaintLabels'

// Restricted detail presentation only; never used by the public/resident queue.
export function officialComplaintDisposition(status, records) {
  const screening = records?.screening
  if (screening && !screening.is_open && screening.confirmed_at) {
    if (screening.confirmed_outcome === 'refer_for_further_action') {
      return { label: 'Referred for further action', className: 'badge-pending' }
    }
    if (screening.confirmed_outcome === 'proceed_to_kp_process'
      && ['open', 'in_process'].includes(records.kpCase?.status)) {
      return { label: 'KP process ongoing', className: 'badge-pending' }
    }
  }
  return describeComplaintStatus(status)
}
