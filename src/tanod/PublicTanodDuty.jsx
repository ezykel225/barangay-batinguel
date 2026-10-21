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
  // Compare timezone-bearing instants, including Manila overnight shifts.
  const now = Date.now()
  const current = rows.filter(row => Date.parse(row.shift_start) <= now && now < Date.parse(row.shift_end))
  const renderRows = list => {
    const sharedArea = list[0]?.general_area && list.every(row => row.general_area === list[0].general_area) ? list[0].general_area : null
    return <>{sharedArea && <p className="public-duty-area">Patrol area: {sharedArea}</p>}<ul className="public-tanod-list">{list.map((row, index) => <li key={`${row.display_name}-${row.shift_start}-${index}`}>
    <strong>{row.display_name}</strong><span className={`td-state ${row.duty_state === 'currently_on_duty' ? 'td-state-on' : ''}`}>{row.duty_state === 'currently_on_duty' ? 'On Duty' : 'Scheduled'}</span>
    <span>{shiftWindow(row)}</span>{!sharedArea && <span>{row.general_area}</span>}
  </li>)}</ul></>
  }
  return <section className="public-tanod-duty" aria-labelledby="public-tanod-heading">
    <div className="public-duty-heading"><h2 id="public-tanod-heading">Tanod on Duty</h2><button type="button" className="btn-add" onClick={refresh}>Refresh duty status</button></div>
    <p>Showing Tanods assigned to the current shift. On-duty status requires a recorded check-in. This is not live location tracking.</p>
    {loading ? <p role="status">Loading duty information...</p> : failed ? <p role="status">Duty information is temporarily unavailable.</p> : <>
      {current.length ? renderRows(current) : <p>No Tanods are assigned to the current shift.</p>}
    </>}
  </section>
}
