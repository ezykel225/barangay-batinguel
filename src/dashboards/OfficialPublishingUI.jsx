import { parseDateKey } from '../utils/monthGrid'
import { eventTimeLabel } from '../utils/eventCalendar'

export const filterPublishingAnnouncements = (rows, query, category) => rows.filter(row =>
  (category === 'all' || row.badge === category) &&
  String(row.title || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

export function publishingDate(value) {
  if (!value) return 'Date not recorded'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = parseDateKey(value)
    if (!parsed) return 'Date not recorded'
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(parsed.year, parsed.month, parsed.day)))
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date not recorded' : new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date)
}
export const publishingEventPeriod = (value, today) => !parseDateKey(value) ? 'Unscheduled' : value >= today ? 'Upcoming' : 'Past'

export function PublishingTitle({ children }) {
  return <span className="publishing-title" tabIndex={0} title={children}>{children || 'Title not recorded'}</span>
}
export function PublishingReadNotice({ state, name, hasRows }) {
  const status = state?.status || 'loading'
  if (status === 'ready') return null
  return <p className="publishing-notice" role={status === 'loading' ? 'status' : 'alert'}>
    {status === 'loading' ? `Loading ${name}...` : status === 'incomplete' ? `A complete ${name} read could not be confirmed.` : status === 'denied' ? `${name} are not available for your account.` : `${name} could not be loaded. Try again later.`}
    {hasRows ? ' Previously loaded records remain visible.' : ''}
  </p>
}
export function PublishingEventDate({ event, today }) {
  const time = eventTimeLabel(event.event_time)
  const period = publishingEventPeriod(event.event_date, today)
  return <div className="publishing-date"><span>{publishingDate(event.event_date)}</span><small className={time ? undefined : 'publishing-time-missing'} aria-label={time ? undefined : 'Event time not recorded'}>{time || 'Time —'}</small><span className={`publishing-badge publishing-period-${period.toLowerCase()}`}>{period}</span></div>
}
