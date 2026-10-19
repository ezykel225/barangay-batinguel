import { useState } from 'react'
import { tanodRpc } from './tanodPortalApi'
import { dutyTime } from './tanodDuty'

export default function OfficialTanodNotes({ incidentId }) {
  const [rows, setRows] = useState([])
  const [problem, setProblem] = useState('')
  return <details onToggle={async (event) => {
    if (!event.currentTarget.open) return
    try { setRows(await tanodRpc('official_tanod_followups', { p_incident_id: incidentId }) || []); setProblem('') }
    catch { setProblem('Operational notes unavailable for this account.') }
  }}><summary>Tanod operational follow-up notes</summary>
    {problem ? <p role="status">{problem}</p> : !rows.length ? <p>No Tanod follow-up notes recorded.</p> : <ul>{rows.map((row) => <li key={row.id}><strong>{row.tanod_name}</strong> · {dutyTime(row.created_at)}<p>{row.note}</p></li>)}</ul>}
  </details>
}
