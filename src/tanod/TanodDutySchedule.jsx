import { useMemo, useState } from 'react'
import { FaCalendarAlt, FaList, FaClock, FaMapMarkerAlt } from 'react-icons/fa'
import MonthCalendar from '../components/MonthCalendar'
import { groupByDateKey, monthOf, parseDateKey } from '../utils/monthGrid'
import { dutyState, dutyTime } from './tanodDuty'
import { portalAttendanceTime, portalDutyDate, portalShiftLabel, portalShiftWindow } from './tanodPresentation'

export default function TanodDutySchedule({ duties, today, now }) {
  const rows = useMemo(() => duties.filter((d) => parseDateKey(d.assignment_date)).slice().sort((a, b) =>
    a.assignment_date.localeCompare(b.assignment_date)
    || (Date.parse(a.shift_start) || 0) - (Date.parse(b.shift_start) || 0)
    || a.assignment_id.localeCompare(b.assignment_id)), [duties])
  const byDate = useMemo(() => groupByDateKey(rows, (d) => d.assignment_date), [rows])
  const [selected, setSelected] = useState(() => byDate.has(today) ? today : rows.find((d) => d.assignment_date >= today)?.assignment_date || today)
  const [month, setMonth] = useState(() => monthOf(selected))
  const [view, setView] = useState('calendar')
  const selectedRows = byDate.get(selected) || []
  const tone = (states) => states.includes('Check-out needed') ? 'warn'
    : states.every((state) => state === 'Completed') ? 'has' : 'default'
  const attendance = (d) => <>{d.checked_in_at && <p>Checked in: <time dateTime={d.checked_in_at}>{dutyTime(d.checked_in_at)}</time></p>}
    {d.checked_out_at && <p>Checked out: <time dateTime={d.checked_out_at}>{dutyTime(d.checked_out_at)}</time></p>}</>
  return <section className="td-duty-schedule" aria-labelledby="td-schedule-heading">
    <div className="dashboard-card-header"><h2 id="td-schedule-heading">Duty Schedule</h2>
      <div className="view-toggle" role="group" aria-label="How to browse duty">
        <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}><FaCalendarAlt aria-hidden="true" /> Calendar</button>
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><FaList aria-hidden="true" /> List</button>
      </div>
    </div>
    <p className="td-help">Only loaded assignments are shown: recent history and the next 30 days. Check In / Check Out remains above.</p>
    {view === 'calendar' ? <div className="td-duty-calendar-layout">
      <MonthCalendar year={month.year} month={month.month} onMonthChange={setMonth}
        selectedDate={selected} onSelectDate={setSelected} today={today} idPrefix="tanod-duty"
        renderDay={(cell) => {
          const entries = byDate.get(cell.key) || []
          const states = entries.map((d) => dutyState(d, now))
          const code = states.includes('Check-out needed') ? '!' : states.includes('Currently on duty') ? 'On'
            : states.includes('Scheduled') ? 'S' : states.includes('Completed') ? 'C' : 'I'
          return { count: entries.length, tone: entries.length ? tone(states) : 'default',
            marker: entries.length > 1 ? entries.length + ' ' + code : code,
            label: entries.length ? entries.length + ' assignment(s): ' + states.join(', ') : 'No duty scheduled' }
        }}
        caption="Markers: S scheduled, C completed, ! check-out needed, On currently on duty, I inactive. Select a date for details." />
      <section className="mcal-day-panel" aria-labelledby="td-selected-date">
        <h3 id="td-selected-date">{portalDutyDate(selected)}</h3>
        {!selectedRows.length ? <p className="mcal-day-empty">No duty scheduled on this date.</p> : <div className="mcal-day-list">
          {selectedRows.map((d) => <article className="mcal-day-item td-schedule-item" key={d.assignment_id}>
            <header><strong>{portalShiftLabel(d, duties) || 'Recorded assignment'}</strong><span className="td-state">{dutyState(d, now)}</span></header>
            <p className="td-meta"><FaClock aria-hidden="true" />{portalShiftWindow(d)}</p>
            <p className="td-meta"><FaMapMarkerAlt aria-hidden="true" />{d.area_label}</p>
            {attendance(d)}
          </article>)}
        </div>}
      </section>
    </div> : !rows.length ? <p className="mcal-day-empty">No duty assignments loaded.</p> : <ul className="td-schedule-list" aria-label="Loaded duty assignments in date order">
      {rows.map((d) => <li className="td-schedule-row" key={d.assignment_id}>
        <time className="td-date-tile" dateTime={d.assignment_date} aria-label={portalDutyDate(d.assignment_date)}>
          <span>{new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'Asia/Manila' }).format(new Date(d.assignment_date + 'T12:00:00+08:00'))}</span>
          <strong>{Number(d.assignment_date.slice(-2))}</strong><small>{d.assignment_date.slice(0,4)}</small>
        </time>
        <div className="td-schedule-body"><strong>{portalShiftLabel(d, duties) || 'Recorded assignment'}</strong>
          <p className="td-meta"><FaClock aria-hidden="true" />{portalShiftWindow(d)}</p>
          <p className="td-meta"><FaMapMarkerAlt aria-hidden="true" />{d.area_label}</p>
          {(d.checked_in_at || d.checked_out_at) && <dl className="td-schedule-attendance">
            {d.checked_in_at && <div><dt>Check in</dt><dd><time dateTime={d.checked_in_at}>{portalAttendanceTime(d.checked_in_at, d)}</time></dd></div>}
            {d.checked_out_at && <div><dt>Check out</dt><dd><time dateTime={d.checked_out_at}>{portalAttendanceTime(d.checked_out_at, d)}</time></dd></div>}
          </dl>}
        </div>
        <span className={'td-state td-state-' + (dutyState(d, now) === 'Check-out needed' ? 'warning' : dutyState(d, now) === 'Currently on duty' ? 'on' : dutyState(d, now) === 'Completed' ? 'completed' : 'scheduled')}>{dutyState(d, now)}</span>
      </li>)}
    </ul>}
  </section>
}
