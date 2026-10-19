import { useCallback, useEffect, useState } from 'react'
import { loadPublicTanodDuty } from './tanodPortalApi'
import { shiftWindow } from './tanodDuty'
import './TanodPortal.css'

export default function PublicTanodDuty() {
  const [rows, setRows] = useState([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    try { setRows(await loadPublicTanodDuty()); setFailed(false) }
    catch { setRows([]); setFailed(true) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 60000); return () => clearInterval(timer) }, [refresh])
  return <section className="public-tanod-duty" aria-labelledby="public-tanod-heading">
    <h2 id="public-tanod-heading">Tanod on Duty</h2>
    <p>Current and upcoming shifts, independent of the incident period selected below. “Currently on duty” requires a recorded check-in; a schedule alone does not confirm attendance. This is not live location tracking.</p>
    {loading ? <p role="status">Loading duty information…</p> : failed ? <p role="status">Duty information is temporarily unavailable.</p> : !rows.length ? <p>No current or upcoming duty information is published.</p>
      : <ul className="public-tanod-list">{rows.map((row, index) => <li key={`${row.display_name}-${row.shift_start}-${index}`}>
        <strong>{row.display_name}</strong><span className={`td-state ${row.duty_state === 'currently_on_duty' ? 'td-state-on' : ''}`}>{row.duty_state === 'currently_on_duty' ? 'Currently on duty' : 'Scheduled'}</span>
        <span>{shiftWindow(row)}</span><span>{row.general_area}</span>
      </li>)}</ul>}
    <button type="button" className="btn-add" onClick={refresh}>Refresh duty information</button>
  </section>
}
