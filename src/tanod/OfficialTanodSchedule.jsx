import { useMemo, useState } from 'react'
import { FaCalendarAlt, FaList, FaMapMarkerAlt } from 'react-icons/fa'
import MonthCalendar from '../components/MonthCalendar'
import { groupByDateKey, monthOf, parseDateKey } from '../utils/monthGrid'
import { dutyDate } from './tanodDuty'
import { assignmentDateLabel, patrolTypeLabel } from './tanodLabels'
import { portalDutyDate, portalShiftLabel, portalShiftWindow } from './tanodPresentation'

// Display adapter only: assignments retain their stored date and time fields.
export const assignmentPresentation = (a) => {
  if (!a.start_time || !a.end_time) return { label: 'Scheduled shift', window: 'No time recorded' }
  const start = new Date(a.assignment_date + 'T' + a.start_time + '+08:00')
  const end = new Date(a.assignment_date + 'T' + a.end_time + '+08:00')
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return { label: 'Scheduled shift', window: 'No time recorded' }
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1)
  const shift = { shift_start: start.toISOString(), shift_end: end.toISOString() }
  return { label: portalShiftLabel(shift) || 'Scheduled shift', window: portalShiftWindow(shift) }
}

export default function OfficialTanodSchedule({ assignments, canAdminister, busy, onToggle, today = dutyDate() }) {
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(() => monthOf(today))
  const [view, setView] = useState('calendar')
  const [listMonth, setListMonth] = useState(today.slice(0,7))
  const [order, setOrder] = useState('oldest')
  const rows = useMemo(() => assignments.filter((a) => parseDateKey(a.assignment_date)).slice().sort((a,b) =>
    a.assignment_date.localeCompare(b.assignment_date) || (a.start_time || '').localeCompare(b.start_time || '') || a.tanod_name.localeCompare(b.tanod_name)), [assignments])
  const byDate = useMemo(() => groupByDateKey(rows, (a) => a.assignment_date), [rows])
  const groups = (entries) => {
    const byWindow = new Map()
    entries.forEach((a) => {
      const key = (a.start_time || '') + '/' + (a.end_time || '')
      if (!byWindow.has(key)) byWindow.set(key, [])
      byWindow.get(key).push(a)
    })
    return [...byWindow.entries()].map(([key, members]) => {
      const display = assignmentPresentation(members[0])
      return <section className="tnd-shift-group" key={key} aria-label={display.label + ' ' + display.window}>
        <header><h4>{display.label}</h4><span>{display.window}</span></header>
        <ul>{members.map((a) => <li key={a.id}>
          <div><strong>{a.tanod_name}</strong><span className="tnd-subline"><FaMapMarkerAlt aria-hidden="true" /> {a.area_label}</span><span className="tnd-subline">{patrolTypeLabel(a.patrol_type)}</span></div>
          <div className="tnd-assignment-state"><span className={'kp-badge kp-badge-' + (a.active ? 'open' : 'concluded')}>{a.active ? 'Active' : 'Stood down'}</span>
            {canAdminister && <button type="button" className="btn-cancel btn-sm" disabled={Boolean(busy)} aria-label={(a.active ? 'Stand down' : 'Reactivate') + ' assignment for ' + a.tanod_name + ' on ' + assignmentDateLabel(a.assignment_date)} onClick={() => onToggle(a)}>{a.active ? 'Stand down' : 'Reactivate'}</button>}
          </div>
        </li>)}</ul>
      </section>
    })
  }
  const dates = [...byDate.keys()].filter((date) => !listMonth || date.startsWith(listMonth)).sort()
  if (order === 'newest') dates.reverse()
  return <div className="tnd-schedule">
    <div className="view-toggle" role="group" aria-label="How to browse patrol schedules">
      <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><FaCalendarAlt aria-hidden="true" /> Calendar</button>
      <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><FaList aria-hidden="true" /> List</button>
    </div>
    <p className="field-note">Only loaded assignments are shown. Assignments indicate scheduling, not attendance. Shift labels describe demonstration windows; stored times remain authoritative.</p>
    {view === 'calendar' ? <div className="tnd-calendar-layout">
      <MonthCalendar year={month.year} month={month.month} onMonthChange={setMonth} selectedDate={selected} onSelectDate={setSelected} today={today} idPrefix="official-tanod"
        renderDay={(cell) => { const entries = byDate.get(cell.key) || []; return { count: entries.length, tone: entries.some((a) => a.active) ? 'has' : 'default', label: entries.length + ' assignments' } }}
        caption="Markers indicate recorded patrol assignments. Select a date to inspect its shifts." />
      <section className="mcal-day-panel" aria-labelledby="tnd-selected-date"><h3 id="tnd-selected-date">{portalDutyDate(selected)}</h3>
        {(byDate.get(selected) || []).length ? groups(byDate.get(selected)) : <p className="mcal-day-empty">Nothing scheduled on this date.</p>}
      </section>
    </div> : <>
      <div className="tnd-toolbar"><label>Schedule month<input className="modal-form-input" type="month" value={listMonth} onChange={(e) => setListMonth(e.target.value)} /></label>
        <label>Order<select className="modal-form-input" value={order} onChange={(e) => setOrder(e.target.value)}><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      </div>
      {!dates.length ? <p className="complaint-empty">No patrol assignments in this month.</p> : dates.map((date) => <section className="tnd-list-day" key={date} aria-label={portalDutyDate(date)}><h3>{portalDutyDate(date)}</h3>{groups(byDate.get(date))}</section>)}
    </>}
  </div>
}
