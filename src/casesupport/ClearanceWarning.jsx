import { useEffect, useState } from 'react'
import { caseRpc } from './caseSupportApi'

export default function ClearanceWarning({ requestId }) {
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setResult(null); setFailed(false)
    caseRpc('clearance_case_warning', { p_request_id: requestId }).then((value) => { if (live) setResult(value === true) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [requestId])
  return <p className="field-note" data-review-state={failed ? 'unavailable' : result === null ? 'loading' : result ? 'warning' : 'clear'} role="status">{failed ? 'Case check unavailable — review manually according to barangay policy.'
    : result ? 'Unresolved case on record — review according to barangay policy. Informational only; approval is an official decision.'
      : result === false ? 'No unresolved case found through linked resident profiles. Unlinked parties require manual review.' : 'Checking linked case record…'}</p>
}
