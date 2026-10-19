import { useState } from 'react'
import { manilaDate } from './caseSupportApi'

// Accessible date-ordered schedule alongside the existing hearing/attendance editors.
export default function HearingSchedule({ hearings = [] }) {
  const [month, setMonth] = useState(manilaDate().slice(0,7))
  const rows = hearings.filter((h) => h.hearing_date?.startsWith(month)).sort((a,b) => `${a.hearing_date} ${a.start_time}`.localeCompare(`${b.hearing_date} ${b.start_time}`))
  return <details><summary>Hearing schedule by month</summary>
    <label>Schedule month<input className="modal-form-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
    {!rows.length ? <p>No hearings recorded for this month.</p> : <ul className="kp-list">{rows.map((h) => <li key={h.id}>
      <time dateTime={h.hearing_date}>{h.hearing_date}</time> {h.start_time?.slice(0,5)} — {h.location} — {h.status}
    </li>)}</ul>}
  </details>
}
