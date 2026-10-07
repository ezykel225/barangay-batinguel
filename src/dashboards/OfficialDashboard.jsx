import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FaClipboardList,
  FaBullhorn,
  FaCalendarAlt,
  FaUsers,
  FaUser,
  FaUserTie,
  FaPlus,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaEdit,
  FaTrash,
  FaFilter,
  FaArchive,
  FaUndo,
  FaSearch,
  FaTimes,
  FaList,
  FaCheck,
  FaBoxOpen,
  FaCheckDouble,
  FaPrint,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { pathFromPublicUrl } from '../utils/storagePath'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import ActionMenu from '../components/ActionMenu'
import { useModalA11y } from '../components/useModalA11y'
import NotificationBell from '../components/NotificationBell'
import { useNotifications } from '../components/useNotifications'
import { PersonAvatar, portraitWillBeLost } from '../utils/officialPhotos'
import {
  OFFICIAL_AVAILABILITY_STATUSES,
  availabilityLabel,
  buildOfficialWeek,
} from '../utils/officialAvailability'
import { logActivity } from '../utils/activityLog'
import DocumentPreview from '../documents/DocumentPreview'
import { canGenerate } from '../documents/documentRegistry'
import {
  actionCellIsEmpty,
  documentRequestActions,
  documentRequestSubject,
  reservationActions,
  reservationSubject,
} from '../utils/rowActions'
import { useConfirm } from '../components/ConfirmDialog'
import {
  ArchiveOfficialDialog,
  RestoreOfficialDialog,
} from '../components/OfficialArchiveDialog'
import { PUROKS, PUNONG_BARANGAY_LABEL } from '../constants/barangay'
import {
  activityActionLabel,
  activityEntityLabel,
  countUpcoming,
  manilaToday,
  documentStatusClass,
  documentStatusLabel,
  reservationStatusClass,
  reservationStatusLabel,
} from '../utils/displayLabels'
import {
  RESIDENT_GROUPS,
  RESIDENT_SEARCH_FIELDS,
  REGISTRY_SEARCH_FIELDS,
  filterDocumentRequests,
  RESERVATION_SEARCH_FIELDS,
  PUROK_FILTER_UNLISTED,
  describeVerification,
  filterRows,
  findReconciliationIssues,
  groupResidents,
  isActionableSeverity,
  isKnownPurok,
  normalizeName,
  purokShortLabel,
  RECONCILE_SEVERITIES,
  VOTER_LIST_CAVEAT,
} from '../utils/residentGroups'
import {
  EXCEPTION_BADGE_LABEL,
  isExceptionRequest,
} from '../utils/reservationWindow'
import MonthCalendar from '../components/MonthCalendar'
import {
  buildReservationCalendar,
  describeReservationDay,
  reservationsOnDate,
} from '../utils/reservationCalendar'
import { buildEventCalendar, describeEventDay, eventsOnDate } from '../utils/eventCalendar'
import { MONTH_NAMES, monthOf, parseDateKey, toDateKey } from '../utils/monthGrid'
import '../components/Sidebar.css'
import './OfficialDashboard.css'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ─── Who the Add form may create, and who it may not ─────────────────
//
// ⚠️ These three decide permissions. `position` is read by the Secretary
// and Treasurer RLS policies, and migration 029 REFUSES an API INSERT
// that names any of them -- so offering them here would be offering a
// control the database turns down.
//
// The database is the authority; this list only keeps the form honest.
// The same three are named by
// `barangay_officials_one_active_per_powered_position` (028) and by the
// `isKapitan` / `isTreasurer` / `isSecretary` gates below. A fourth
// powered position has to be added to all four together.
const POWERED_POSITIONS = ['Punong Barangay', 'Barangay Secretary', 'Barangay Treasurer']

// Kagawad is a seven-seat office and SK Chairperson carries no
// permission, so both stay creatable. Add Official is how the missing
// Kagawad of 2026-09-30 was restored, with no code change -- that is
// the property worth keeping.
const CLIENT_ASSIGNABLE_POSITIONS = ['Kagawad', 'SK Chairperson']

// A date key as a heading. Through parseDateKey, so a 'YYYY-MM-DD' is
// never handed to `new Date()` and cannot shift a day.
const longDate = (key) => {
  const parsed = parseDateKey(key)
  return parsed ? `${parsed.day} ${MONTH_NAMES[parsed.month]} ${parsed.year}` : ''
}

// The ⋮ menu items for the two queues carry an icon each; the words,
// the order and which statuses offer what live in
// `src/utils/rowActions.js`, which is pure and unit-tested. Keyed by
// the same action keys that module emits, so a key it adds without an
// icon here renders the label alone rather than crashing.
const DOC_ACTION_ICONS = {
  approve: <FaCheck />,
  decline: <FaTimes />,
  ready: <FaBoxOpen />,
  claimed: <FaCheckDouble />,
  generate: <FaPrint />,
}

const RESERVATION_ACTION_ICONS = {
  approve: <FaCheck />,
  deny: <FaTimes />,
}

// Queue | Calendar, Table | Calendar. One control, two tabs.
const ViewToggle = ({ label, value, options, onChange }) => (
  <div className="view-toggle" role="group" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => onChange(option.value)}
        aria-pressed={value === option.value}
      >
        {option.icon}
        {option.label}
      </button>
    ))}
  </div>
)

// Search box + one optional dropdown + result count + reset. Shared by
// the Residents tab, the Voter Reference List tab and the Reservations
// queue, which is why the dropdown is a prop rather than the purok select
// it started as: Reservations needs the status filter in that slot.
//
// `selectFilter` is { label, value, onChange, options: [{ value, label }] }
// or absent, in which case only the search box is rendered.
//
// `toggleFilter` is { label, checked, onChange } or absent: one checkbox
// for a yes/no narrowing that is not a status. Reservations uses it for
// office-hours exceptions, which cut across every status -- a pending
// exception and an approved one are both exceptions -- so it could not
// be another entry in the status dropdown without making two different
// dimensions look like one.
//
// ⚠️ Declared at module scope, NOT inside OfficialDashboard. A component
// defined in a render body is a brand-new component type on every
// render, so React unmounts the old tree and mounts a fresh one --
// which throws the text cursor out of the search box after the first
// keystroke and makes the field feel broken. Same reason the filter
// state lives in the dashboard rather than in here.
const DashboardFilterBar = ({
  idPrefix,
  searchLabel,
  placeholder,
  query,
  onQueryChange,
  selectFilter,
  toggleFilter,
  resultText,
  onReset,
  filtersActive,
}) => (
  <div className="resident-filter-bar">
    <div className="resident-search-field">
      <FaSearch className="resident-search-icon" aria-hidden="true" />
      {/* A real label rather than a bare placeholder: a placeholder
          disappears as soon as anything is typed and is not a name for
          assistive technology. Hidden visually because the magnifier and
          the placeholder already say what the field is. */}
      <label className="visually-hidden" htmlFor={`${idPrefix}-search`}>
        {searchLabel}
      </label>
      <input
        id={`${idPrefix}-search`}
        type="search"
        className="resident-search-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query !== '' && (
        <button
          type="button"
          className="resident-search-clear"
          onClick={() => onQueryChange('')}
          aria-label="Clear the search box"
        >
          <FaTimes aria-hidden="true" />
        </button>
      )}
    </div>

    {selectFilter && (
      <div className="filter-select-wrap">
        <FaFilter style={{ fontSize: 12, color: '#6b7280' }} aria-hidden="true" />
        <label className="visually-hidden" htmlFor={`${idPrefix}-filter`}>
          {selectFilter.label}
        </label>
        <select
          id={`${idPrefix}-filter`}
          className="filter-select"
          value={selectFilter.value}
          onChange={(event) => selectFilter.onChange(event.target.value)}
        >
          {selectFilter.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    )}

    {toggleFilter && (
      <div className="filter-toggle-wrap">
        <input
          id={`${idPrefix}-toggle`}
          type="checkbox"
          checked={toggleFilter.checked}
          onChange={(event) => toggleFilter.onChange(event.target.checked)}
        />
        <label htmlFor={`${idPrefix}-toggle`}>{toggleFilter.label}</label>
      </div>
    )}

    {/* role="status" so the count is announced as the list narrows --
        otherwise a screen reader user types into a box and hears
        nothing change. */}
    <p className="resident-filter-count" role="status">{resultText}</p>

    <button
      type="button"
      className="resident-filter-reset"
      onClick={onReset}
      disabled={!filtersActive}
    >
      Reset
    </button>
  </div>
)

// The purok dropdown's options. Blank and off-list share one entry
// because they are the same job from an official's side: a value that
// cannot be grouped or matched.
const PUROK_FILTER_OPTIONS = [
  { value: 'all', label: 'All Puroks' },
  ...PUROKS.map((purok) => ({ value: purok, label: purok })),
  { value: PUROK_FILTER_UNLISTED, label: 'Blank or not on the list' },
]

// The reservation status dropdown. `cancelled` is new here: a resident
// may cancel their own pending or approved booking, so those rows exist
// and were visible under "All Statuses" -- but there was no way to filter
// to them, and no way to filter them out.
// The five stored values of document_requests.status, in the order a
// request moves through them. Wording comes from displayLabels so the
// filter cannot name a status differently from the badge beside it.
const DOCUMENT_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: documentStatusLabel('pending') },
  { value: 'approved', label: documentStatusLabel('approved') },
  { value: 'ready_for_pickup', label: documentStatusLabel('ready_for_pickup') },
  { value: 'claimed', label: documentStatusLabel('claimed') },
  { value: 'declined', label: documentStatusLabel('declined') },
]

const RESERVATION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

// One editable day of an official's consultation hours.
//
// ⚠️ Each row keeps its OWN draft and saves itself. The alternative --
// one form over seven days with a single Save -- means a mistake in one
// day blocks the other six, and it is the shape that produced the
// "Nothing was saved" confusion elsewhere in this dashboard. Here the
// unit of work is a day, and so is the unit of feedback.
const AvailabilityDayRow = ({ entry, saving, onSave }) => {
  const [draft, setDraft] = useState({
    status: entry.row?.status || 'unavailable',
    time_start: entry.row?.time_start || '',
    time_end: entry.row?.time_end || '',
    note: entry.row?.note || '',
  })

  // Re-seed when the saved row changes underneath, so a successful save
  // leaves the field showing what the database now holds rather than
  // what was typed.
  useEffect(() => {
    setDraft({
      status: entry.row?.status || 'unavailable',
      time_start: entry.row?.time_start || '',
      time_end: entry.row?.time_end || '',
      note: entry.row?.note || '',
    })
  }, [entry.row])

  const idFor = (field) => `avail-${entry.day}-${field}`
  const needsHours = draft.status === 'available'

  return (
    <div className="availability-day">
      <h4 className="availability-day-name">{entry.day}</h4>

      <div className="availability-field">
        <label htmlFor={idFor('status')}>Status</label>
        <select
          id={idFor('status')}
          value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
        >
          {/* ⚠️ The words come from the shared availability map, and the
              VALUES are the stored ones -- which are exactly what
              migration 026's CHECK accepts. A word offered here that
              the database refuses produces a bare 23514 instead of a
              sentence; a test walks the migration file to hold the two
              together. */}
          {OFFICIAL_AVAILABILITY_STATUSES.map((status) => (
            <option key={status} value={status}>{availabilityLabel(status)}</option>
          ))}
        </select>
      </div>

      {/* Only an available day has hours, so the fields appear only
          then -- rather than sitting there greyed out, which invites
          somebody to fill them in and wonder why they vanished. */}
      {needsHours && (
        <>
          <div className="availability-field">
            <label htmlFor={idFor('start')}>From</label>
            <input
              id={idFor('start')}
              type="text"
              value={draft.time_start}
              onChange={(e) => setDraft({ ...draft, time_start: e.target.value })}
              placeholder="9:00 AM"
            />
          </div>
          <div className="availability-field">
            <label htmlFor={idFor('end')}>To</label>
            <input
              id={idFor('end')}
              type="text"
              value={draft.time_end}
              onChange={(e) => setDraft({ ...draft, time_end: e.target.value })}
              placeholder="11:00 AM"
            />
          </div>
        </>
      )}

      <div className="availability-field availability-field-wide">
        <label htmlFor={idFor('note')}>Note (optional)</label>
        <input
          id={idFor('note')}
          type="text"
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="Walk-ins welcome"
        />
      </div>

      <button
        type="button"
        className="btn-approve availability-save"
        disabled={saving}
        onClick={() => onSave(draft)}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}

const OfficialDashboard = () => {
  const { user } = useAuth()
  // Destructive actions go through this rather than acting on the first
  // click. confirm() resolves true/false, so each handler needs one
  // early return and nothing else changes -- which matters, because
  // several of these sit on top of the per-row processing locks.
  const [confirm, confirmDialog] = useConfirm()
  const [activeTab, setActiveTab] = useState('dashboard')

  // ── Notifications ──────────────────────────────────────────────────
  //
  // ⚠️ The sidebar badges below are NOT repointed to this. They count
  // what is still WAITING -- document requests at `pending`, accounts at
  // `pending` -- which is a different question from "have you seen it".
  // An official who has read a notification still has the work to do, so
  // a badge driven by read state would clear while the queue stayed
  // full. The resident portal is the opposite case and is repointed.
  const {
    notifications,
    readIds: notifReadIds,
    loading: notifLoading,
    refresh: refreshNotifications,
    markRead: markNotificationRead,
    markAllRead: markAllNotificationsRead,
  } = useNotifications(user?.id)

  // Opening the tab a notification points at counts as having seen it,
  // so the bell can be cleared without using the bell -- the same
  // behaviour the resident portal already had for its unseen badges.
  // Realtime is deferred, so a tab change is the refresh point: it is
  // the moment the reader is asking to see that part of the dashboard
  // anyway. Keyed on activeTab ALONE -- adding `notifications` here
  // would make the refresh its own trigger.
  useEffect(() => {
    refreshNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  useEffect(() => {
    notifications
      .filter((n) => n.link_tab === activeTab && !notifReadIds.has(n.id))
      .forEach((n) => { markNotificationRead(n) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, notifications])
  const [reservations, setReservations] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [events, setEvents] = useState([])
  const [officialsList, setOfficialsList] = useState([])
  const [kapitanStatus, setKapitanStatus] = useState('available')
  const [documentRequests, setDocumentRequests] = useState([])
  const [wasteSchedule, setWasteSchedule] = useState([])
  const [residentsList, setResidentsList] = useState([])
  const [processingVerificationIds, setProcessingVerificationIds] = useState(new Set())
  const [rejectingResident, setRejectingResident] = useState(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [ineligibleResident, setIneligibleResident] = useState(null)
  const [ineligibleNotes, setIneligibleNotes] = useState('')
  const [viewingId, setViewingId] = useState(null)
  const [decliningRequest, setDecliningRequest] = useState(null)
  // The request whose printable document is open. ⚠️ Holding the ROW
  // rather than an id means the preview renders from the same object
  // the queue already fetched -- no second read, and nothing the
  // official could not already see under the SELECT policy.
  const [documentRequestToPrint, setDocumentRequestToPrint] = useState(null)
  const [declineNotes, setDeclineNotes] = useState('')
  const [registryEntries, setRegistryEntries] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [showRegistryModal, setShowRegistryModal] = useState(false)
  const [editingRegistryEntry, setEditingRegistryEntry] = useState(null)
  const [newRegistryEntry, setNewRegistryEntry] = useState({
    full_name: '', purok: '', household_number: '', contact_number: '',
  })
  const [loading, setLoading] = useState(true)
  // Guards every modal Save/Add/Delete action against double-fires from
  // fast repeated clicks (each action sets this while its request is in
  // flight and buttons are disabled/relabelled while true).
  const [submitting, setSubmitting] = useState(false)
  // Tracks reservation ids currently being approved/declined so a fast
  // double-click on the same row can't fire the update twice.
  const [processingReservationIds, setProcessingReservationIds] = useState(new Set())

  // Filters
  const [reservationFilter, setReservationFilter] = useState('all')
  // Office-hours exceptions only. Separate from the status filter
  // because the two compose: "pending exceptions" is the queue an
  // official actually works through.
  const [reservationExceptionsOnly, setReservationExceptionsOnly] = useState(false)

  // ── Calendar views ──
  //
  // Queue and Table stay the defaults. The calendars are an additional
  // way to look at the same records, never a replacement for the
  // management interface: approving, declining, searching, filtering and
  // reading a resident's details all stay in the queue and the table.
  const [reservationView, setReservationView] = useState('queue')
  const [eventView, setEventView] = useState('table')
  const [calendarDate, setCalendarDate] = useState('')
  const [eventCalendarDate, setEventCalendarDate] = useState('')
  const [reservationMonth, setReservationMonth] = useState(() => monthOf(manilaToday()))
  // Set by the calendar when an official asks to work one date in the
  // queue. A separate filter rather than a search term, because
  // RESERVATION_SEARCH_FIELDS does not include preferred_date -- putting
  // a date in the search box would match nothing.
  const [reservationDateFilter, setReservationDateFilter] = useState('')
  const [eventMonth, setEventMonth] = useState(() => monthOf(manilaToday()))
  // ── Document Requests filtering ────────────────────────────────────
  //
  // Client-side, over the `documentRequests` state the tab already
  // fetched. No second query and no second data source: the list is
  // small, already in memory, and a server round-trip per keystroke
  // would be slower and could disagree with what is on screen.
  const [documentQuery, setDocumentQuery] = useState('')
  const [documentFilter, setDocumentFilter] = useState('all')

  const [reservationQuery, setReservationQuery] = useState('')
  const [announcementFilter, setAnnouncementFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')

  // Residents tab: which of the three groups is open, plus the search
  // box and purok filter that apply within it. 'requests' is the default
  // because it is the group that needs an official to do something.
  const [residentGroup, setResidentGroup] = useState('requests')
  const [residentQuery, setResidentQuery] = useState('')
  const [residentPurok, setResidentPurok] = useState('all')
  // The Voter Reference List tab has its own pair, so switching tabs does not
  // silently carry a filter across into a different dataset.
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryPurok, setRegistryPurok] = useState('all')

  // Logged-in user info from profiles + barangay_officials
  const [userProfile, setUserProfile] = useState(null)
  const [officialInfo, setOfficialInfo] = useState(null)
  // ⚠️ The signed-in official's OWN consultation hours, and nobody
  // else's. Migration 026's policies are what enforce that -- this
  // state is only what the form shows.
  const [myAvailability, setMyAvailability] = useState([])
  const [savingAvailability, setSavingAvailability] = useState('')

  // Modal States
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  // Null when the modal is adding, the row when it is editing. One modal
  // serves both, so the fields cannot drift apart -- the same shape the
  // Edit Event work settled on.
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  // Null when adding, the event's row when editing. One modal serves
  // both, so the fields cannot drift apart.
  const [editingEvent, setEditingEvent] = useState(null)
  const [showOfficialModal, setShowOfficialModal] = useState(false)
  const [editingOfficial, setEditingOfficial] = useState(null)
  // Officials archive (migration 018). `archivingOfficial` and
  // `restoringOfficial` each hold the row a dialog is open for, or null.
  const [archivedOfficials, setArchivedOfficials] = useState([])
  const [archivingOfficial, setArchivingOfficial] = useState(null)
  const [restoringOfficial, setRestoringOfficial] = useState(null)
  const [showWasteModal, setShowWasteModal] = useState(false)

  // ── Modal accessibility ────────────────────────────────────────────
  //
  // Escape, focus entry and focus restoration for all NINE modals on
  // this dashboard. One call, because they are mutually exclusive --
  // see useModalA11y for why that is the shape. Before this, opening an
  // Add form left focus on the button behind the overlay and Escape did
  // nothing.
  useModalA11y(
    showAnnouncementModal || showEventModal || showOfficialModal ||
    showWasteModal || showRegistryModal || !!decliningRequest ||
    !!viewingId || !!ineligibleResident || !!rejectingResident,
    () => {
      setShowAnnouncementModal(false)
      setShowEventModal(false)
      setShowOfficialModal(false)
      setShowWasteModal(false)
      setShowRegistryModal(false)
      setDecliningRequest(null)
      setViewingId(null)
      setIneligibleResident(null)
      setRejectingResident(null)
    }
  )
  const [editingWaste, setEditingWaste] = useState(null)
  const [processingDocRequestIds, setProcessingDocRequestIds] = useState(new Set())

  const [newWasteEntry, setNewWasteEntry] = useState({
    purok: '',
    waste_type: 'Biodegradable',
    day_of_week: '',
    time_label: '',
    notes: '',
    display_order: 0,
  })

  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    description: '',
    badge: '',
  })

  const [newEvent, setNewEvent] = useState({
    title: '',
    location: '',
    event_date: '',
  })

  const [newOfficial, setNewOfficial] = useState({
    full_name: '',
    position: '',
    committee: '',
    contact_number: '',
    display_order: 0,
  })

  // ── Settings: Change Password ──────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  // ──────────────────────────────────────────────────────

  useEffect(() => {
    fetchReservations()
    fetchAnnouncements()
    fetchEvents()
    fetchKapitanStatus()
    fetchOfficialsList()
    fetchArchivedOfficials()
    fetchDocumentRequests()
    fetchWasteSchedule()
    fetchResidentsList()
    fetchRegistryEntries()
    // fetchActivityLog() is deliberately NOT called here. The effect
    // below fetches it whenever the Activity Log tab opens, which is the
    // only place the state is read -- and activeTab starts on
    // 'dashboard', so fetching 200 rows on every mount only ever
    // produced data nothing displayed yet.
    if (user?.id) fetchUserInfo(user.id)
  }, [user])

  // ⚠️ Filtered to the caller's own directory row here AND restricted
  // to it by RLS. The filter is for the query's sake; migration 026's
  // UPDATE/INSERT/DELETE policies are the control, and they resolve
  // "own" through `official_id_for_current_user()`, which fails CLOSED
  // on a name mismatch.
  const fetchMyAvailability = useCallback(async (officialId) => {
    if (!officialId) {
      setMyAvailability([])
      return
    }
    const { data, error } = await supabase
      .from('official_availability')
      .select('*')
      .eq('official_id', officialId)
    if (!error) setMyAvailability(data || [])
  }, [])

  // ⚠️ Keyed on the resolved directory row, not on the profile. The
  // hours belong to `barangay_officials.id`, so there is nothing to
  // fetch until that lookup has succeeded -- and for an official whose
  // name no longer matches a directory row it never does, which is
  // exactly the case the card renders an explanation for instead of a
  // form.
  useEffect(() => {
    fetchMyAvailability(officialInfo?.id)
  }, [officialInfo, fetchMyAvailability])

  const fetchUserInfo = async (userId) => {
    // Get profile (name, role)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single()

    if (profile) {
      setUserProfile(profile)

      // Get position/committee/avatar from barangay_officials.
      //
      // Archived rows are excluded on purpose: an official whose directory
      // record has been archived is no longer serving, so their position
      // permissions must stop resolving here as well as in the database.
      // maybeSingle() rather than single(): an official with no ACTIVE row
      // is now an expected state (theirs may be archived), and single()
      // treats zero rows as an error.
      const { data: official } = await supabase
        .from('barangay_officials')
        .select('id, position, committee, photo_url')
        .eq('full_name', profile.full_name)
        .is('archived_at', null)
        .maybeSingle()

      if (official) setOfficialInfo(official)
    }
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !officialInfo?.id) return
    if (submitting) return

    setSubmitting(true)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${officialInfo.id}-${Date.now()}.${fileExt}`
      const previousPhotoPath = pathFromPublicUrl(officialInfo?.photo_url, 'official-photos')

      const { error: uploadError } = await supabase.storage
        .from('official-photos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        console.error('Avatar upload error:', uploadError)
        toast.error(uploadError.message || 'Failed to upload photo!')
        return
      }

      const { data: urlData } = supabase.storage
        .from('official-photos')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('barangay_officials')
        .update({ photo_url: urlData.publicUrl })
        .eq('id', officialInfo.id)

      if (updateError) {
        console.error('Avatar save error:', updateError)
        toast.error('Photo uploaded but could not be saved to your profile.')
        return
      }

      setOfficialInfo((prev) => ({ ...prev, photo_url: urlData.publicUrl }))

      // Each upload gets a fresh timestamped name, so the photo this
      // one replaces would otherwise stay in the bucket forever with
      // nothing pointing at it. Removed only after the row has moved
      // to the new file, and never fatal if it fails.
      if (previousPhotoPath && previousPhotoPath !== filePath) {
        const { error: removeError } = await supabase.storage
          .from('official-photos')
          .remove([previousPhotoPath])
        if (removeError) {
          console.warn('Could not remove replaced official photo:', removeError.message)
        }
      }

      toast.success('Profile photo updated!')
      fetchOfficialsList()
    } finally {
      setSubmitting(false)
    }
  }

  const fetchReservations = async () => {
    // Newest submission first, which is the existing and intended order:
    // the queue is worked from the top and a booking made this morning
    // should not be below one from last month.
    //
    // `id` is a tie-break, not a change of order. `created_at` alone is
    // not a total order -- two rows sharing a timestamp have no defined
    // relative position, and Postgres may return them either way round
    // between fetches, so a row could swap places after an unrelated
    // refetch. Sorting on the primary key after it makes the list
    // deterministic without moving anything a reader would notice.
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (!error) setReservations(data)
    setLoading(false)
  }

  const fetchAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('date_posted', { ascending: false })

    if (!error) setAnnouncements(data)
  }

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    if (!error) setEvents(data)
  }

  const fetchKapitanStatus = async () => {
    const { data, error } = await supabase
      .from('kapitan_status')
      .select('*')
      .single()

    if (!error && data) setKapitanStatus(data.status)
  }

  // Active officials, for the current directory and the public page.
  //
  // The filter is defence in depth, not the control: migration 018's
  // SELECT policy is what stops anonymous callers retrieving archived
  // rows. Filtering here as well documents the intent and keeps the
  // dashboard correct if a policy is ever changed carelessly.
  // One day at a time, so a change is saved where it was made.
  //
  // ⚠️ `.select()` and a row check, per the project's own rule: RLS
  // FILTERS rows rather than raising, so a blocked write comes back as
  // success with zero rows affected. An official whose profile name no
  // longer matches their directory row hits exactly that, and has to
  // be told rather than shown a false save.
  const handleSaveAvailability = async (day, next) => {
    const officialId = officialInfo?.id
    if (!officialId) {
      toast.error('Your account is not linked to an active directory record, so this cannot be saved.')
      return
    }

    if (next.status === 'available' && (!next.time_start.trim() || !next.time_end.trim())) {
      toast.error('A day marked Available needs a start and an end time.')
      return
    }

    setSavingAvailability(day)
    try {
      const existing = myAvailability.find((row) => row.day_of_week === day)
      const payload = {
        official_id: officialId,
        day_of_week: day,
        // Only an available day carries hours. The database says the
        // same thing from the other side -- 026's
        // `official_availability_hours_present` CHECK -- so this is one
        // rule written on both sides, not a hint the trigger takes on
        // trust.
        time_start: next.status === 'available' ? next.time_start.trim() : null,
        time_end: next.status === 'available' ? next.time_end.trim() : null,
        status: next.status,
        note: next.note.trim() || null,
      }

      const query = existing
        ? supabase.from('official_availability').update(payload).eq('id', existing.id)
        : supabase.from('official_availability').insert(payload)

      const { data, error } = await query.select('id')

      if (error) {
        console.error('Save availability error:', {
          message: error.message, details: error.details, hint: error.hint, code: error.code,
        })
        // 23514 is one of 026's CHECK constraints; its message is the
        // raw constraint name, which means nothing to a reader.
        toast.error(error.code === '23514'
          ? 'That combination is not allowed — an Available day needs hours.'
          : 'Could not save your consultation hours.')
        return
      }
      if (!data || data.length === 0) {
        toast.error('Nothing was saved — your account may not be linked to an active directory record.')
        return
      }

      toast.success(`${day} saved.`)
      fetchMyAvailability(officialId)
    } finally {
      setSavingAvailability('')
    }
  }

  const fetchOfficialsList = async () => {
    const { data, error } = await supabase
      .from('barangay_officials')
      .select('*')
      .is('archived_at', null)
      .order('display_order', { ascending: true })

    if (!error) setOfficialsList(data || [])
  }

  // Archived officials -- barangay history. Ordered most recently archived
  // first: display_order is meaningless once a row is off the public page,
  // and sorting by it would leave the archive in an arbitrary order.
  //
  // Only officials can read these rows at all; the policy grants archived
  // rows to is_official(auth.uid()) and to nobody else.
  const fetchArchivedOfficials = async () => {
    const { data, error } = await supabase
      .from('barangay_officials')
      .select('*')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })

    if (!error) setArchivedOfficials(data || [])
  }

  const fetchDocumentRequests = async () => {
    const { data, error } = await supabase
      .from('document_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setDocumentRequests(data || [])
  }

  const fetchWasteSchedule = async () => {
    const { data, error } = await supabase
      .from('waste_schedule')
      .select('*')
      .order('display_order', { ascending: true })

    if (!error) setWasteSchedule(data || [])
  }

  const fetchResidentsList = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, contact_number, purok, verification_status, verification_notes, id_document_url')
      .eq('role', 'resident')
      .order('full_name', { ascending: true })

    if (!error) setResidentsList(data || [])
  }

  const fetchRegistryEntries = async () => {
    const { data, error } = await supabase
      .from('residents_registry')
      .select('*')
      .order('full_name', { ascending: true })

    if (!error) setRegistryEntries(data || [])
  }

  // useCallback so this keeps a stable identity and the effect below can
  // list it as a dependency without re-running on every render.
  const fetchActivityLog = useCallback(async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!error) setActivityLog(data || [])
  }, [])

  // The Activity Log is written as a side effect of actions taken on
  // OTHER tabs -- an approval, a deletion, a verification. So the copy
  // fetched on mount went stale the moment anything was logged, and a
  // new entry only appeared once the dashboard had been remounted by
  // navigating away and back.
  //
  // Refetching when the tab opens also picks up entries written by
  // another official, which a once-per-mount fetch never would.
  //
  // This effect must stay BELOW the definition above. It names
  // fetchActivityLog in its dependency array, and dependency arrays are
  // evaluated during render -- moving it earlier would read the const
  // before it is initialised and throw on first paint.
  useEffect(() => {
    if (activeTab === 'activity') fetchActivityLog()
  }, [activeTab, fetchActivityLog])

  // Case-insensitive name lookup against the barangay's own record of
  // inhabitants. Names only -- purok is shown for comparison but is
  // deliberately not part of the test, because a resident who has
  // moved between puroks is still a resident.
  //
  // A helper SIGNAL for the official, never an automatic decision. A
  // match proves only that somebody typed a name that exists, and in
  // a barangay everyone knows their neighbours' names -- so treating
  // one as proof of identity would let anyone claim a neighbour's.
  // The ID and the official settle who the person is; this only says
  // whether the name is one the barangay already knows.
  //
  // Returns { entry, exact } so the two cases can be shown
  // differently: an exact hit is worth a green badge, a partial one
  // ("Juan Dela Cruz Jr." against "Juan Dela Cruz", or a bare "Ana"
  // against "Ana Garcia") is worth a second look, not a tick.
  // The exact half of this test now shares normalizeName() with the
  // reconciliation panel, so the two can never disagree about whether a
  // name is on the voter reference list -- a badge reading "On voter
  // list" beside a panel counting the same account as missing would
  // leave an official with no way to tell which was right. Collapsing runs of whitespace
  // is the only behavioural change: "Juan  Dela Cruz" now matches "Juan
  // Dela Cruz", which it should always have done.
  //
  // The partial branch stays exactly as it was, and stays out of the
  // reconciliation panel: a substring test is a prompt to look closer,
  // not a finding.
  const findRegistryMatch = (resident) => {
    const nameKey = normalizeName(resident?.full_name)
    if (!nameKey) return null

    const exact = registryEntries.find(
      (entry) => normalizeName(entry.full_name) === nameKey
    )
    if (exact) return { entry: exact, exact: true }

    const partial = registryEntries.find((entry) => {
      const entryName = normalizeName(entry.full_name)
      if (!entryName) return false
      return entryName.includes(nameKey) || nameKey.includes(entryName)
    })
    return partial ? { entry: partial, exact: false } : null
  }

  const handleOpenAddRegistryEntry = () => {
    setEditingRegistryEntry(null)
    setNewRegistryEntry({ full_name: '', purok: '', household_number: '', contact_number: '' })
    setShowRegistryModal(true)
  }

  const handleEditRegistryEntry = (entry) => {
    setEditingRegistryEntry(entry)
    setNewRegistryEntry({
      full_name: entry.full_name || '',
      purok: entry.purok || '',
      household_number: entry.household_number || '',
      contact_number: entry.contact_number || '',
    })
    setShowRegistryModal(true)
  }

  const handleSaveRegistryEntry = async () => {
    if (submitting) return
    if (!newRegistryEntry.full_name) {
      toast.error('Full name is required.')
      return
    }

    setSubmitting(true)
    try {
      if (editingRegistryEntry) {
        const { error } = await supabase
          .from('residents_registry')
          .update({
            full_name: newRegistryEntry.full_name,
            purok: newRegistryEntry.purok || null,
            household_number: newRegistryEntry.household_number || null,
            contact_number: newRegistryEntry.contact_number || null,
          })
          .eq('id', editingRegistryEntry.id)

        if (error) {
          toast.error('Failed to update entry!')
        } else {
          toast.success('Voter reference entry updated!')
          logActivity({
            action: 'edited',
            entityType: 'registry_entry',
            entityId: editingRegistryEntry.id,
            subject: newRegistryEntry.full_name,
          })
          setShowRegistryModal(false)
          fetchRegistryEntries()
        }
      } else {
        // Readback returns the new id so the audit entry can point at the
        // row. Safe here: this table's SELECT policy covers whoever may
        // insert, so a successful insert is always readable by its author.
        const { data: inserted, error } = await supabase
          .from('residents_registry')
          .insert([{
            full_name: newRegistryEntry.full_name,
            purok: newRegistryEntry.purok || null,
            household_number: newRegistryEntry.household_number || null,
            contact_number: newRegistryEntry.contact_number || null,
            added_by: user?.id ?? null,
          }])
          .select('id')
          .single()

        if (error) {
          toast.error('Failed to add entry!')
        } else if (!inserted?.id) {
          toast.error('Saved, but the new entry could not be read back. Refresh to confirm it is there.')
        } else {
          toast.success('Voter reference entry added!')
          logActivity({
            action: 'added',
            entityType: 'registry_entry',
            entityId: inserted.id,
            subject: newRegistryEntry.full_name,
          })
          setShowRegistryModal(false)
          fetchRegistryEntries()
        }
      }
      setEditingRegistryEntry(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRegistryEntry = async (entry) => {
    const ok = await confirm({
      title: 'Remove this voter reference entry?',
      // ⚠️ "the barangay's own resident record" is what this said, which
      // is the exact framing the Voter Reference List naming exists to
      // remove: these rows are voter data, not a roll of residents.
      message: `${entry.full_name} will be removed from the Voter Reference `
        + 'List. This does not change their account if they have one, but the '
        + 'name will no longer appear as a voter list match during verification.',
      confirmLabel: 'Remove entry',
    })
    if (!ok) return

    // .select() matters here: RLS filters rows rather than raising, so a
    // blocked delete comes back as success with zero rows affected. Without
    // this check the toast reports a removal that never happened.
    const { data, error } = await supabase
      .from('residents_registry')
      .delete()
      .eq('id', entry.id)
      .select('id')

    if (error) {
      toast.error('Failed to delete entry!')
    } else if (!data || data.length === 0) {
      toast.error('Nothing was removed — you may not have permission to change the voter reference list.')
    } else {
      toast.success('Voter reference entry removed!')
      logActivity({
        action: 'deleted',
        entityType: 'registry_entry',
        entityId: entry.id,
        subject: entry.full_name,
      })
      fetchRegistryEntries()
    }
  }

  const handleViewId = async (resident) => {
    if (!resident.id_document_url) {
      toast.error('No ID was uploaded for this account.')
      return
    }
    // Bucket is private — a signed URL is generated on demand rather
    // than storing a permanent public link, since this is sensitive
    // personal data. Expires in 2 minutes.
    const { data, error } = await supabase.storage
      .from('id-verification')
      .createSignedUrl(resident.id_document_url, 120)

    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error)
      toast.error('Could not load ID image.')
      return
    }

    // Shown in a modal rather than window.open(). Two reasons: the
    // popup runs after an await, so the browser no longer counts it
    // as click-initiated and blocks it silently — the button simply
    // did nothing. And a photo of someone's government ID should not
    // be left sitting in a browser tab or in history; closing the
    // modal ends it, and the URL expires two minutes later anyway.
    setViewingId({ resident, url: data.signedUrl })
  }

  const withVerificationGuard = async (residentId, action) => {
    if (processingVerificationIds.has(residentId)) return
    setProcessingVerificationIds((prev) => new Set(prev).add(residentId))
    try {
      await action()
    } finally {
      setProcessingVerificationIds((prev) => {
        const next = new Set(prev)
        next.delete(residentId)
        return next
      })
    }
  }

  // Asked BEFORE the guard is taken, not inside it. The guard exists to
  // stop a double-click firing the same write twice; holding it while a
  // dialog waits for an answer would leave the row's buttons disabled for
  // as long as the official is reading. The early `has` check below stops
  // a second dialog opening for a row that already has one in flight.
  const handleVerifyResident = async (resident) => {
    if (processingVerificationIds.has(resident.id)) return
    const state = describeVerification(resident.verification_status)
    const ok = await confirm({
      title: resident.verification_status === 'ineligible'
        ? `Reinstate ${resident.full_name}?`
        : `Verify ${resident.full_name}?`,
      message: resident.verification_status === 'ineligible'
        ? 'This account was marked as not a resident of this barangay. Verifying it '
          + 'reopens it and lets them request documents again. Check the ID or their '
          + 'record first — only an official can set or lift this state.'
        : `This confirms you have checked their ID. They will be able to request `
          + `barangay documents immediately. Currently: ${state.label}.`,
      confirmLabel: resident.verification_status === 'ineligible'
        ? 'Reinstate account'
        : 'Verify account',
    })
    if (!ok) return
    return withVerificationGuard(resident.id, async () => {
      const { error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'verified',
          verified_by: user?.id ?? null,
          verified_at: new Date().toISOString(),
          verification_notes: null,
        })
        .eq('id', resident.id)

      if (error) {
        toast.error('Failed to verify account!')
      } else {
        toast.success(`${resident.full_name} verified!`)
        logActivity({
          action: 'verified',
          entityType: 'resident_account',
          entityId: resident.id,
          subject: resident.full_name,
        })
        fetchResidentsList()
      }
    })
  }

  const handleOpenReject = (resident) => {
    setRejectingResident(resident)
    setRejectNotes('')
  }

  const handleConfirmReject = async () => {
    if (!rejectingResident || submitting) return
    if (!rejectNotes.trim()) {
      toast.error('Please explain why this account is being rejected.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'rejected',
          verified_by: user?.id ?? null,
          verified_at: new Date().toISOString(),
          verification_notes: rejectNotes.trim(),
        })
        .eq('id', rejectingResident.id)

      if (error) {
        toast.error('Failed to reject account!')
      } else {
        toast.success(`${rejectingResident.full_name}'s account rejected.`)
        logActivity({
          action: 'rejected',
          entityType: 'resident_account',
          entityId: rejectingResident.id,
          subject: rejectingResident.full_name,
          details: rejectNotes.trim(),
        })
        setRejectingResident(null)
        setRejectNotes('')
        fetchResidentsList()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenIneligible = (resident) => {
    setIneligibleResident(resident)
    setIneligibleNotes('')
  }

  // "Not a resident of this barangay" -- a permanent outcome, unlike
  // Reject, which invites the person to correct something and come
  // back. The database refuses to let an ineligible account put
  // itself back in the queue (migration 007).
  //
  // The profile row itself is never deleted: an official refused
  // someone a government service, and that decision has to stay
  // accountable and reviewable. The uploaded ID is a different
  // matter -- once someone is established not to be a resident,
  // there is no longer any purpose for holding a photograph of
  // their government ID, so it is removed.
  const handleConfirmIneligible = async () => {
    if (!ineligibleResident || submitting) return
    if (!ineligibleNotes.trim()) {
      toast.error('Please explain why this account is ineligible.')
      return
    }

    setSubmitting(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({
          verification_status: 'ineligible',
          verified_by: user?.id ?? null,
          verified_at: new Date().toISOString(),
          verification_notes: ineligibleNotes.trim(),
        })
        .eq('id', ineligibleResident.id)
        .select('id')

      if (error) {
        console.error('Mark ineligible error:', error)
        toast.error('Failed to mark this account ineligible!')
        return
      }
      // RLS filters rows instead of raising, so a blocked update
      // would otherwise look like it succeeded.
      if (!data || data.length === 0) {
        toast.error('You do not have permission to change this account.')
        return
      }

      // Drop the ID image, then clear the column -- in that order, so
      // a failed delete leaves the path behind to retry rather than
      // orphaning a file nobody can find any more.
      if (ineligibleResident.id_document_url) {
        const { error: removeError } = await supabase.storage
          .from('id-verification')
          .remove([ineligibleResident.id_document_url])

        if (removeError) {
          console.error('ID removal error:', removeError)
          toast.error('Account marked ineligible, but the ID file could not be deleted.')
        } else {
          await supabase
            .from('profiles')
            .update({ id_document_url: null })
            .eq('id', ineligibleResident.id)
        }
      }

      toast.success(`${ineligibleResident.full_name} marked ineligible.`)
      logActivity({
        action: 'marked ineligible',
        entityType: 'resident_account',
        entityId: ineligibleResident.id,
        subject: ineligibleResident.full_name,
        details: ineligibleNotes.trim(),
      })
      setIneligibleResident(null)
      setIneligibleNotes('')
      fetchResidentsList()
    } finally {
      setSubmitting(false)
    }
  }

  const withDocRequestGuard = async (requestId, action) => {
    if (processingDocRequestIds.has(requestId)) return
    setProcessingDocRequestIds((prev) => new Set(prev).add(requestId))
    try {
      await action()
    } finally {
      setProcessingDocRequestIds((prev) => {
        const next = new Set(prev)
        next.delete(requestId)
        return next
      })
    }
  }

  const handleUpdateDocRequestStatus = (request, status, notes = null) =>
    withDocRequestGuard(request.id, async () => {
      if (!isSecretary) {
        toast.error('Only the Secretary can update document requests.')
        return
      }
      const { data: updated, error } = await supabase
        .from('document_requests')
        .update({
          status,
          reviewed_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
          ...(notes !== null ? { reviewer_notes: notes } : {}),
        })
        .eq('id', request.id)
        .select('id')

      if (error) {
        toast.error('Failed to update request!')
      } else if (!updated || updated.length === 0) {
        toast.error('Nothing was saved — your account may not be linked to the Secretary record. Contact the admin.')
      } else {
        toast.success('Request updated!')
        logActivity({
          action: status,
          entityType: 'document_request',
          entityId: request.id,
          subject: `${request.full_name} — ${request.document_type}`,
          details: notes || null,
        })
        fetchDocumentRequests()
      }
    })

  // Only the `claimed` transition is gated, and it is gated in a wrapper
  // rather than inside handleUpdateDocRequestStatus -- that function is
  // also how a decline is written, and a decline already has its own
  // reason dialog. Confirming inside it would ask twice for one decision.
  //
  // Approve and Mark Ready are deliberately NOT gated. Both are
  // intermediate steps the Secretary can move past in the same session,
  // and a prompt on every step of a four-step queue is the fatigue that
  // makes people stop reading prompts. `claimed` is where the request
  // stops: there is no button that walks it back.
  const handleMarkDocRequestClaimed = async (request) => {
    if (!isSecretary) {
      toast.error('Only the Secretary can update document requests.')
      return
    }
    if (processingDocRequestIds.has(request.id)) return
    const ok = await confirm({
      title: 'Mark this request as claimed?',
      message: `This records that ${request.full_name} has collected their `
        + `${request.document_type}. It is the last step — there is no control here `
        + 'that moves the request back afterwards.',
      confirmLabel: 'Mark claimed',
    })
    if (!ok) return
    return handleUpdateDocRequestStatus(request, 'claimed')
  }

  const handleOpenDeclineRequest = (request) => {
    setDecliningRequest(request)
    setDeclineNotes('')
  }

  const handleConfirmDeclineRequest = async () => {
    if (!decliningRequest) return
    if (!declineNotes.trim()) {
      toast.error('Please explain why this request is being declined.')
      return
    }
    await handleUpdateDocRequestStatus(decliningRequest, 'declined', declineNotes.trim())
    setDecliningRequest(null)
    setDeclineNotes('')
  }

  const handleOpenAddWaste = () => {
    setEditingWaste(null)
    setNewWasteEntry({ purok: '', waste_type: 'Biodegradable', day_of_week: '', time_label: '', notes: '', display_order: 0 })
    setShowWasteModal(true)
  }

  const handleEditWaste = (entry) => {
    setEditingWaste(entry)
    setNewWasteEntry({
      purok: entry.purok || '',
      waste_type: entry.waste_type || 'Biodegradable',
      day_of_week: entry.day_of_week || '',
      time_label: entry.time_label || '',
      notes: entry.notes || '',
      display_order: entry.display_order || 0,
    })
    setShowWasteModal(true)
  }

  const handleSaveWaste = async () => {
    if (submitting) return
    if (!newWasteEntry.purok || !newWasteEntry.waste_type || !newWasteEntry.day_of_week) {
      toast.error('Please fill in Purok, Waste Type, and Day.')
      return
    }

    setSubmitting(true)
    try {
      if (editingWaste) {
        const { error } = await supabase
          .from('waste_schedule')
          .update({
            purok: newWasteEntry.purok,
            waste_type: newWasteEntry.waste_type,
            day_of_week: newWasteEntry.day_of_week,
            time_label: newWasteEntry.time_label || null,
            notes: newWasteEntry.notes || null,
            display_order: Number(newWasteEntry.display_order) || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingWaste.id)

        if (error) {
          toast.error('Failed to update schedule entry!')
        } else {
          toast.success('Schedule entry updated!')
          logActivity({
            action: 'edited',
            entityType: 'waste_schedule',
            entityId: editingWaste.id,
            subject: `${newWasteEntry.purok} — ${newWasteEntry.waste_type} (${newWasteEntry.day_of_week})`,
          })
          setShowWasteModal(false)
          fetchWasteSchedule()
        }
      } else {
        // Readback returns the new id so the audit entry can point at the
        // row. Safe here: this table's SELECT policy covers whoever may
        // insert, so a successful insert is always readable by its author.
        const { data: inserted, error } = await supabase
          .from('waste_schedule')
          .insert([{
            purok: newWasteEntry.purok,
            waste_type: newWasteEntry.waste_type,
            day_of_week: newWasteEntry.day_of_week,
            time_label: newWasteEntry.time_label || null,
            notes: newWasteEntry.notes || null,
            display_order: Number(newWasteEntry.display_order) || 0,
            created_by: user?.id ?? null,
          }])
          .select('id')
          .single()

        if (error) {
          toast.error('Failed to add schedule entry!')
        } else if (!inserted?.id) {
          toast.error('Saved, but the schedule entry could not be read back. Refresh to confirm it is there.')
        } else {
          toast.success('Schedule entry added!')
          logActivity({
            action: 'added',
            entityType: 'waste_schedule',
            entityId: inserted.id,
            subject: `${newWasteEntry.purok} — ${newWasteEntry.waste_type} (${newWasteEntry.day_of_week})`,
          })
          setShowWasteModal(false)
          fetchWasteSchedule()
        }
      }
      setEditingWaste(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWaste = async (entry) => {
    const ok = await confirm({
      title: 'Remove this collection schedule?',
      message: `${entry.purok} — ${entry.waste_type} on ${entry.day_of_week} will be `
        + 'removed. This schedule is shown publicly on the home page, so residents '
        + 'will no longer see a collection day for it.',
      confirmLabel: 'Remove schedule',
    })
    if (!ok) return

    // .select() matters here: RLS filters rows rather than raising, so a
    // blocked delete comes back as success with zero rows affected. Without
    // this check the toast reports a removal that never happened.
    const { data, error } = await supabase
      .from('waste_schedule')
      .delete()
      .eq('id', entry.id)
      .select('id')

    if (error) {
      toast.error('Failed to delete schedule entry!')
    } else if (!data || data.length === 0) {
      toast.error('Nothing was removed — you may not have permission to change the schedule.')
    } else {
      toast.success('Schedule entry removed!')
      logActivity({
        action: 'deleted',
        entityType: 'waste_schedule',
        entityId: entry.id,
        subject: `${entry.purok} — ${entry.waste_type} (${entry.day_of_week})`,
      })
      fetchWasteSchedule()
    }
  }

  // Display orders currently held by ACTIVE officials, and the lowest
  // free positive integer. Used to validate Add/Edit and to block a
  // restore into an occupied position -- never to renumber anybody.
  const activeDisplayOrders = officialsList
    .map((o) => o.display_order)
    .filter((n) => Number.isInteger(n))

  const nextFreeDisplayOrder = (() => {
    const taken = new Set(activeDisplayOrders)
    let candidate = 1
    while (taken.has(candidate)) candidate += 1
    return candidate
  })()

  // Only Punong Barangay can update kapitan status
  const isKapitan = officialInfo?.position === 'Punong Barangay'

  // Who the Punong Barangay is, for the compact status element. Read
  // from the directory the dashboard already fetched -- `officialsList`
  // is already filtered to active officials, so an archived one cannot
  // be named here. Falls back to the barangay's name rather than
  // inventing a person when the directory has no active holder, which is
  // the state the missing-Kagawad incident left behind for a month.
  const punongBarangayName = officialsList
    .find((o) => o.position === 'Punong Barangay')?.full_name || ''
  // Only the Treasurer approves/denies court reservations — they're the
  // one who actually receives the GCash payment and can verify it.
  const isTreasurer = officialInfo?.position === 'Barangay Treasurer'
  // Only the Secretary approves/denies document requests — they manage
  // administrative documents and official records.
  const isSecretary = officialInfo?.position === 'Barangay Secretary'

  // ─── What each ⋮ menu item does ────────────────────────────────────
  //
  // ⚠️ THE HANDLERS ARE THE EXISTING ONES, UNCHANGED. Moving a control
  // from a button into a menu changes where it is clicked and nothing
  // else: the same approve/decline writes, the same `.select()`
  // readback, the same decline-reason dialog, the same Mark Claimed
  // confirmation, the same Activity Log entries and the same SMS
  // notification, still unawaited and still outside the decision.
  //
  // ⚠️ The buttons carried `disabled={processing*Ids.has(id)}` and a
  // menu item has no disabled state -- deliberately, because an item a
  // caller may not choose is absent rather than greyed. The double-write
  // protection was never the attribute: `withDocRequestGuard`,
  // `handleApproveReservation` and `handleDeclineReservation` each
  // return immediately when the row is already in their processing set,
  // and they still do. What is lost is the visual hint on a slow write,
  // and the alternative -- swapping the trigger for a "Working..."
  // label -- would unmount the element the menu has just restored focus
  // to, which is the detached-opener defect `useModalA11y` exists to
  // prevent.
  const docActionHandlers = {
    approve: (req) => handleUpdateDocRequestStatus(req, 'approved'),
    decline: (req) => handleOpenDeclineRequest(req),
    ready: (req) => handleUpdateDocRequestStatus(req, 'ready_for_pickup'),
    claimed: (req) => handleMarkDocRequestClaimed(req),
    // ⚠️ Generating changes NO status. It opens the preview over the row
    // the queue already fetched; Mark Ready and Mark Claimed stay the
    // deliberate actions they were.
    generate: (req) => setDocumentRequestToPrint(req),
  }

  const reservationActionHandlers = {
    approve: (res) => handleApproveReservation(res),
    deny: (res) => handleDeclineReservation(res),
  }

  // The two queues' items: shape from the pure module, icon from the map
  // above, behaviour from the handlers above. Nothing here decides who
  // may do what -- `documentRequestActions` returns an empty list for a
  // non-Secretary and `reservationActions` for a non-Treasurer.
  const docRequestMenuItems = (req) => documentRequestActions({
    status: req.status,
    isSecretary,
    // ⚠️ `canGenerate` remains the only authority on this -- all three
    // gates (Secretary, an eligible status, a configured template) in
    // one call, so the cell cannot drift from the registry.
    canGenerateDocument: canGenerate({
      status: req.status,
      documentType: req.document_type,
      isSecretary,
    }),
    residentName: req.full_name,
  }).map((item) => ({
    ...item,
    icon: DOC_ACTION_ICONS[item.key],
    onSelect: () => docActionHandlers[item.key]?.(req),
  }))

  const reservationMenuItems = (res) => reservationActions({
    status: res.status,
    isTreasurer,
  }).map((item) => ({
    ...item,
    icon: RESERVATION_ACTION_ICONS[item.key],
    onSelect: () => reservationActionHandlers[item.key]?.(res),
  }))

  // Display name: first name only for greeting
  const firstName = userProfile?.full_name
    ? userProfile.full_name.replace(/^Hon\.\s*/i, '').split(' ')[0]
    : 'Official'

  // Position label shown under greeting
  const positionLabel = officialInfo
    ? officialInfo.committee
      ? `${officialInfo.position} — ${officialInfo.committee}`
      : officialInfo.position
    : ''

  // Texts the resident that their reservation was approved or declined.
  // A failed text is never allowed to fail the approval itself — the row
  // is already updated by this point — but the official does need to know
  // it didn't arrive, otherwise they assume the resident was told and
  // nobody follows up.
  //
  // Only the reservation id is sent. The Edge Function reads the name,
  // number, date, time and status from the row itself, so nothing that
  // reaches the resident's phone comes from this client. That is what
  // stops anyone holding the publishable key — which ships in this
  // bundle — from using the function to text arbitrary numbers at the
  // barangay's expense. The approved/declined wording is decided there
  // too, from the row's own status, so this no longer passes one.
  const notifyResident = async (reservation) => {
    const cannotReach = (reason) => {
      console.warn('SMS not sent:', reason)
      toast('Saved, but the text message could not be sent — please contact the resident directly.', {
        icon: '📵',
        duration: 6000,
      })
    }

    try {
      const { data, error } = await supabase.functions.invoke('notify-reservation-sms', {
        body: { reservation_id: reservation.id },
      })

      if (error) {
        console.error('SMS notify error:', error)
        cannotReach(error.message || 'the notification service returned an error')
        return
      }

      if (data && data.sent === false) {
        cannotReach(data.reason || 'unknown reason')
      }
    } catch (err) {
      console.error('SMS notify error:', err)
      cannotReach(err.message || 'the notification service could not be reached')
    }
  }

  // Appends to the append-only audit trail. Deliberately fire-and-
  // forget with its own error handling: a logging failure should never
  // block or roll back the actual action the official just took.
  //
  // actor_id and actor_name are NOT sent. The stamp_activity_actor
  // trigger takes both from the caller's own token and profile and
  // discards anything the client supplies (migration 015), because a
  // client-supplied name is one a client can make up -- a resident was
  // able to file entries reading "Barangay Secretary / verified".
  // Sending them anyway would just be a value that looks authoritative
  // and is silently thrown away.
  const withReservationGuard = async (reservation, action) => {
    if (processingReservationIds.has(reservation.id)) return
    setProcessingReservationIds((prev) => new Set(prev).add(reservation.id))
    try {
      await action()
    } finally {
      setProcessingReservationIds((prev) => {
        const next = new Set(prev)
        next.delete(reservation.id)
        return next
      })
    }
  }

  // ⚠️ Ordering matters here, in this order:
  //
  //   1. permission check -- a non-Treasurer must never be asked to
  //      confirm something they will then be refused;
  //   2. the in-flight check -- so one row cannot open two dialogs;
  //   3. the confirmation;
  //   4. only then withReservationGuard, which takes the per-row lock.
  //
  // Putting the dialog inside the guard would hold that lock for as long
  // as the official took to answer, disabling the row's buttons and the
  // other decision on it meanwhile. The guard still does its real job:
  // the write itself cannot run twice.
  const handleApproveReservation = async (reservation) => {
    if (!isTreasurer) {
      toast.error('Only the Treasurer can approve reservations.')
      return
    }
    if (processingReservationIds.has(reservation.id)) return
    const ok = await confirm({
      title: 'Approve this reservation?',
      message: `The court will be held for ${reservation.full_name} on `
        + `${reservation.preferred_date} at ${reservation.preferred_time}`
        + `${reservation.duration_hours ? ` for ${reservation.duration_hours} hour(s)` : ''}. `
        + 'The resident is told the decision, and the slot stays held until somebody '
        + 'changes it.',
      confirmLabel: 'Approve booking',
    })
    if (!ok) return
    return withReservationGuard(reservation, async () => {
      const { data: updated, error } = await supabase
        .from('reservations')
        .update({ status: 'approved', reviewed_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', reservation.id)
        .select('id')

      if (error) {
        toast.error('Failed to approve reservation!')
      } else if (!updated || updated.length === 0) {
        // RLS matched no row, so nothing was written even though the
        // request itself succeeded. Usually means this account's
        // profiles.full_name doesn't exactly match its
        // barangay_officials.full_name, which is what the Treasurer
        // policy joins on.
        toast.error('Nothing was saved — your account may not be linked to the Treasurer record. Contact the admin.')
      } else {
        toast.success('Reservation approved!')
        logActivity({
          action: 'approved',
          entityType: 'reservation',
          entityId: reservation.id,
          subject: `${reservation.full_name} — ${reservation.preferred_date} ${reservation.preferred_time}`,
        })
        notifyResident(reservation)
        fetchReservations()
      }
    })
  }

  const handleDeclineReservation = async (reservation) => {
    if (!isTreasurer) {
      toast.error('Only the Treasurer can decline reservations.')
      return
    }
    if (processingReservationIds.has(reservation.id)) return
    const ok = await confirm({
      title: 'Decline this reservation?',
      message: `${reservation.full_name}'s booking for ${reservation.preferred_date} at `
        + `${reservation.preferred_time} will be declined and the slot released for `
        + 'someone else. The resident is told the decision.',
      confirmLabel: 'Decline booking',
    })
    if (!ok) return
    return withReservationGuard(reservation, async () => {
      const { data: updated, error } = await supabase
        .from('reservations')
        .update({ status: 'declined', reviewed_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', reservation.id)
        .select('id')

      if (error) {
        toast.error('Failed to decline reservation!')
      } else if (!updated || updated.length === 0) {
        toast.error('Nothing was saved — your account may not be linked to the Treasurer record. Contact the admin.')
      } else {
        toast.success('Reservation declined!')
        logActivity({
          action: 'declined',
          entityType: 'reservation',
          entityId: reservation.id,
          subject: `${reservation.full_name} — ${reservation.preferred_date} ${reservation.preferred_time}`,
        })
        notifyResident(reservation)
        fetchReservations()
      }
    })
  }

  const handleUpdateKapitanStatus = async (status) => {
    if (!isKapitan) return

    // maybeSingle() rather than single(): the kapitan_status table can
    // legitimately be empty on a fresh database, and single() errors
    // there, leaving data null and the old code dereferencing it.
    const { data: current, error: fetchError } = await supabase
      .from('kapitan_status')
      .select('id')
      .maybeSingle()

    if (fetchError || !current) {
      console.error('Kapitan status row missing:', fetchError)
      toast.error(`No ${PUNONG_BARANGAY_LABEL} status record exists yet. Ask the admin to create one.`)
      return
    }

    const { data: updated, error } = await supabase
      .from('kapitan_status')
      .update({ status })
      .eq('id', current.id)
      .select('id')

    if (error) {
      toast.error('Failed to update status!')
    } else if (!updated || updated.length === 0) {
      toast.error('Nothing was saved — you may not have permission to change this.')
    } else {
      setKapitanStatus(status)
      toast.success('Status updated!')
    }
  }

  const KAPITAN_STATUS_OPTIONS = [
    { value: 'available', label: 'Available', emoji: '✅' },
    { value: 'in-meeting', label: 'In a Meeting', emoji: '📋' },
    { value: 'out-of-office', label: 'Out of Office', emoji: '🚗' },
    { value: 'on-leave', label: 'On Leave', emoji: '🏖️' },
  ]

  const kapitanStatusDisplay = (statusValue) => {
    const found = KAPITAN_STATUS_OPTIONS.find((o) => o.value === statusValue)
    return found ? `${found.emoji} ${found.label}` : 'Unknown'
  }

  const handleAddOfficial = async () => {
    if (submitting) return
    if (!newOfficial.full_name || !newOfficial.position) {
      toast.error('Full name and position are required!')
      return
    }

    // display_order used to be coerced with `Number(x) || 0`, which turned
    // a blank field AND any non-numeric value silently into 0. Two
    // officials added without an order therefore both landed at 0, and the
    // public page ordered them arbitrarily. It is now validated instead of
    // guessed.
    const requestedOrder = Number(newOfficial.display_order)
    if (!Number.isInteger(requestedOrder) || requestedOrder < 1) {
      toast.error('Display order must be a whole number greater than 0.')
      return
    }

    // A collision WARNS and asks for confirmation; it does not block, and
    // it never moves the other official. Ordering between two officials
    // sharing a number is arbitrary, which is worth knowing about before
    // saving rather than discovering on the public page.
    const collidesWith = officialsList.find(
      (o) => o.display_order === requestedOrder
        && o.id !== (editingOfficial ? editingOfficial.id : null),
    )
    if (collidesWith) {
      const proceed = await confirm({
        title: `Position ${requestedOrder} is already used`,
        message: `${collidesWith.full_name} is already at position ${requestedOrder}. `
          + 'Saving will leave two officials sharing it, and the order between '
          + 'them will be arbitrary. No other official will be moved.',
        confirmLabel: 'Save anyway',
        destructive: false,
      })
      if (!proceed) return
    }

    // ⚠️ UNREACHABLE WHILE MIGRATION 029 HOLDS, AND DELIBERATELY KEPT.
    // The Edit form no longer offers Full Name, so `newOfficial.full_name`
    // always equals `editingOfficial.full_name` here and this never
    // fires. It is exactly what A3 needs back the moment name editing
    // is restored, and deleting it now would mean writing it again.
    //
    // ⚠️ A RENAME UNLINKS THE PORTRAIT, and this is the only moment
    // anybody can do something about it. `officialPhotos` is keyed on
    // the exact `barangay_officials.full_name`, so changing the name
    // leaves the bundled photo matching nothing and the row silently
    // falls back to an icon.
    //
    // This already happened once, on 2026-10-01 at 04:58: `edited` on
    // display_order 10 turned "Jeffrey Feria Duran" into "Jeffrey
    // Cataylo Lastimoso" and the portrait was gone, four minutes
    // before the first of two archive/restore cycles that got the
    // blame. Nothing anywhere said a word. It also cost that official
    // his position permissions, because an account is linked to its
    // directory row by the same exact string. The data was corrected in
    // migration 027; this dialog is what makes the next one loud.
    //
    // It WARNS, it does not block. Correcting a misspelled name is a
    // legitimate edit and must not be refused over a picture.
    if (
      editingOfficial
      && portraitWillBeLost(
        editingOfficial.full_name,
        newOfficial.full_name,
        editingOfficial.photo_url,
      )
    ) {
      const proceedWithRename = await confirm({
        title: 'This rename will remove their photo',
        message: `The portrait on file is matched to the name `
          + `"${editingOfficial.full_name}" exactly. Saving "${newOfficial.full_name}" `
          + 'will leave this official with no photo on the directory and on the '
          + 'public Officials page, and nothing else will report it. '
          + 'Correcting a name is still the right thing to do — but the photo '
          + 'has to be re-matched to the new name in the code before it comes back.',
        confirmLabel: 'Rename anyway',
        cancelLabel: 'Keep the name',
        destructive: false,
      })
      if (!proceedWithRename) return
    }

    setSubmitting(true)
    try {
      if (editingOfficial) {
        // ⚠️ `.select()` and a row count, per the project's own rule:
        // RLS FILTERS rows rather than raising, so a blocked UPDATE
        // comes back as success with zero rows affected. Without this
        // the toast reported "Official updated!" for an edit that
        // never happened -- the same defect the archive and restore
        // handlers below already guard against.
        const { data: updated, error } = await supabase
          .from('barangay_officials')
          // ⚠️ Neither `position` (028) nor `full_name` (029) is sent.
          // The form offers neither and the database refuses both, so
          // including them would be fields this payload claims to set
          // and does not. Both triggers use `IS DISTINCT FROM`, so
          // re-sending an unchanged value would still save -- that
          // tolerance exists so an ordinary edit is never broken by it,
          // not as a licence to send it.
          //
          // ⚠️ `full_name` goes back in at A3, with the input.
          .update({
            committee: newOfficial.committee || null,
            contact_number: newOfficial.contact_number || null,
            display_order: requestedOrder,
            updated_by: user?.id ?? null,
          })
          .eq('id', editingOfficial.id)
          .select('id')

        if (error) {
          toast.error('Failed to update official!')
        } else if (!updated || updated.length === 0) {
          toast.error('Nothing was updated — you may not have permission to change the directory.')
        } else {
          toast.success('Official updated!')
          logActivity({
            action: 'edited',
            entityType: 'official',
            entityId: editingOfficial.id,
            subject: `${newOfficial.full_name} — ${newOfficial.position}`,
          })
          setShowOfficialModal(false)
          fetchOfficialsList()
        }
      } else {
        // Readback returns the new id so the audit entry can point at the
        // row. Safe here: this table's SELECT policy covers whoever may
        // insert, so a successful insert is always readable by its author.
        const { data: inserted, error } = await supabase
          .from('barangay_officials')
          .insert([{
            full_name: newOfficial.full_name,
            position: newOfficial.position,
            committee: newOfficial.committee || null,
            contact_number: newOfficial.contact_number || null,
            display_order: requestedOrder,
            created_by: user?.id ?? null,
          }])
          .select('id')
          .single()

        if (error) {
          toast.error('Failed to add official!')
        } else if (!inserted?.id) {
          toast.error('Saved, but the new record could not be read back. Refresh to confirm it is there.')
        } else {
          toast.success('Official added!')
          logActivity({
            action: 'added',
            entityType: 'official',
            entityId: inserted.id,
            subject: `${newOfficial.full_name} — ${newOfficial.position}`,
          })
          setShowOfficialModal(false)
          fetchOfficialsList()
        }
      }

      setEditingOfficial(null)
      setNewOfficial({ full_name: '', position: '', committee: '', contact_number: '', display_order: 0 })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditOfficial = (official) => {
    setEditingOfficial(official)
    setNewOfficial({
      full_name: official.full_name || '',
      position: official.position || '',
      committee: official.committee || '',
      contact_number: official.contact_number || '',
      display_order: official.display_order ?? '',
    })
    setShowOfficialModal(true)
  }

  const handleOpenAddOfficial = () => {
    setEditingOfficial(null)
    // Pre-filled with the lowest free position rather than 0, which the
    // form used to default to and which is no longer a valid order.
    setNewOfficial({
      full_name: '',
      position: '',
      committee: '',
      contact_number: '',
      display_order: String(nextFreeDisplayOrder),
    })
    setShowOfficialModal(true)
  }

  // ── Officials archive (migration 018) ─────────────────────────────
  //
  // This replaces a permanent DELETE. An official who leaves office is now
  // kept as barangay history: there are no term columns and no history
  // table, so the row IS the record of who held the position. Deleting it
  // also orphaned their photo in a public bucket and left
  // activity_log.entity_id pointing at nothing.
  //
  // There is deliberately NO permanent-delete control anywhere in this UI.
  // The DELETE policy still exists but only matches rows that are already
  // archived, so an active official cannot be deleted in one step.

  // True when this row is the signed-in official's own directory record.
  // The link is full_name string equality, which is the only link that
  // exists (there is no foreign key -- see CLAUDE.md "Known fragility").
  const isOwnOfficialRecord = (official) =>
    Boolean(userProfile?.full_name) && official?.full_name === userProfile.full_name

  const handleArchiveOfficial = async (reason) => {
    const official = archivingOfficial
    if (!official || submitting) return

    // Blocked in the UI, and again by the trg_stamp_official_archive
    // trigger. Both are needed: this branch gives the clear message, the
    // trigger covers a direct API call. Neither is an authorization
    // boundary -- archiving yourself only reduces your own privileges.
    if (isOwnOfficialRecord(official)) {
      toast.error('You cannot archive your own record — another authorized official must archive it.')
      return
    }

    setSubmitting(true)
    try {
      // archived_at is sent so the row transitions, but its value and
      // archived_by are both re-stamped server-side by the trigger from
      // the caller's own token. Whatever is sent here is discarded.
      //
      // .select() matters: RLS filters rows rather than raising, so a
      // blocked update comes back as success with zero rows affected.
      // Without this check the toast reports an archive that never
      // happened.
      const { data, error } = await supabase
        .from('barangay_officials')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', official.id)
        .select('id')

      if (error) {
        // The trigger raises for a self-archive; surface its meaning
        // rather than a generic failure.
        if (/archive their own/i.test(error.message)) {
          toast.error('You cannot archive your own record — another authorized official must archive it.')
        } else {
          toast.error('Failed to archive official!')
        }
        return
      }
      if (!data || data.length === 0) {
        toast.error('Nothing was archived — you may not have permission to change the directory.')
        return
      }

      toast.success('Official archived. Their record is kept as barangay history.')
      logActivity({
        action: 'archived',
        entityType: 'official',
        entityId: official.id,
        subject: `${official.full_name} — ${official.position}`,
        details: reason || null,
      })
      setArchivingOfficial(null)
      fetchOfficialsList()
      fetchArchivedOfficials()
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestoreOfficial = async (chosenOrder) => {
    const official = restoringOfficial
    if (!official || submitting) return

    // Re-checked here, not only in the dialog: the active list could have
    // changed in another tab while the dialog sat open. An occupied order
    // stops the restore rather than moving anybody.
    if (!Number.isInteger(chosenOrder) || chosenOrder < 1) {
      toast.error('Choose a display order greater than 0.')
      return
    }
    if (activeDisplayOrders.includes(chosenOrder)) {
      toast.error(`Position ${chosenOrder} is already taken by an active official.`)
      return
    }

    setSubmitting(true)
    try {
      // One UPDATE. The chosen display order is a PARAMETER OF THE
      // RESTORE, applied in the same statement that clears archived_at --
      // an archived record is never edited on its own. archived_by is
      // forced to NULL by the trigger.
      const { data, error } = await supabase
        .from('barangay_officials')
        .update({ archived_at: null, display_order: chosenOrder })
        .eq('id', official.id)
        .select('id')

      if (error) {
        // 23505 is the partial unique index on active full_name: an active
        // official already holds this name. Never resolved by renaming.
        if (error.code === '23505') {
          toast.error('An active official with this name already exists.')
        } else {
          toast.error('Failed to restore official!')
        }
        return
      }
      if (!data || data.length === 0) {
        toast.error('Nothing was restored — you may not have permission to change the directory.')
        return
      }

      toast.success('Official restored to the directory.')
      logActivity({
        action: 'restored',
        entityType: 'official',
        entityId: official.id,
        subject: `${official.full_name} — ${official.position}`,
        details: chosenOrder === official.display_order
          ? null
          : `Restored at display order ${chosenOrder}`,
      })
      setRestoringOfficial(null)
      fetchOfficialsList()
      fetchArchivedOfficials()
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenAddAnnouncement = () => {
    setEditingAnnouncement(null)
    setNewAnnouncement({ title: '', description: '', badge: '' })
    setShowAnnouncementModal(true)
  }

  const handleOpenEditAnnouncement = (ann) => {
    setEditingAnnouncement(ann)
    // Every field is loaded, so saving cannot blank one the official did
    // not touch. `badge` and `description` are nullable in the table, so
    // they fall back to '' rather than rendering "null" in the input.
    setNewAnnouncement({
      title: ann.title || '',
      description: ann.description || '',
      badge: ann.badge || '',
    })
    setShowAnnouncementModal(true)
  }

  // ⚠️ UPDATES THE EXISTING ROW. Not delete-and-recreate: that would
  // change the announcement's id (which the public detail page links
  // to), lose `date_posted`, and file two audit entries for one
  // correction. Same reasoning as Edit Event.
  //
  // Permission verified before this was written, by impersonating each
  // role over the API in a rolled-back transaction: official 1 row,
  // resident 0, nurse 0, anon 0. The existing
  // "Admin and official can update announcements" policy already covers
  // it, so NO MIGRATION was needed.
  const handleUpdateAnnouncement = async () => {
    if (submitting || !editingAnnouncement) return
    if (!newAnnouncement.title || !newAnnouncement.description) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      // .select() matters: RLS filters rows rather than raising, so a
      // blocked update returns success with zero rows affected. Without
      // this the toast would report a save that never happened.
      const { data, error } = await supabase
        .from('announcements')
        .update({
          title: newAnnouncement.title,
          description: newAnnouncement.description,
          badge: newAnnouncement.badge,
        })
        .eq('id', editingAnnouncement.id)
        .select('id')

      if (error) {
        toast.error('Failed to update announcement!')
      } else if (!data || data.length === 0) {
        toast.error('No announcement was updated. You may not have permission to edit it.')
      } else {
        toast.success('Announcement updated.')
        logActivity({
          action: 'edited',
          entityType: 'announcement',
          entityId: editingAnnouncement.id,
          subject: newAnnouncement.title,
        })
        setShowAnnouncementModal(false)
        setEditingAnnouncement(null)
        setNewAnnouncement({ title: '', description: '', badge: '' })
        fetchAnnouncements()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddAnnouncement = async () => {
    if (submitting) return
    if (!newAnnouncement.title || !newAnnouncement.description) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      // Readback returns the new id so the audit entry can point at the
      // row. Safe here: this table's SELECT policy covers whoever may
      // insert, so a successful insert is always readable by its author.
      const { data: inserted, error } = await supabase
        .from('announcements')
        .insert([{
          title: newAnnouncement.title,
          description: newAnnouncement.description,
          badge: newAnnouncement.badge,
        }])
        .select('id')
        .single()

      if (error) {
        toast.error('Failed to add announcement!')
      } else if (!inserted?.id) {
        toast.error('Saved, but the announcement could not be read back. Refresh to confirm it is there.')
      } else {
        toast.success('Announcement added!')
        logActivity({
          action: 'added',
          entityType: 'announcement',
          entityId: inserted.id,
          subject: newAnnouncement.title,
        })
        setShowAnnouncementModal(false)
        setNewAnnouncement({ title: '', description: '', badge: '' })
        fetchAnnouncements()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAnnouncement = async (ann) => {
    const ok = await confirm({
      title: 'Delete this announcement?',
      message: `"${ann.title}" will be removed from the public website immediately `
        + 'and cannot be recovered.',
      confirmLabel: 'Delete announcement',
    })
    if (!ok) return

    // .select() matters here: RLS filters rows rather than raising, so a
    // blocked delete comes back as success with zero rows affected. Without
    // this check the toast reports a removal that never happened.
    const { data, error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', ann.id)
      .select('id')

    if (error) {
      toast.error('Failed to delete announcement!')
    } else if (!data || data.length === 0) {
      toast.error('Nothing was deleted — you may not have permission to remove announcements.')
    } else {
      toast.success('Announcement deleted!')
      logActivity({
        action: 'deleted',
        entityType: 'announcement',
        entityId: ann.id,
        subject: ann.title,
      })
      fetchAnnouncements()
    }
  }

  // ⚠️ `event_month` and `event_day` are denormalised display copies,
  // and they are NOT the date. `event_date` is.
  //
  // They were written as `new Date(dateString)` then `.getDate()` /
  // `.toLocaleString()`, which parses a UTC midnight and reads it back
  // in the BROWSER's zone -- so west of UTC they describe the previous
  // day. Every stored row happens to be correct because every row was
  // written from the Philippines, but nothing enforced that.
  //
  // Derived from the characters of the date instead, so the two columns
  // can no longer disagree with `event_date` whatever zone the official
  // is in. They are kept because the public event cards still render
  // them; the calendars read `event_date` and ignore them entirely.
  const displayPartsFor = (dateString) => {
    const parsed = parseDateKey(dateString)
    if (!parsed) return { event_month: null, event_day: null }
    return {
      event_month: MONTH_SHORT[parsed.month].toUpperCase(),
      event_day: String(parsed.day).padStart(2, '0'),
    }
  }

  const handleOpenAddEvent = () => {
    setEditingEvent(null)
    setNewEvent({ title: '', location: '', event_date: '' })
    setShowEventModal(true)
  }

  const handleOpenEditEvent = (event) => {
    setEditingEvent(event)
    setNewEvent({
      title: event.title || '',
      location: event.location || '',
      // Normalised through the date-only helper, so the date input is
      // populated from the stored value rather than from a Date.
      event_date: toDateKey(event.event_date),
    })
    setShowEventModal(true)
  }

  // Updates the existing row. Deliberately NOT a delete-and-recreate:
  // that would break the public /events/:id link, lose created_at, and
  // file two audit entries for one correction.
  const handleUpdateEvent = async () => {
    if (submitting || !editingEvent) return
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      // .select() matters: RLS filters rows rather than raising, so a
      // blocked update returns success with zero rows affected. Without
      // this the toast would report a save that never happened.
      const { data, error } = await supabase
        .from('events')
        .update({
          title: newEvent.title,
          location: newEvent.location,
          event_date: newEvent.event_date,
          ...displayPartsFor(newEvent.event_date),
        })
        .eq('id', editingEvent.id)
        .select('id')

      if (error) {
        toast.error('Failed to update event!')
      } else if (!data || data.length === 0) {
        toast.error('Nothing was updated — you may not have permission to change events.')
      } else {
        toast.success('Event updated.')
        logActivity({
          action: 'edited',
          entityType: 'event',
          entityId: editingEvent.id,
          subject: newEvent.title,
        })
        setShowEventModal(false)
        setEditingEvent(null)
        setNewEvent({ title: '', location: '', event_date: '' })
        fetchEvents()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleAddEvent = async () => {
    if (submitting) return
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      // Readback returns the new id so the audit entry can point at the
      // row. Safe here: this table's SELECT policy covers whoever may
      // insert, so a successful insert is always readable by its author.
      const { data: inserted, error } = await supabase
        .from('events')
        .insert([{
          title: newEvent.title,
          location: newEvent.location,
          event_date: newEvent.event_date,
          ...displayPartsFor(newEvent.event_date),
        }])
        .select('id')
        .single()

      if (error) {
        toast.error('Failed to add event!')
      } else if (!inserted?.id) {
        toast.error('Saved, but the event could not be read back. Refresh to confirm it is there.')
      } else {
        toast.success('Event added!')
        logActivity({
          action: 'added',
          entityType: 'event',
          entityId: inserted.id,
          subject: newEvent.title,
        })
        setShowEventModal(false)
        setNewEvent({ title: '', location: '', event_date: '' })
        fetchEvents()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteEvent = async (event) => {
    const ok = await confirm({
      title: 'Delete this event?',
      message: `"${event.title}" will be removed from the public events page `
        + 'immediately and cannot be recovered.',
      confirmLabel: 'Delete event',
    })
    if (!ok) return

    // .select() matters here: RLS filters rows rather than raising, so a
    // blocked delete comes back as success with zero rows affected. Without
    // this check the toast reports a removal that never happened.
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', event.id)
      .select('id')

    if (error) {
      toast.error('Failed to delete event!')
    } else if (!data || data.length === 0) {
      toast.error('Nothing was deleted — you may not have permission to remove events.')
    } else {
      toast.success('Event deleted!')
      logActivity({
        action: 'deleted',
        entityType: 'event',
        entityId: event.id,
        subject: event.title,
      })
      fetchEvents()
    }
  }

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in both fields!')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match!')
      return
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters!')
      return
    }

    setPasswordLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordLoading(false)

    if (error) {
      toast.error('Failed to update password!')
    } else {
      toast.success('Password updated successfully!')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const pendingReservations = reservations.filter(r => r.status === 'pending')

  // ── Residents: groups, filters and reconciliation ────────────────
  //
  // Every number the Residents tab shows comes from this block, and the
  // lists it shows come from the same values. A group's tab count is
  // literally the length of the array rendered when that tab is open,
  // filters included -- so the count above a list cannot disagree with
  // the list, which is what a separately-computed total would eventually
  // do.
  const residentGroups = useMemo(() => groupResidents(residentsList), [residentsList])

  const residentFilter = useMemo(
    () => ({ query: residentQuery, purok: residentPurok, fields: RESIDENT_SEARCH_FIELDS }),
    [residentQuery, residentPurok]
  )

  const residentGroupCounts = useMemo(() => {
    const counts = {}
    RESIDENT_GROUPS.forEach((group) => {
      counts[group.id] = filterRows(residentGroups[group.id], residentFilter).length
    })
    return counts
  }, [residentGroups, residentFilter])

  const visibleResidents = useMemo(
    () => filterRows(residentGroups[residentGroup], residentFilter),
    [residentGroups, residentGroup, residentFilter]
  )

  const activeResidentGroup = RESIDENT_GROUPS.find((group) => group.id === residentGroup)
    || RESIDENT_GROUPS[0]
  const residentFiltersActive = residentQuery.trim() !== '' || residentPurok !== 'all'
  const resetResidentFilters = () => {
    setResidentQuery('')
    setResidentPurok('all')
  }

  // Status and search compose: the status narrows the set, the query
  // narrows what is left. Choosing Pending and typing a name shows that
  // resident's pending bookings and nothing else.
  //
  // Status first, then the shared `filterRows` -- the same function the
  // Residents, Voter Reference List and Reservations tabs use, so
  // case-insensitivity and whitespace handling are identical across
  // every search box in the portal.
  const visibleDocumentRequests = useMemo(
    () => filterDocumentRequests(documentRequests, {
      query: documentQuery,
      status: documentFilter,
    }),
    [documentRequests, documentFilter, documentQuery]
  )

  const documentFiltersActive =
    documentFilter !== 'all' || documentQuery.trim() !== ''

  const resetDocumentFilters = () => {
    setDocumentQuery('')
    setDocumentFilter('all')
  }

  // Same `filterRows` the other two tabs use, so case-insensitivity and
  // whitespace trimming behave identically everywhere and are covered by
  // the same tests.
  const visibleReservations = useMemo(() => {
    const byStatus = reservationFilter === 'all'
      ? reservations
      : reservations.filter((r) => r.status === reservationFilter)
    // ⚠️ isExceptionRequest reads `exception_reason`, never the hour.
    // Every booking filed before migration 020 starts before 5 PM and
    // carries no reason, so filtering by hour here would hand the
    // official the whole of the old queue labelled as exceptions.
    const byException = reservationExceptionsOnly
      ? byStatus.filter(isExceptionRequest)
      : byStatus
    // Compares the stored date as a string, which is correct for
    // zero-padded ISO dates and needs no Date at all.
    const byDate = reservationDateFilter
      ? byException.filter((r) => toDateKey(r.preferred_date) === reservationDateFilter)
      : byException
    return filterRows(byDate, {
      query: reservationQuery,
      fields: RESERVATION_SEARCH_FIELDS,
    })
  }, [
    reservations, reservationFilter, reservationExceptionsOnly,
    reservationDateFilter, reservationQuery,
  ])

  const exceptionReservationCount = useMemo(
    () => reservations.filter(isExceptionRequest).length,
    [reservations]
  )

  // ⚠️ Built from the `reservations` state this dashboard already
  // fetched -- the same rows the queue renders. NOT from
  // get_reservation_slots_range: that RPC is the anonymous view, with
  // five columns and deliberately no names and no exception_reason, so
  // an official calling it would be reading a poorer copy of their own
  // data through a second source.
  const reservationCalendar = useMemo(
    () => buildReservationCalendar(reservations),
    [reservations]
  )
  const calendarDayReservations = useMemo(
    () => reservationsOnDate(reservationCalendar, calendarDate),
    [reservationCalendar, calendarDate]
  )

  const officialEventCalendar = useMemo(() => buildEventCalendar(events), [events])
  const eventCalendarDayEvents = useMemo(
    () => eventsOnDate(officialEventCalendar, eventCalendarDate),
    [officialEventCalendar, eventCalendarDate]
  )

  // Today in Manila, for the grid's today marker and its past shading.
  const calendarToday = useMemo(() => manilaToday(), [])

  const reservationFiltersActive =
    reservationQuery.trim() !== ''
    || reservationFilter !== 'all'
    || reservationExceptionsOnly
    || reservationDateFilter !== ''
  const resetReservationFilters = () => {
    setReservationQuery('')
    setReservationFilter('all')
    setReservationExceptionsOnly(false)
    setReservationDateFilter('')
  }

  const visibleRegistryEntries = useMemo(
    () => filterRows(registryEntries, {
      query: registryQuery, purok: registryPurok, fields: REGISTRY_SEARCH_FIELDS,
    }),
    [registryEntries, registryQuery, registryPurok]
  )
  const registryFiltersActive = registryQuery.trim() !== '' || registryPurok !== 'all'
  const resetRegistryFilters = () => {
    setRegistryQuery('')
    setRegistryPurok('all')
  }

  // ── Sidebar badge counts ─────────────────────────────────────────
  //
  // Both come from data this dashboard already fetched, so a badge costs
  // no extra request, no new column and no read-state to keep. They also
  // update on their own: each successful action refetches its list, the
  // filter below recomputes, and the badge drops.
  //
  // Only work that is waiting on an OFFICIAL is counted. `rejected` is an
  // account the official has already dealt with and sent back, so it sits
  // in the Requests group but not in the badge -- the line under that
  // group's heading says so, because a tab reading 5 above a badge
  // reading 3 is otherwise just confusing.
  const pendingDocRequestCount = documentRequests
    .filter((request) => request.status === 'pending').length
  const awaitingVerificationCount = residentsList
    .filter((resident) => resident.verification_status === 'pending').length
  const returnedToResidentCount = residentsList
    .filter((resident) => resident.verification_status === 'rejected').length
  // Anything with an unrecognised status also lands in Requests. Counted
  // here so the two figures above plus this one always add up to the
  // group's own total rather than quietly falling short.
  const unclassifiedRequestCount =
    residentGroups.requests.length - awaitingVerificationCount - returnedToResidentCount

  // D6. Detection only -- see findReconciliationIssues for why this
  // cannot conclude anything about identity, and why it never writes.
  const reconciliationIssues = useMemo(
    () => findReconciliationIssues({ residents: residentsList, registryEntries }),
    [residentsList, registryEntries]
  )
  // Counted by severity, from the same arrays the panel renders. Rolling
  // them into one number made the expected case -- verified residents who
  // are simply not registered voters -- read as part of a backlog.
  const reconciliationAttention = reconciliationIssues
    .filter((issue) => isActionableSeverity(issue.severity))
    .reduce((total, issue) => total + issue.items.length, 0)
  const reconciliationInformational = reconciliationIssues
    .filter((issue) => !isActionableSeverity(issue.severity))
    .reduce((total, issue) => total + issue.items.length, 0)

  // ── Reports: derived entirely from data already fetched, so no
  // extra queries are needed for the charts. ──────────────────────

  const monthlyCounts = useMemo(() => {
    // Last 6 months, oldest first.
    const buckets = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      buckets.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        documents: 0,
        reservations: 0,
      })
    }
    const indexOf = (dateStr) => {
      if (!dateStr) return -1
      const d = new Date(dateStr)
      return buckets.findIndex((b) => b.key === `${d.getFullYear()}-${d.getMonth()}`)
    }
    documentRequests.forEach((r) => {
      const i = indexOf(r.created_at)
      if (i !== -1) buckets[i].documents += 1
    })
    reservations.forEach((r) => {
      const i = indexOf(r.created_at)
      if (i !== -1) buckets[i].reservations += 1
    })
    return buckets
  }, [documentRequests, reservations])

  const documentTypeCounts = useMemo(() => {
    const map = {}
    documentRequests.forEach((r) => {
      map[r.document_type] = (map[r.document_type] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [documentRequests])

  const busiestDays = useMemo(() => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const counts = new Array(7).fill(0)
    reservations.forEach((r) => {
      if (!r.preferred_date) return
      // preferred_date is a plain date string; split it so the day
      // isn't shifted by the browser's timezone offset.
      const [y, m, d] = r.preferred_date.split('-').map(Number)
      if (!y || !m || !d) return
      counts[new Date(y, m - 1, d).getDay()] += 1
    })
    return dayNames.map((name, i) => ({ name, count: counts[i] }))
  }, [reservations])

  const maxMonthly = Math.max(1, ...monthlyCounts.map((b) => Math.max(b.documents, b.reservations)))
  const maxDay = Math.max(1, ...busiestDays.map((d) => d.count))

  // One definition, rendered twice -- once in the desktop topbar and
  // once in the mobile header -- so the two placements cannot be given
  // different props.
  const notificationBell = (
    <NotificationBell
      notifications={notifications}
      readIds={notifReadIds}
      loading={notifLoading}
      onOpenTab={(tab) => setActiveTab(tab)}
      onMarkRead={markNotificationRead}
      onMarkAllRead={markAllNotificationsRead}
    />
  )

  return (
    <div className="dashboard-layout">

      {/* Sidebar */}
      <Sidebar
        role="official"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        badges={{
          documents: pendingDocRequestCount,
          residents: awaitingVerificationCount,
        }}
        mobileHeaderAction={notificationBell}
      />

      {/* Main Content */}
      <main className="dashboard-main" id="main-content" tabIndex={-1}>

        {/* The DESKTOP bell. It sits here rather than inside each tab's
            own header, because there are thirteen of those and no shared
            dashboard header component exists. One place, every tab.

            ⚠️ Hidden at and below 768px, where Sidebar renders the same
            bell inside .dash-mobile-header. See NotificationBell.css. */}
        <div className="dashboard-topbar">
          {notificationBell}
        </div>

        {/* ========================
            DASHBOARD TAB
        ======================== */}
        {activeTab === 'dashboard' && (
          <div>
            {/* ── The overview's top block ────────────────────────────
                Heading, the four stat cards and the Punong Barangay
                status, in ONE container so their arrangement is a
                responsive layout rather than two copies of an element.

                ⚠️ DOM ORDER IS THE MOBILE ORDER, and it is deliberately
                left alone: heading, stats, status -- exactly the
                presentation already accepted at 375px, in plain document
                flow with no `order` anywhere to go wrong. The wide
                layout places the status in row 1 column 2 with grid,
                beside the greeting, and lets the stats span both columns
                underneath. See .dashboard-overview-top. */}
            <div className="dashboard-overview-top">
            <div className="official-dashboard-header">
              <h1>Official Dashboard</h1>
              <p>
                Good day, <strong>{firstName}</strong>
                {positionLabel ? ` · ${positionLabel}` : ''}.
                Here is the current pulse of Barangay Batinguel.
              </p>
            </div>

            {/* Stats Cards */}
            <div className="dashboard-stats">
              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon blue">
                    <FaClipboardList />
                  </div>
                </div>
                <div className="stat-card-value">
                  {pendingReservations.length}
                </div>
                <div className="stat-card-label">Pending Reservations</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon green">
                    <FaBullhorn />
                  </div>
                </div>
                <div className="stat-card-value">{announcements.length}</div>
                <div className="stat-card-label">Announcements</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon yellow">
                    <FaCalendarAlt />
                  </div>
                </div>
                {/* This said "Upcoming Events" while counting every event
                    ever created, so a barangay with three events last year
                    and nothing planned still read "3 upcoming". Compared
                    against today in Manila, not the browser's timezone. */}
                <div className="stat-card-value">{countUpcoming(events, 'event_date')}</div>
                <div className="stat-card-label">Upcoming Events</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <div className="stat-card-icon red">
                    <FaUsers />
                  </div>
                </div>
                <div className="stat-card-value">{reservations.length}</div>
                <div className="stat-card-label">Total Reservations</div>
              </div>
            </div>

            {/* ── Punong Barangay status, compact ──────────────────────
                The dedicated sidebar tab is gone, so this is now the ONLY
                place the status is read and set. It therefore carries the
                Kapitan's own controls rather than linking to them.

                A <select> replaces the four-button grid: one control
                instead of four, which is what makes it fit on a dashboard
                row. The options, their order and their wording are
                unchanged -- KAPITAN_STATUS_OPTIONS is the same constant
                the grid used, so nothing a user reads has moved.

                ⚠️ The permission is unchanged. `isKapitan` is still the
                only thing that renders a control, handleUpdateKapitanStatus
                still returns early for anyone else, and the database
                policy was not touched. An official who is not the Punong
                Barangay sees the status and no control, exactly as
                before. */}
            <div className="kapitan-compact">
              <div className="kapitan-compact-identity">
                <FaUserTie className="kapitan-compact-icon" aria-hidden="true" />
                <div>
                  <span className="kapitan-compact-role">{PUNONG_BARANGAY_LABEL}</span>
                  <span className="kapitan-compact-name">
                    {punongBarangayName || 'Barangay Batinguel'}
                  </span>
                </div>
              </div>

              {/* ⚠️ Shown only to an official who is NOT the Punong
                  Barangay. For the Kapitan the <select> below already
                  carries the current value, and rendering both put
                  "✅ Available" on screen twice, side by side -- the
                  same near-identical-strings-stacked fault
                  HEALTH_NURSE_ROLE exists to prevent. A select reports
                  its own state; a second copy of it is not information.
                  Measured in the browser before removing it. */}
              {!isKapitan && (
                <div className="kapitan-compact-state">
                  {kapitanStatusDisplay(kapitanStatus)}
                </div>
              )}

              {isKapitan && (
                <div className="kapitan-compact-control">
                  <label className="visually-hidden" htmlFor="kapitan-status-select">
                    Set your availability status
                  </label>
                  <select
                    id="kapitan-status-select"
                    className="kapitan-compact-select"
                    value={kapitanStatus}
                    onChange={(event) => handleUpdateKapitanStatus(event.target.value)}
                  >
                    {KAPITAN_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.emoji} {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            </div>

            {/* Pending Reservations */}
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Pending Court Reservations</h3>
                <button
                  className="view-all-link"
                  onClick={() => setActiveTab('reservations')}>
                  View All
                </button>
              </div>

              {loading ? (
                <p className="dashboard-loading">Loading...</p>
              ) : pendingReservations.length === 0 ? (
                <p className="dashboard-empty">No pending reservations.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Date</th>
                        <th scope="col">Time</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingReservations.slice(0, 5).map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">{res.full_name}</td>
                          <td data-label="Date">{res.preferred_date}</td>
                          {/* The badge sits with the time, because the
                              time is what the exception is about. A
                              booking from before migration 020 has no
                              reason and gets no badge -- see
                              isExceptionRequest, which reads the reason
                              rather than the hour. */}
                          <td data-label="Time">
                            {res.preferred_time}
                            {isExceptionRequest(res) && (
                              <span
                                className="badge badge-exception"
                                title="Starts before 5:00 PM. The resident asked for an office-hours exception; an official decides it."
                              >
                                {EXCEPTION_BADGE_LABEL}
                              </span>
                            )}
                          </td>
                          <td data-label="Purpose">
                            {res.purpose}
                            {isExceptionRequest(res) && (
                              <span className="exception-reason-note">
                                <strong>Office-hours reason:</strong>{' '}
                                {res.exception_reason}
                              </span>
                            )}
                          </td>
                          <td data-label="Action">
                            {isTreasurer ? (
                              <>
                                <button
                                  className="btn-approve"
                                  disabled={processingReservationIds.has(res.id)}
                                  onClick={() => handleApproveReservation(res)}>
                                  Approve
                                </button>
                                <button
                                  className="btn-deny"
                                  disabled={processingReservationIds.has(res.id)}
                                  onClick={() => handleDeclineReservation(res)}>
                                  Deny
                                </button>
                              </>
                            ) : (
                              <span className="role-restricted-note">Treasurer only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================
            ANNOUNCEMENTS TAB
        ======================== */}
        {activeTab === 'announcements' && (
          <div>
            <div className="announcements-header">
              <h1>Announcements</h1>
              <p>Manage your broadcast communications and keep the community informed.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Announcements</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={announcementFilter}
                      onChange={(e) => setAnnouncementFilter(e.target.value)}
                    >
                      <option value="all">All Categories</option>
                      {[...new Set(announcements.map((a) => a.badge).filter(Boolean))].map((badge) => (
                        <option key={badge} value={badge}>{badge}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn-add" onClick={handleOpenAddAnnouncement}>
                    <FaPlus /> Add Announcement
                  </button>
                </div>
              </div>

              {(() => {
                const filteredAnnouncements = announcementFilter === 'all'
                  ? announcements
                  : announcements.filter((a) => a.badge === announcementFilter)

                return filteredAnnouncements.length === 0 ? (
                  <p className="dashboard-empty">
                    {announcementFilter === 'all'
                      ? 'No announcements yet.'
                      : 'No announcements match this filter.'}
                  </p>
                ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Badge</th>
                        <th scope="col">Date Posted</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAnnouncements.map((ann) => (
                        <tr key={ann.id}>
                          <td data-label="Title">{ann.title}</td>
                          <td data-label="Badge">{ann.badge}</td>
                          <td data-label="Date Posted">
                            {new Date(ann.date_posted).toLocaleDateString()}
                          </td>
                          <td data-label="Action" className="action-cell">
                            <ActionMenu
                              portal
                              subject={ann.title}
                              items={[
                                {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <FaEdit />,
                                  onSelect: () => handleOpenEditAnnouncement(ann),
                                },
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  icon: <FaTrash />,
                                  danger: true,
                                  // Still goes through the shared
                                  // confirmation dialog -- the menu only
                                  // changes where the control lives.
                                  onSelect: () => handleDeleteAnnouncement(ann),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ========================
            EVENTS TAB
        ======================== */}
        {activeTab === 'events' && (
          <div>
            <div className="events-header">
              <h1>Events</h1>
              <p>Manage upcoming neighborhood activities and events.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Events</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {/* ⚠️ Table is the default and stays the management
                      interface: Add, Edit and Delete live there. The
                      calendar is an additional visual schedule over the
                      same `events` rows. */}
                  <ViewToggle
                    label="How to view events"
                    value={eventView}
                    onChange={setEventView}
                    options={[
                      { value: 'table', label: 'Table', icon: <FaList aria-hidden="true" /> },
                      { value: 'calendar', label: 'Calendar', icon: <FaCalendarAlt aria-hidden="true" /> },
                    ]}
                  />
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      {/* Names the dimension, not the entity -- this sat
                          inside a card already headed "All Events". */}
                      <option value="all">All Dates</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="past">Past</option>
                    </select>
                  </div>
                  <button className="btn-add" onClick={handleOpenAddEvent}>
                    <FaPlus /> Add Event
                  </button>
                </div>
              </div>

              {eventView === 'calendar' && (
                <div className="dashboard-calendar-layout">
                  <MonthCalendar
                    year={eventMonth.year}
                    month={eventMonth.month}
                    onMonthChange={setEventMonth}
                    selectedDate={eventCalendarDate}
                    onSelectDate={setEventCalendarDate}
                    today={calendarToday}
                    idPrefix="official-events"
                    renderDay={(cell) => describeEventDay(cell, officialEventCalendar)}
                    caption={'Placed by event_date. Select a date to see what is '
                      + 'scheduled; add, edit and delete stay in the table.'}
                  />

                  <div className="mcal-day-panel">
                    {!eventCalendarDate ? (
                      <p className="mcal-day-empty">Select a date to see its events.</p>
                    ) : (
                      <>
                        <h4>{longDate(eventCalendarDate)}</h4>
                        {eventCalendarDayEvents.length === 0 ? (
                          <p className="mcal-day-empty">Nothing scheduled on this date.</p>
                        ) : (
                          <div className="mcal-day-list">
                            {eventCalendarDayEvents.map((event) => (
                              <div key={event.id} className="mcal-day-item">
                                <span className="mcal-day-item-title">{event.title}</span>
                                {event.location && (
                                  <span className="mcal-day-item-meta">{event.location}</span>
                                )}
                                <button
                                  type="button"
                                  className="btn-add btn-sm"
                                  onClick={() => handleOpenEditEvent(event)}
                                >
                                  <FaEdit aria-hidden="true" /> Edit
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {eventView === 'table' && (() => {
                // ⚠️ Manila, not UTC. `new Date().toISOString()` is still
                // on yesterday's date until 8 AM Philippine time, so an
                // event dated today was filed under "past" for the first
                // eight hours of every day -- while the Upcoming Events
                // card on the same dashboard, which already uses this
                // helper, counted it as upcoming. The two disagreed.
                const todayStr = manilaToday()
                const filteredEvents = eventFilter === 'all'
                  ? events
                  : eventFilter === 'upcoming'
                    ? events.filter((ev) => ev.event_date >= todayStr)
                    : events.filter((ev) => ev.event_date < todayStr)

                return filteredEvents.length === 0 ? (
                  <p className="dashboard-empty">
                    {eventFilter === 'all'
                      ? 'No events yet.'
                      : 'No events match this filter.'}
                  </p>
                ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Title</th>
                        <th scope="col">Date</th>
                        <th scope="col">Location</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEvents.map((event) => (
                        <tr key={event.id}>
                          <td data-label="Title">{event.title}</td>
                          <td data-label="Date">{event.event_date}</td>
                          <td data-label="Location">{event.location}</td>
                          <td data-label="Action" className="action-cell">
                            <ActionMenu
                              portal
                              subject={event.title}
                              items={[
                                {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <FaEdit />,
                                  onSelect: () => handleOpenEditEvent(event),
                                },
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  icon: <FaTrash />,
                                  danger: true,
                                  onSelect: () => handleDeleteEvent(event),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ========================
            RESERVATIONS TAB
        ======================== */}
        {activeTab === 'reservations' && (
          <div>
            <div className="reservations-header">
              <h1>Reservations</h1>
              <p>Review pending court reservations and manage time slots.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Reservations</h3>
                {/* ⚠️ Queue is the default and stays the management
                    interface: search, status, the exceptions filter,
                    Approve and Decline, the resident's contact details
                    and the exception reason all live there. The calendar
                    is an additional way to look at the same rows. */}
                <ViewToggle
                  label="How to view reservations"
                  value={reservationView}
                  onChange={setReservationView}
                  options={[
                    { value: 'queue', label: 'Queue', icon: <FaClipboardList aria-hidden="true" /> },
                    { value: 'calendar', label: 'Calendar', icon: <FaCalendarAlt aria-hidden="true" /> },
                  ]}
                />
              </div>

              {reservationView === 'calendar' && (
                <div className="dashboard-calendar-layout">
                  <MonthCalendar
                    year={reservationMonth.year}
                    month={reservationMonth.month}
                    onMonthChange={setReservationMonth}
                    selectedDate={calendarDate}
                    onSelectDate={setCalendarDate}
                    today={calendarToday}
                    idPrefix="official-reservations"
                    renderDay={(cell) => describeReservationDay(cell, reservationCalendar)}
                    caption={'Amber means a booking on that date is still waiting on an '
                      + 'official. Green means every booking on it has been decided. '
                      + 'Declined and cancelled bookings release their slots and do not '
                      + 'make a date look occupied.'}
                  />

                  {/* Names, purposes and exception reasons go HERE, never
                      inside a calendar cell. Same information the queue
                      already shows this official -- nothing new is
                      exposed, and nothing is exposed publicly. */}
                  <div className="mcal-day-panel">
                    {!calendarDate ? (
                      <p className="mcal-day-empty">
                        Select a date to see its bookings.
                      </p>
                    ) : (
                      <>
                        <h4>{longDate(calendarDate)}</h4>
                        {calendarDayReservations.length === 0 ? (
                          <p className="mcal-day-empty">No bookings on this date.</p>
                        ) : (
                          <>
                            <div className="mcal-day-list">
                              {calendarDayReservations.map((res) => (
                                <div key={res.id} className="mcal-day-item">
                                  <span className="mcal-day-item-time">
                                    {res.preferred_time} · {res.duration_hours}h
                                  </span>
                                  <span className="mcal-day-item-title">{res.full_name}</span>
                                  <span className={`badge ${reservationStatusClass(res.status)}`}>
                                    {reservationStatusLabel(res.status)}
                                  </span>
                                  {isExceptionRequest(res) && (
                                    <span className="badge badge-exception">
                                      {EXCEPTION_BADGE_LABEL}
                                    </span>
                                  )}
                                  <span className="mcal-day-item-meta">{res.purpose}</span>
                                </div>
                              ))}
                            </div>
                            {/* Decisions stay in the queue. This takes the
                                official there with the date already in the
                                search box, rather than duplicating Approve
                                and Decline in a second place. */}
                            <button
                              type="button"
                              className="btn-add btn-sm mcal-day-action"
                              onClick={() => {
                                setReservationDateFilter(calendarDate)
                                setReservationView('queue')
                              }}
                            >
                              Open these in the queue
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ⚠️ The queue is the management interface and the
                  default. Only its visibility is conditional here --
                  nothing about the filtering, the ordering, the
                  Treasurer-only gate or the decision handlers
                  changed. */}
              {reservationView === 'queue' && (
                <>
                {/* The status dropdown now sits in the shared filter bar
                    beside the search box, so it reads as one set of controls
                    narrowing one list. Same options as before plus
                    Cancelled, and the two compose -- see
                    visibleReservations. */}
                <DashboardFilterBar
                  idPrefix="reservations"
                  searchLabel="Search reservations by name, contact number, email, purpose or purok"
                  placeholder="Search reservations..."
                  query={reservationQuery}
                  onQueryChange={setReservationQuery}
                  selectFilter={{
                    label: 'Filter reservations by status',
                    value: reservationFilter,
                    onChange: setReservationFilter,
                    options: RESERVATION_FILTER_OPTIONS,
                  }}
                  toggleFilter={{
                    label: `Office-hours exceptions only (${exceptionReservationCount})`,
                    checked: reservationExceptionsOnly,
                    onChange: setReservationExceptionsOnly,
                  }}
                  resultText={
                    reservationFiltersActive
                      ? `Showing ${visibleReservations.length} of ${reservations.length}`
                        + ` ${reservations.length === 1 ? 'reservation' : 'reservations'}`
                        // Named, because the calendar can set this
                        // filter and an official arriving in the queue
                        // would otherwise see a short list with no
                        // reason given.
                        + (reservationDateFilter ? ` on ${longDate(reservationDateFilter)}` : '')
                      : `${reservations.length}`
                        + ` ${reservations.length === 1 ? 'reservation' : 'reservations'}`
                  }
                  onReset={resetReservationFilters}
                  filtersActive={reservationFiltersActive}
                />

                {(() => {
                  // Ordering is newest submission first, set by
                  // fetchReservations and unchanged; filtering preserves it.
                  const filteredReservations = visibleReservations

                  return filteredReservations.length === 0 ? (
                    <p className="dashboard-empty">
                      {reservationFiltersActive
                        ? 'No reservations match this search.'
                        : 'No reservations yet.'}
                    </p>
                  ) : (
                  <div className="table-wrapper">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th scope="col">Name</th>
                          <th scope="col">Phone</th>
                          <th scope="col">Email</th>
                          <th scope="col">Purok</th>
                          <th scope="col">Date</th>
                          <th scope="col">Time</th>
                          {/* "Hours" and "Filed" rather than "Duration" and
                              "Submitted": an uppercase letter-spaced header
                              was setting the minimum width of a column whose
                              values are "3h" and a short date, so the header
                              was costing more room than the data it labels. */}
                          <th scope="col">Hours</th>
                          <th scope="col">Purpose</th>
                          <th scope="col">Filed</th>
                          <th scope="col">Status</th>
                          <th scope="col">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReservations.map((res) => (
                          <tr
                            key={res.id}
                            // ⚠️ CARD MODE ONLY -- see the Document
                            // Requests table. Only `pending` puts
                            // anything in the Action cell: the menu for
                            // the Treasurer, the "Treasurer only" note
                            // for anybody else. A decided booking
                            // renders nothing, so below 769px the cell,
                            // its ACTION heading and the divider above
                            // it are collapsed rather than left as a
                            // label with a gap under it.
                            className={actionCellIsEmpty({
                              itemCount: reservationMenuItems(res).length,
                              noteShown: res.status === 'pending' && !isTreasurer,
                            }) ? 'row-no-actions' : undefined}
                          >
                            <td data-label="Name">{res.full_name}</td>
                            <td data-label="Phone">{res.contact_number || '—'}</td>
                            {/* Truncated with an ellipsis rather than
                                wrapped: a 57-character address broken
                                character-by-character was taking four lines
                                and making every other row that tall. The
                                whole address is in the tooltip, and the
                                truncation is released in card mode where
                                the value must be complete. */}
                            <td data-label="Email">
                              {res.email ? (
                                <span className="cell-truncate" title={res.email}>
                                  {res.email}
                                </span>
                              ) : '—'}
                            </td>
                            {/* The column is already headed Purok, so the
                                cell says "4" rather than "Purok 4". Display
                                only -- the stored value is untouched and is
                                on the cell as a tooltip, which is also how
                                a legacy free-text spelling stays visible. */}
                            <td data-label="Purok" title={res.purok || undefined}>
                              {purokShortLabel(res.purok) || '—'}
                            </td>
                            <td data-label="Date">{res.preferred_date}</td>
                            {/* The badge sits with the time, because the
                                time is what the exception is about. A
                                booking from before migration 020 has no
                                reason and gets no badge -- see
                                isExceptionRequest, which reads the reason
                                rather than the hour. */}
                            <td data-label="Time">
                              {res.preferred_time}
                              {isExceptionRequest(res) && (
                                <span
                                  className="badge badge-exception"
                                  title="Starts before 5:00 PM. The resident asked for an office-hours exception; an official decides it."
                                >
                                  {EXCEPTION_BADGE_LABEL}
                                </span>
                              )}
                            </td>
                            <td data-label="Hours">{res.duration_hours}h</td>
                            <td data-label="Purpose">
                              {res.purpose}
                              {isExceptionRequest(res) && (
                                <span className="exception-reason-note">
                                  <strong>Office-hours reason:</strong>{' '}
                                  {res.exception_reason}
                                </span>
                              )}
                            </td>
                            <td data-label="Filed">
                              {res.created_at ? new Date(res.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td data-label="Status">
                              {/* Was `badge-${res.status}` with the raw value
                                  as its text: a cancelled booking produced
                                  `badge-cancelled`, which no stylesheet
                                  defined, and an official read "pending"
                                  where the resident read "Pending". Both now
                                  come from the shared map. */}
                              <span className={`badge ${reservationStatusClass(res.status)}`}>
                                {reservationStatusLabel(res.status)}
                              </span>
                            </td>
                            {/* ⚠️ The two decisions are in a ⋮ menu since
                                the PR #24 polish pass, and the Treasurer
                                gate is UNCHANGED: `reservationActions`
                                returns an empty list for anybody else, so
                                the note below is what they still see. The
                                handlers, the notification and the audit
                                entry are the same ones the buttons
                                called. Only `pending` is decidable, so a
                                decided booking renders no trigger at all
                                rather than an empty menu. */}
                            <td data-label="Action" className="action-cell">
                              {res.status === 'pending' && (
                                isTreasurer ? (
                                  <ActionMenu
                                    portal
                                    subject={reservationSubject({
                                      dateLabel: longDate(res.preferred_date),
                                      residentName: res.full_name,
                                    })}
                                    items={reservationMenuItems(res)}
                                  />
                                ) : (
                                  <span className="role-restricted-note">Treasurer only</span>
                                )
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )
                })()}
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================
            KAPITAN STATUS TAB
            (Only visible to Punong Barangay via Sidebar)
        ======================== */}
        {/* ========================
            DOCUMENT REQUESTS TAB
        ======================== */}
        {activeTab === 'documents' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Document Requests</h1>
              <p>Review and process resident requests for barangay documents.</p>
            </div>

            <div className="dashboard-card">
              {documentRequests.length > 0 && (
                <DashboardFilterBar
                  idPrefix="documents"
                  searchLabel="Search document requests by resident name, document type, purpose, contact number or purok"
                  placeholder="Search requests..."
                  query={documentQuery}
                  onQueryChange={setDocumentQuery}
                  selectFilter={{
                    label: 'Filter document requests by status',
                    value: documentFilter,
                    onChange: setDocumentFilter,
                    options: DOCUMENT_FILTER_OPTIONS,
                  }}
                  resultText={
                    documentFiltersActive
                      ? `Showing ${visibleDocumentRequests.length} of ${documentRequests.length}`
                        + ` ${documentRequests.length === 1 ? 'request' : 'requests'}`
                      : ''
                  }
                  onReset={resetDocumentFilters}
                  filtersActive={documentFiltersActive}
                />
              )}

              {/* ⚠️ Two different empty states. "No document requests
                  yet" and "nothing matches your filters" are different
                  facts, and showing the first while a filter is applied
                  would tell an official the queue is empty when it is
                  not. */}
              {documentRequests.length === 0 ? (
                <p className="dashboard-empty">No document requests yet.</p>
              ) : visibleDocumentRequests.length === 0 ? (
                <p className="dashboard-empty">No document requests match this search.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Resident</th>
                        <th scope="col">Document</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Status</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDocumentRequests.map((req) => {
                        // Built once: the row needs the count to decide
                        // whether its card keeps an Action heading, and
                        // building it twice would be two answers.
                        const actions = isSecretary ? docRequestMenuItems(req) : []
                        return (
                        <tr
                          key={req.id}
                          // ⚠️ CARD MODE ONLY. The class carries no
                          // styling above 768px, so the desktop column
                          // and every cell in it are untouched; below
                          // it, the appended rule in `Sidebar.css`
                          // collapses an Action cell that renders
                          // nothing, label and divider included. A
                          // non-Secretary still sees the note, so the
                          // row is NOT marked empty for them.
                          className={actionCellIsEmpty({
                            itemCount: actions.length,
                            noteShown: !isSecretary,
                          }) ? 'row-no-actions' : undefined}
                        >
                          <td data-label="Resident">{req.full_name}</td>
                          <td data-label="Document">{req.document_type}</td>
                          <td data-label="Purpose">{req.purpose}</td>
                          <td data-label="Contact">{req.contact_number || '—'}</td>
                          <td data-label="Status">
                            {/* The resident portal read "Ready for Pickup"
                                from its own label map while this table
                                printed "ready for pickup" from a regex on
                                the stored value. One map now serves both. */}
                            <span className={`badge ${documentStatusClass(req.status)}`}>
                              {documentStatusLabel(req.status)}
                            </span>
                          </td>
                          <td data-label="Submitted">
                            {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
                          </td>
                          {/* ⚠️ A ⋮ MENU SINCE THE PR #24 POLISH PASS,
                              and the header on `ActionMenu` used to name
                              this very cell as the reason it could not
                              be one. That rule was narrowed on the repo
                              owner's review of the live table: the
                              Action column was a band of buttons wide
                              enough to set the row height, and X6's
                              Generate Document had just made it a
                              three-control cell.

                              ⚠️ NOTHING ABOUT AUTHORIZATION MOVED.
                              `isSecretary` is the same flag the RLS
                              UPDATE policy's position requires, it still
                              gates the whole cell, and
                              `documentRequestActions` returns an empty
                              list without it -- so an action this
                              official may not perform is ABSENT, never
                              present and disabled.

                              ⚠️ `canGenerate` still carries all three
                              gates (Secretary, an eligible status, a
                              configured template) in one call, inside
                              `docRequestMenuItems`, so the cell cannot
                              drift from the registry. Generating changes
                              no status.

                              `claimed` and `declined` offer nothing, and
                              the menu renders no trigger at all for an
                              empty list rather than a ⋮ that opens on
                              nothing. */}
                          <td data-label="Action" className="action-cell">
                            {isSecretary ? (
                              <ActionMenu
                                portal
                                subject={documentRequestSubject(req.full_name)}
                                items={actions}
                              />
                            ) : (
                              <span className="role-restricted-note">Secretary only</span>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'waste' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Waste Management</h1>
              <p>Manage the public waste collection schedule shown to residents.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Collection Schedule</h3>
                <button className="btn-add" onClick={handleOpenAddWaste}>
                  <FaPlus /> Add Schedule Entry
                </button>
              </div>

              {wasteSchedule.length === 0 ? (
                <p className="dashboard-empty">No waste schedule entries yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Purok</th>
                        <th scope="col">Waste Type</th>
                        <th scope="col">Day</th>
                        <th scope="col">Time</th>
                        <th scope="col">Notes</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wasteSchedule.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Purok">{entry.purok || '—'}</td>
                          <td data-label="Waste Type">{entry.waste_type}</td>
                          <td data-label="Day">{entry.day_of_week}</td>
                          <td data-label="Time">{entry.time_label || '—'}</td>
                          <td data-label="Notes">{entry.notes || '—'}</td>
                          <td data-label="Action" className="action-cell">
                            <ActionMenu
                              portal
                              subject={entry.purok || 'this schedule'}
                              items={[
                                {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <FaEdit />,
                                  onSelect: () => handleEditWaste(entry),
                                },
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  icon: <FaTrash />,
                                  danger: true,
                                  onSelect: () => handleDeleteWaste(entry),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'residents' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Residents</h1>
              <p>
                Resident accounts, grouped by where they stand in verification.
                The group is read from each account&rsquo;s stored verification
                status — nothing here is a second record that could drift from it.
              </p>
            </div>

            <div className="dashboard-card">
              {residentsList.length === 0 ? (
                <p className="dashboard-empty">No residents have registered yet.</p>
              ) : (
                <>
                  {/* Group buttons rather than an ARIA tablist: these swap the
                      panel below without changing the page, and a plain button
                      is keyboard-operable with no arrow-key handling to get
                      wrong. `aria-pressed` carries the selected state to a
                      screen reader, which the green underline does not. */}
                  <div className="resident-group-tabs" role="group" aria-label="Resident account groups">
                    {RESIDENT_GROUPS.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        className={`resident-group-tab${residentGroup === group.id ? ' is-active' : ''}`}
                        aria-pressed={residentGroup === group.id}
                        onClick={() => setResidentGroup(group.id)}
                      >
                        {group.label}
                        <span className="resident-group-tab-count">
                          {residentGroupCounts[group.id]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <p className="dashboard-card-note">{activeResidentGroup.description}</p>

                  {/* Why the sidebar badge can read lower than this tab's
                      count: the badge counts only what is waiting on an
                      official. Both numbers are right; without this line
                      they look like one of them is wrong. */}
                  {residentGroup === 'requests' && residentGroups.requests.length > 0 && (
                    <p className="dashboard-card-note">
                      {[
                        `${awaitingVerificationCount} awaiting an official's review`
                          + ' (what the sidebar badge counts)',
                        `${returnedToResidentCount} returned to the resident to correct`,
                        unclassifiedRequestCount > 0
                          ? `${unclassifiedRequestCount} with an unrecognised status — see the`
                            + ' cross-check below'
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}

                  <DashboardFilterBar
                    idPrefix="residents"
                    searchLabel="Search resident accounts by name, contact number or purok"
                    placeholder="Search name, contact or purok…"
                    query={residentQuery}
                    onQueryChange={setResidentQuery}
                    selectFilter={{
                      label: 'Filter resident accounts by purok',
                      value: residentPurok,
                      onChange: setResidentPurok,
                      options: PUROK_FILTER_OPTIONS,
                    }}
                    resultText={
                      residentFiltersActive
                        ? `Showing ${visibleResidents.length} of `
                          + `${residentGroups[residentGroup].length} in ${activeResidentGroup.label}`
                        : `${visibleResidents.length} ${visibleResidents.length === 1 ? 'account' : 'accounts'}`
                          + ` in ${activeResidentGroup.label}`
                    }
                    onReset={resetResidentFilters}
                    filtersActive={residentFiltersActive}
                  />

                  {visibleResidents.length === 0 ? (
                    <p className="dashboard-empty">
                      {residentFiltersActive
                        ? 'No accounts in this group match the search.'
                        : activeResidentGroup.emptyMessage}
                    </p>
                  ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Purok</th>
                        <th scope="col">Voter List Match</th>
                        <th scope="col">Verification</th>
                        <th scope="col">ID</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleResidents.map((resident) => {
                        const registryMatch = findRegistryMatch(resident)
                        const state = describeVerification(resident.verification_status)
                        return (
                        <tr key={resident.id}>
                          <td data-label="Name">{resident.full_name}</td>
                          <td data-label="Contact">{resident.contact_number || '—'}</td>
                          <td data-label="Purok" title={resident.purok || undefined}>
                            {purokShortLabel(resident.purok) || '—'}
                            {/* A value the purok list does not contain cannot be
                                grouped or matched. Flagged in words, not left to
                                be noticed -- and never rewritten here. */}
                            {resident.purok && !isKnownPurok(resident.purok) && (
                              <span
                                className="resident-purok-flag"
                                title="This spelling is not on the barangay's purok list, so it cannot be grouped or matched. Correct it with the resident; the signup and settings forms now offer the list."
                              >
                                not on the list
                              </span>
                            )}
                          </td>
                          <td data-label="Voter List Match">
                            {registryMatch?.exact ? (
                              <span
                                className="badge badge-approved"
                                title={`Voter reference entry: ${registryMatch.entry.full_name}`
                                  + ` — ${registryMatch.entry.purok || 'no purok'}`
                                  + `${registryMatch.entry.household_number ? `, ${registryMatch.entry.household_number}` : ''}`
                                  + '. A supporting cross-reference, not proof of identity — the ID and the official settle who this is.'}
                              >
                                ✓ On voter list
                              </span>
                            ) : registryMatch ? (
                              <span
                                className="badge badge-pending"
                                title={`Closest entry: ${registryMatch.entry.full_name}`
                                  + ` — ${registryMatch.entry.purok || 'no purok'}`
                                  + `${registryMatch.entry.household_number ? `, ${registryMatch.entry.household_number}` : ''}`
                                  + '. Not an exact name match on the voter reference list — check the ID.'}
                              >
                                ~ Similar name
                              </span>
                            ) : (
                              <span
                                className="role-restricted-note"
                                title="This name is not on the barangay's voter reference list. That list covers registered voters, not every resident, so being absent from it is normal and is NEVER a reason to reject anyone — verify from the ID or in person."
                              >
                                Not on voter list
                              </span>
                            )}
                          </td>
                          <td data-label="Verification">
                            {/* The label is a sentence-length description of the
                                stored state, and the stored value itself is in
                                the tooltip. "rejected" and "ineligible" used to
                                share one red badge and differ only in the word
                                -- one is resubmittable and the other is
                                permanent, so they now read differently and are
                                coloured differently. */}
                            <span
                              className={`badge badge-${state.tone}`}
                              title={`${state.meaning} (stored as “${resident.verification_status}”)`}
                            >
                              {state.label}
                            </span>
                            {(resident.verification_status === 'rejected'
                              || resident.verification_status === 'ineligible')
                              && resident.verification_notes && (
                              <div className="resident-status-note">
                                {resident.verification_notes}
                              </div>
                            )}
                          </td>
                          <td data-label="ID">
                            {resident.id_document_url ? (
                              <button
                                className="btn-add btn-sm"
                                onClick={() => handleViewId(resident)}
                              >
                                View ID
                              </button>
                            ) : (
                              // Optional by design: requiring an ID would
                              // exclude the residents who most need barangay
                              // documents. Absence is not a finding.
                              <span
                                className="role-restricted-note"
                                title="Uploading an ID is optional. This resident can be verified in person at the Barangay Hall."
                              >
                                None uploaded
                              </span>
                            )}
                          </td>
                          <td data-label="Action" className="action-cell">
                            {resident.verification_status !== 'verified' && (
                              <button
                                className="btn-approve"
                                disabled={processingVerificationIds.has(resident.id)}
                                onClick={() => handleVerifyResident(resident)}
                              >
                                {resident.verification_status === 'ineligible' ? 'Reinstate' : 'Verify'}
                              </button>
                            )}
                            {resident.verification_status !== 'rejected'
                              && resident.verification_status !== 'ineligible' && (
                              <button
                                className="btn-deny"
                                disabled={processingVerificationIds.has(resident.id)}
                                onClick={() => handleOpenReject(resident)}
                              >
                                Reject
                              </button>
                            )}
                            {resident.verification_status !== 'ineligible' && (
                              <button
                                className="btn-deny"
                                style={{ background: '#7f1d1d' }}
                                disabled={processingVerificationIds.has(resident.id)}
                                onClick={() => handleOpenIneligible(resident)}
                                title="Not a resident of this barangay — permanent"
                              >
                                Not a Resident
                              </button>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                  )}
                </>
              )}
            </div>

            {/* ── D6: account ↔ voter reference list cross-check ─────
                Always rendered, including when there is nothing to report.
                The Archived Officials panel was hidden while empty in
                migration 018's first cut and the result was a reviewer
                looking for a feature that was working correctly. A panel
                that says "nothing to reconcile" is the useful answer; a
                panel that is absent is indistinguishable from one that is
                broken.

                Read-only by construction: this block renders findings and
                offers no action. Nothing here merges records, rewrites a
                name, creates or deletes an account, or edits the voter
                reference data. */}
            <div className="dashboard-card" style={{ marginTop: 20 }}>
              <div className="dashboard-card-header">
                <h3>Account &amp; voter list cross-check</h3>
                <span className="official-archive-count">
                  {reconciliationIssues.length === 0
                    ? 'nothing to cross-check'
                    : [
                      reconciliationAttention > 0
                        ? `${reconciliationAttention} to look at` : null,
                      reconciliationInformational > 0
                        ? `${reconciliationInformational} for information` : null,
                    ].filter(Boolean).join(' · ')}
                </span>
              </div>
              <p className="dashboard-card-note">
                <strong>{VOTER_LIST_CAVEAT}</strong>
              </p>
              <p className="dashboard-card-note">
                So a verified resident who is <em>not</em> on the voter reference
                list is <strong>normal, not an error</strong>, and stays verified.
                Being absent from that list must never lead to a rejection, a loss
                of verification or a &ldquo;Not a resident&rdquo; outcome — and a
                verified account must never be added to the voter reference data
                just to clear a line from this panel.
              </p>
              <p className="dashboard-card-note">
                Nothing here changes any record; the panel has no actions at all.
                Names are compared as exact text because the two tables share no
                identifier — a string comparison, never a statement that two
                records describe the same person.
              </p>

              {reconciliationIssues.length === 0 ? (
                <p className="dashboard-empty">
                  Nothing to cross-check between resident accounts and the voter
                  reference list.
                </p>
              ) : (
                <ul className="reconcile-list">
                  {reconciliationIssues.map((issue) => (
                    <li key={issue.id} className={`reconcile-item reconcile-${issue.severity}`}>
                      <div className="reconcile-item-head">
                        {/* Three levels, not two: 'expected' says in words that
                            the rows beneath it are the normal case, so ordinary
                            verified residents are not filed under "problems". */}
                        <span className={`badge badge-${RECONCILE_SEVERITIES[issue.severity].badge}`}>
                          {RECONCILE_SEVERITIES[issue.severity].label}
                        </span>
                        <h4>{issue.title}</h4>
                        <span className="reconcile-count">
                          {issue.items.length}
                        </span>
                      </div>
                      <p className="reconcile-explanation">{issue.explanation}</p>
                      <ul className="reconcile-rows">
                        {issue.items.map((item) => (
                          <li key={item.key}>
                            <span className="reconcile-row-name">{item.label}</span>
                            <span className="reconcile-row-detail">{item.detail}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}

              <p className="reconcile-footnote">
                An account and a voter reference entry cannot be linked reliably
                until there is a stored relationship between them — the{' '}
                <code>profile_id</code> foreign key still outstanding in the
                project notes. Until that exists this panel is detection only, and
                a name match here proves that two records carry the same text, not
                that they describe the same person.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'registry' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Voter Reference List</h1>
              <p>
                {VOTER_LIST_CAVEAT} It is used as a cross-reference signal when
                verifying a new account — never as an automatic approval, and
                never as a reason to refuse somebody who is not on it.
              </p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Voter Reference Entries</h3>
                <button className="btn-add" onClick={handleOpenAddRegistryEntry}>
                  <FaPlus /> Add Voter Entry
                </button>
              </div>

              {registryEntries.length === 0 ? (
                <p className="dashboard-empty">No voter reference entries yet.</p>
              ) : (
                <>
                  <DashboardFilterBar
                    idPrefix="registry"
                    searchLabel="Search the voter reference list by name, purok, household number or contact number"
                    placeholder="Search name, purok, household or contact…"
                    query={registryQuery}
                    onQueryChange={setRegistryQuery}
                    selectFilter={{
                      label: 'Filter voter reference entries by purok',
                      value: registryPurok,
                      onChange: setRegistryPurok,
                      options: PUROK_FILTER_OPTIONS,
                    }}
                    resultText={
                      registryFiltersActive
                        ? `Showing ${visibleRegistryEntries.length} of ${registryEntries.length} entries`
                        : `${registryEntries.length} ${registryEntries.length === 1 ? 'entry' : 'entries'}`
                    }
                    onReset={resetRegistryFilters}
                    filtersActive={registryFiltersActive}
                  />

                  {visibleRegistryEntries.length === 0 ? (
                    <p className="dashboard-empty">
                      No voter reference entries match the search.
                    </p>
                  ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Purok</th>
                        <th scope="col">Household #</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRegistryEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Name">{entry.full_name}</td>
                          <td data-label="Purok" title={entry.purok || undefined}>
                            {purokShortLabel(entry.purok) || '—'}
                            {entry.purok && !isKnownPurok(entry.purok) && (
                              <span
                                className="resident-purok-flag"
                                title="This spelling is not on the barangay's purok list, so it cannot be grouped or matched. Editing this entry now offers the list."
                              >
                                not on the list
                              </span>
                            )}
                          </td>
                          <td data-label="Household #">{entry.household_number || '—'}</td>
                          <td data-label="Contact">{entry.contact_number || '—'}</td>
                          <td data-label="Action" className="action-cell">
                            <ActionMenu
                              portal
                              subject={entry.full_name}
                              items={[
                                {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <FaEdit />,
                                  onSelect: () => handleEditRegistryEntry(entry),
                                },
                                {
                                  key: 'delete',
                                  label: 'Delete',
                                  icon: <FaTrash />,
                                  danger: true,
                                  onSelect: () => handleDeleteRegistryEntry(entry),
                                },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'officials' && (
          <div>
            <div className="officials-dir-header">
              <h1>Officials Directory</h1>
              <p>Manage the digital face of your community leadership.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Barangay Officials</h3>
                <button className="btn-add" onClick={handleOpenAddOfficial}>
                  <FaPlus /> Add Official
                </button>
              </div>

              {officialsList.length === 0 ? (
                <p className="dashboard-empty">No officials in the directory yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Photo</th>
                        <th scope="col">Order</th>
                        <th scope="col">Name</th>
                        <th scope="col">Position</th>
                        <th scope="col">Committee</th>
                        <th scope="col">Contact</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officialsList.map((official) => (
                        <tr key={official.id}>
                          <td data-label="Photo">
                            <PersonAvatar
                              name={official.full_name}
                              photoUrl={official.photo_url}
                              fallbackIcon={<FaUser style={{ fontSize: 18, color: '#6b7280' }} />}
                              className="official-row-photo"
                            />
                          </td>
                          <td data-label="Order">{official.display_order ?? '—'}</td>
                          <td data-label="Name">{official.full_name}</td>
                          <td data-label="Position">{official.position}</td>
                          <td data-label="Committee">{official.committee || '—'}</td>
                          <td data-label="Contact">{official.contact_number || '—'}</td>
                          <td data-label="Action" className="action-cell">
                            {/* ⚠️ The self-archive guard is preserved
                                exactly: when this is the signed-in
                                official's own record the Archive item is
                                NOT in the menu, and the reason is still
                                stated in text rather than left to a
                                disabled control that explains nothing.
                                Archive, not Delete -- an official who
                                leaves office is kept as barangay
                                history, and there is no permanent-delete
                                control in this UI. */}
                            <ActionMenu
                              portal
                              subject={official.full_name}
                              items={[
                                {
                                  key: 'edit',
                                  label: 'Edit',
                                  icon: <FaEdit />,
                                  onSelect: () => handleEditOfficial(official),
                                },
                                // ⚠️ "Archive", never "Delete". The two are
                                // different outcomes here and the word is
                                // the only thing that says so -- see
                                // *Officials archive*. Only the redundant
                                // entity noun was dropped.
                                ...(isOwnOfficialRecord(official) ? [] : [{
                                  key: 'archive',
                                  label: 'Archive',
                                  icon: <FaArchive />,
                                  danger: true,
                                  onSelect: () => setArchivingOfficial(official),
                                }]),
                              ]}
                            />
                            {isOwnOfficialRecord(official) && (
                              <span className="official-archive-blocked">
                                Your own record — another official must archive it
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ========================
                ARCHIVED OFFICIALS
            ========================
                Deliberately a panel INSIDE this tab rather than a
                fourteenth sidebar destination: the archive, the warning
                and the corrective action belong on one screen.

                Restore is the only action. Archived records are historical
                records, so there is no Edit and no Delete -- to change
                normal information, restore first and use the existing Edit
                flow. Note that this is enforced by this UI only; migration
                018 protects archived_at and archived_by but does not make
                the other historical fields immutable in the database. That
                is a deliberate Phase 3A boundary.

                ALWAYS RENDERED, including at zero. An earlier version hid
                the whole panel while empty, on the theory that a heading
                over nothing is noise. That was wrong here for three
                reasons, found by testing the deploy preview:

                  - The archive could not be demonstrated or verified until
                    somebody had already archived a real official, which is
                    the one thing you want to avoid doing just to look at
                    the UI.
                  - An official told "archiving keeps the record" had no way
                    to confirm that before using it. The empty state is
                    where the promise is stated.
                  - Every other list in these dashboards shows an empty
                    state instead of vanishing -- "No officials in the
                    directory yet." sits in the card directly above. Hiding
                    made this the one inconsistent surface. */}
            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Archived Officials</h3>
                <span className="official-archive-count">
                  {archivedOfficials.length} historical {archivedOfficials.length === 1 ? 'record' : 'records'}
                </span>
              </div>

              <p className="dashboard-card-note">
                Officials who have left office. They do not appear in the
                directory above or on the public Officials page, and their
                photos are kept. Restoring one returns it exactly as stored.
              </p>

              {archivedOfficials.length === 0 ? (
                <p className="dashboard-empty">No archived officials.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">Photo</th>
                        <th scope="col">Name</th>
                        <th scope="col">Position</th>
                        <th scope="col">Committee</th>
                        <th scope="col">Archived</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivedOfficials.map((official) => (
                        <tr key={official.id}>
                          <td data-label="Photo">
                            <PersonAvatar
                              name={official.full_name}
                              photoUrl={official.photo_url}
                              fallbackIcon={<FaUser style={{ fontSize: 18, color: '#6b7280' }} />}
                              className="official-row-photo"
                            />
                          </td>
                          <td data-label="Name">{official.full_name}</td>
                          <td data-label="Position">{official.position}</td>
                          <td data-label="Committee">{official.committee || '—'}</td>
                          <td data-label="Archived">
                            {official.archived_at
                              ? new Date(official.archived_at).toLocaleDateString()
                              : '—'}
                          </td>
                          <td data-label="Action">
                            <button
                              className="btn-approve"
                              onClick={() => setRestoringOfficial(official)}>
                              <FaUndo /> Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================
            SETTINGS TAB
        ======================== */}
        {activeTab === 'reports' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Reports</h1>
              <p>Activity trends across document requests and court reservations.</p>
            </div>

            <div className="report-summary-grid">
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">{documentRequests.length}</div>
                <div className="report-stat-label">Total Document Requests</div>
              </div>
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">{reservations.length}</div>
                <div className="report-stat-label">Total Reservations</div>
              </div>
              {/* Both figures come from the same grouping the Residents tab
                  lists, so the two tabs cannot report different numbers for
                  the same thing. "Registered Residents" used to count every
                  account including the ones established not to be residents
                  at all, which read as a barangay population figure and was
                  not one. */}
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">{residentGroups.residents.length}</div>
                <div className="report-stat-label">Verified Residents</div>
              </div>
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">{residentGroups.requests.length}</div>
                <div className="report-stat-label">Open Verification Requests</div>
              </div>
            </div>

            <div className="dashboard-card" style={{ marginTop: 20 }}>
              <div className="dashboard-card-header">
                <h3>Last 6 Months</h3>
              </div>
              {monthlyCounts.every((b) => b.documents === 0 && b.reservations === 0) ? (
                <p className="dashboard-empty">No activity recorded in the last 6 months yet.</p>
              ) : (
                <>
                  <div className="chart-legend">
                    <span><i className="chart-dot chart-dot-doc" /> Document Requests</span>
                    <span><i className="chart-dot chart-dot-res" /> Reservations</span>
                  </div>
                  <div className="bar-chart">
                    {monthlyCounts.map((b) => (
                      <div key={b.key} className="bar-chart-col">
                        <div className="bar-chart-bars">
                          <div
                            className="bar bar-doc"
                            style={{ height: `${(b.documents / maxMonthly) * 100}%` }}
                            title={`${b.documents} document request(s)`}
                          />
                          <div
                            className="bar bar-res"
                            style={{ height: `${(b.reservations / maxMonthly) * 100}%` }}
                            title={`${b.reservations} reservation(s)`}
                          />
                        </div>
                        <div className="bar-chart-label">{b.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="report-two-col">
              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <h3>Most Requested Documents</h3>
                </div>
                {documentTypeCounts.length === 0 ? (
                  <p className="dashboard-empty">No document requests yet.</p>
                ) : (
                  <div className="rank-list">
                    {documentTypeCounts.map(([type, count]) => (
                      <div key={type} className="rank-row">
                        <span className="rank-label">{type}</span>
                        <div className="rank-bar-track">
                          <div
                            className="rank-bar-fill"
                            style={{ width: `${(count / documentTypeCounts[0][1]) * 100}%` }}
                          />
                        </div>
                        <span className="rank-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <h3>Busiest Reservation Days</h3>
                </div>
                {reservations.length === 0 ? (
                  <p className="dashboard-empty">No reservations yet.</p>
                ) : (
                  <div className="rank-list">
                    {busiestDays.map((d) => (
                      <div key={d.name} className="rank-row">
                        <span className="rank-label">{d.name}</span>
                        <div className="rank-bar-track">
                          <div
                            className="rank-bar-fill rank-bar-alt"
                            style={{ width: `${(d.count / maxDay) * 100}%` }}
                          />
                        </div>
                        <span className="rank-count">{d.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Activity Log</h1>
              <p>A record of actions taken in the system. Entries cannot be edited or deleted.</p>
            </div>

            <div className="dashboard-card">
              {activityLog.length === 0 ? (
                <p className="dashboard-empty">
                  No activity recorded yet. Actions taken from now on (approvals,
                  declines, verifications, cancellations) will appear here.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Who</th>
                        <th scope="col">Action</th>
                        <th scope="col">Type</th>
                        <th scope="col">Subject</th>
                        <th scope="col">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activityLog.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="When">
                            {new Date(entry.created_at).toLocaleString()}
                          </td>
                          <td data-label="Who">{entry.actor_name || '—'}</td>
                          <td data-label="Action">
                            <span className={`badge badge-${
                              ['approved', 'verified', 'claimed'].includes(entry.action) ? 'approved'
                                : ['declined', 'rejected', 'cancelled'].includes(entry.action) ? 'declined'
                                  : 'pending'
                            }`}>
                              {/* Was `entry.action.replace(/_/g, ' ')`, which
                                  put "ready for pickup" and "marked
                                  ineligible" on screen. An action the maps
                                  do not know is still shown exactly as
                                  stored -- the audit trail is the one place
                                  an unexpected value must stay visible. */}
                              {activityActionLabel(entry.action)}
                            </span>
                          </td>
                          <td data-label="Type">{activityEntityLabel(entry.entity_type)}</td>
                          <td data-label="Subject">{entry.subject || '—'}</td>
                          <td data-label="Notes">{entry.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Settings</h1>
              <p>Manage your account preferences.</p>
            </div>

            {/* ─── MY CONSULTATION HOURS ─────────────────────────────
                ⚠️ YOUR OWN ROW, AND NOBODY ELSE'S. Migration 026's
                INSERT, UPDATE and DELETE policies resolve "own" through
                `official_id_for_current_user()`; this form cannot be
                made to write another official's schedule by editing it,
                because the database is what decides. Verified by
                impersonating two different officials over the API: the
                Secretary's UPDATE of the Treasurer's row matched 0 rows.

                It is also why there is no "edit somebody else's hours"
                control anywhere -- not hidden, absent, the same rule
                ActionMenu follows. */}
            <div className="dashboard-card" style={{ maxWidth: 760, marginBottom: 20 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaCalendarAlt style={{ color: '#1e3a8a' }} /> My Consultation Hours
                </h3>
              </div>

              {!officialInfo?.id ? (
                /* ⚠️ The orphaned-official case, said in words rather
                   than shown as a form that silently saves nothing.
                   An official whose `profiles.full_name` no longer
                   matches an active `barangay_officials.full_name` has
                   no directory row to attach hours to -- the project's
                   documented string-join fragility, and there is at
                   least one such account in the live data right now. */
                <p className="dashboard-empty">
                  Your account is not linked to an active record in the Officials
                  Directory, so consultation hours cannot be saved yet. This
                  happens when the name on your account and the name in the
                  directory are not identical. Ask another official to check both.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#5f6775', marginBottom: 14, lineHeight: 1.6 }}>
                    Shown on the public Officials page so residents know when they
                    can see you. Only you can change your own hours. A day left
                    blank simply shows nothing.
                  </p>

                  <div className="availability-editor">
                    {buildOfficialWeek(myAvailability).map((entry) => (
                      <AvailabilityDayRow
                        key={entry.day}
                        entry={entry}
                        saving={savingAvailability === entry.day}
                        onSave={(next) => handleSaveAvailability(entry.day, next)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480, marginBottom: 20 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaUser style={{ color: '#1e3a8a' }} /> Profile Photo
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <PersonAvatar
                  name={userProfile?.full_name}
                  photoUrl={officialInfo?.photo_url}
                  fallbackIcon={
                    <div style={{
                      width: 64, height: 64, borderRadius: '50%', background: '#e5e7eb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FaUser style={{ fontSize: 24, color: '#6b7280' }} />
                    </div>
                  }
                  className="official-row-photo"
                />
                <div>
                  <label
                    htmlFor="avatar-upload"
                    className="btn-add"
                    style={{ cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Uploading...' : 'Change Photo'}
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={submitting}
                    style={{ display: 'none' }}
                  />
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                    JPG or PNG, shown across the public Officials Directory.
                  </p>
                </div>
              </div>
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaLock style={{ color: '#1e3a8a' }} /> Change Password
                </h3>
              </div>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
                Choose a strong password at least 6 characters long.
              </p>

              <div className="modal-form-group">
                <label htmlFor="off-new-password" className="modal-form-label">New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input id="off-new-password"
                    type={showNew ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    aria-pressed={showNew}
                    aria-label={showNew ? 'Hide the new password' : 'Show the new password'}
                    onClick={() => setShowNew(!showNew)}
                    style={{
                      position: 'absolute', right: 12, background: 'none',
                      border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: 15, display: 'flex', alignItems: 'center', padding: 0,
                    }}>
                    {showNew ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>

              <div className="modal-form-group">
                <label htmlFor="off-confirm-new-password" className="modal-form-label">Confirm New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input id="off-confirm-new-password"
                    type={showConfirm ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    aria-pressed={showConfirm}
                    aria-label={showConfirm ? 'Hide the confirmed password' : 'Show the confirmed password'}
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{
                      position: 'absolute', right: 12, background: 'none',
                      border: 'none', cursor: 'pointer', color: '#64748b',
                      fontSize: 15, display: 'flex', alignItems: 'center', padding: 0,
                    }}>
                    {showConfirm ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                    Passwords do not match
                  </p>
                )}
                {confirmPassword && newPassword === confirmPassword && (
                  <p style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>
                    Passwords match ✓
                  </p>
                )}
              </div>

              <button
                className="btn-save"
                onClick={handleChangePassword}
                disabled={passwordLoading}
                style={{ marginTop: 8 }}>
                {passwordLoading ? 'Saving...' : 'Save Password'}
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ========================
          ANNOUNCEMENT MODAL
      ======================== */}
      {showAnnouncementModal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-1-title">
            <h3 id="offdlg-1-title">
              {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
            </h3>

            <div className="modal-form-group">
              <label htmlFor="off-title" className="modal-form-label">Title</label>
              <input id="off-title"
                type="text"
                className="modal-form-input"
                placeholder="Announcement title"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-badge-category" className="modal-form-label">Badge / Category</label>
              <input id="off-badge-category"
                type="text"
                className="modal-form-input"
                placeholder="e.g. PUBLIC WORKS, HEALTH"
                value={newAnnouncement.badge}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, badge: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-description" className="modal-form-label">Description</label>
              <textarea id="off-description"
                className="modal-form-textarea"
                placeholder="Announcement description"
                value={newAnnouncement.description}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, description: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() => { setShowAnnouncementModal(false); setEditingAnnouncement(null) }}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={editingAnnouncement ? handleUpdateAnnouncement : handleAddAnnouncement}
                disabled={submitting}
              >
                {submitting
                  ? 'Saving...'
                  : editingAnnouncement ? 'Save Changes' : 'Save Announcement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================
          EVENT MODAL
      ======================== */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-2-title">
            <h3 id="offdlg-2-title">{editingEvent ? 'Edit Event' : 'Add Event'}</h3>

            <div className="modal-form-group">
              <label htmlFor="off-event-title" className="modal-form-label">Event Title</label>
              <input id="off-event-title"
                type="text"
                className="modal-form-input"
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-location" className="modal-form-label">Location</label>
              <input id="off-location"
                type="text"
                className="modal-form-input"
                placeholder="Event location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-event-date" className="modal-form-label">Event Date</label>
              <input id="off-event-date"
                type="date"
                className="modal-form-input"
                value={newEvent.event_date}
                onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowEventModal(false)
                  setEditingEvent(null)
                }}
              >
                Cancel
              </button>
              <button
                className="btn-save"
                onClick={editingEvent ? handleUpdateEvent : handleAddEvent}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Save Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================
          OFFICIAL MODAL (Add / Edit)
      ======================== */}
      {showOfficialModal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-3-title">
            <h3 id="offdlg-3-title">{editingOfficial ? 'Edit Official' : 'Add Official'}</h3>

            {/* ⚠️ FULL NAME IS READ-ONLY WHEN EDITING, AND THAT IS
                TEMPORARY — see migration 029.

                It is not a view that display names should be
                un-editable. It is that a display name is currently an
                AUTHORIZATION KEY: the Secretary and Treasurer policies
                still join `profiles.full_name` to
                `barangay_officials.full_name`, so renaming a row moves
                a permission. Measured: a Kagawad could rename their own
                row, archive the real Secretary, insert a new row under
                their own profile name as Secretary, and then approve a
                document request. Three steps, all through this form.

                ⚠️ A3 RESTORES THIS FIELD. Once `official_account_links`
                carries identity, a name is just a name again — drop the
                `full_name` branch from `protect_official_record()` and
                put the input back. The `position` rule stays, because
                that one is about permissions rather than identity.

                Add still edits it: a new row has to have a name. */}
            {editingOfficial ? (
              <div className="modal-form-group">
                <span className="modal-form-label" id="off-full-name-label">Full Name</span>
                <p className="modal-form-static" aria-labelledby="off-full-name-label">
                  {newOfficial.full_name || '—'}
                </p>
                <p className="modal-form-hint">
                  Names and positions are what link an official's account to
                  their permissions, so both are corrected directly in the
                  database rather than from this form.
                </p>
              </div>
            ) : (
              <div className="modal-form-group">
                <label htmlFor="off-full-name" className="modal-form-label">Full Name</label>
                <input id="off-full-name"
                  type="text"
                  className="modal-form-input"
                  placeholder="e.g. Hon. Frankie Credo"
                  value={newOfficial.full_name}
                  onChange={(e) => setNewOfficial({ ...newOfficial, full_name: e.target.value })}
                />
              </div>
            )}

            {/* ⚠️ POSITION IS READ-ONLY WHEN EDITING, and the control is
                GONE rather than disabled, because migration 028 refuses
                the write at the database.

                Until 028, any official could open this form on their own
                row, set Position to "Barangay Secretary" and save --
                reproduced end to end as a Kagawad, who then approved a
                document request. `position` is what the Secretary and
                Treasurer RLS policies read, so the form was handing out
                its own permissions.

                ⚠️ A disabled <select> would be the wrong fix twice over:
                it would still be in the DOM announcing a control that
                does nothing, and it would leave the impression that the
                restriction is the form's. It is not -- it is
                `protect_official_record()`, and a crafted API call is
                refused with P0001 exactly the same way.

                The value is still SHOWN, because an official editing a
                record needs to see whose record it is. Changing one is
                SQL/admin maintenance; there is deliberately no in-app
                path, and no privileged UI was added to replace it. */}
            {editingOfficial ? (
              <div className="modal-form-group">
                <span className="modal-form-label" id="off-position-label">Position</span>
                <p className="modal-form-static" aria-labelledby="off-position-label">
                  {newOfficial.position || '—'}
                </p>
              </div>
            ) : (
              <div className="modal-form-group">
                <label htmlFor="off-position" className="modal-form-label">Position</label>
                <select id="off-position"
                  className="modal-form-input"
                  value={newOfficial.position}
                  onChange={(e) => setNewOfficial({ ...newOfficial, position: e.target.value })}
                >
                  <option value="">Select position</option>
                  {CLIENT_ASSIGNABLE_POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {/* ⚠️ The three powered positions are OMITTED, not shown
                    disabled. Migration 029 refuses an API INSERT naming
                    any of them, so a disabled option would advertise a
                    control the database turns down -- and a reader
                    cannot tell a disabled option from a bug. The
                    sentence says where they are assigned instead. */}
                <p className="modal-form-hint">
                  {POWERED_POSITIONS.join(', ')} are assigned directly in
                  the database, because they decide who may approve
                  document requests and reservations.
                </p>
              </div>
            )}

            <div className="modal-form-group">
              <label htmlFor="off-committee-optional" className="modal-form-label">Committee (optional)</label>
              <input id="off-committee-optional"
                type="text"
                className="modal-form-input"
                placeholder="e.g. Health and Sanitation"
                value={newOfficial.committee}
                onChange={(e) => setNewOfficial({ ...newOfficial, committee: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-contact-number-optional" className="modal-form-label">Contact Number (optional)</label>
              <input id="off-contact-number-optional"
                type="text"
                className="modal-form-input"
                placeholder="09XXXXXXXXX"
                value={newOfficial.contact_number}
                onChange={(e) => setNewOfficial({ ...newOfficial, contact_number: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-display-order" className="modal-form-label">Display Order</label>
              <input id="off-display-order"
                type="number"
                className="modal-form-input"
                placeholder="Lower numbers appear first"
                value={newOfficial.display_order}
                onChange={(e) => setNewOfficial({ ...newOfficial, display_order: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowOfficialModal(false); setEditingOfficial(null) }}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddOfficial} disabled={submitting}>
                {submitting ? 'Saving...' : editingOfficial ? 'Update Official' : 'Save Official'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWasteModal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-4-title">
            <h3 id="offdlg-4-title">{editingWaste ? 'Edit Schedule Entry' : 'Add Schedule Entry'}</h3>

            <div className="modal-form-group">
              <label htmlFor="off-purok" className="modal-form-label">Purok</label>
              <input id="off-purok"
                type="text"
                className="modal-form-input"
                placeholder="e.g. Purok 3"
                value={newWasteEntry.purok}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, purok: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-waste-type" className="modal-form-label">Waste Type</label>
              <select id="off-waste-type"
                className="modal-form-input"
                value={newWasteEntry.waste_type}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, waste_type: e.target.value })}
              >
                <option value="Biodegradable">Biodegradable</option>
                <option value="Non-biodegradable">Non-biodegradable</option>
                <option value="Recyclable">Recyclable</option>
              </select>
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-day-of-week" className="modal-form-label">Day of Week</label>
              <select id="off-day-of-week"
                className="modal-form-input"
                value={newWasteEntry.day_of_week}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, day_of_week: e.target.value })}
              >
                <option value="">Select day</option>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-time-optional" className="modal-form-label">Time (optional)</label>
              <input id="off-time-optional"
                type="text"
                className="modal-form-input"
                placeholder="e.g. 6:00 AM - 8:00 AM"
                value={newWasteEntry.time_label}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, time_label: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-notes-optional" className="modal-form-label">Notes (optional)</label>
              <input id="off-notes-optional"
                type="text"
                className="modal-form-input"
                placeholder="e.g. Segregate before collection"
                value={newWasteEntry.notes}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, notes: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowWasteModal(false); setEditingWaste(null) }}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleSaveWaste} disabled={submitting}>
                {submitting ? 'Saving...' : editingWaste ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegistryModal && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-5-title">
            <h3 id="offdlg-5-title">{editingRegistryEntry ? 'Edit Voter Reference Entry' : 'Add Voter Reference Entry'}</h3>

            <div className="modal-form-group">
              <label htmlFor="off-full-name-2" className="modal-form-label">Full Name</label>
              <input id="off-full-name-2"
                type="text"
                className="modal-form-input"
                placeholder="e.g. Juan Dela Cruz"
                value={newRegistryEntry.full_name}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, full_name: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label" htmlFor="registry-entry-purok">Purok</label>
              {/* The barangay's own list, not a text box. Free text here is
                  what produced the five different spellings of one purok
                  already in the data, none of which can be grouped or
                  matched against anything.

                  An entry that already holds an off-list value keeps it as
                  an extra option, selected: the dropdown must not silently
                  drop what the barangay recorded the moment somebody opens
                  the form to change a phone number. Correcting it is a
                  deliberate choice from the list. */}
              <select
                id="registry-entry-purok"
                className="modal-form-input"
                value={newRegistryEntry.purok}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, purok: e.target.value })}
              >
                <option value="">Select a purok</option>
                {PUROKS.map((purok) => (
                  <option key={purok} value={purok}>{purok}</option>
                ))}
                {newRegistryEntry.purok && !isKnownPurok(newRegistryEntry.purok) && (
                  <option value={newRegistryEntry.purok}>
                    {newRegistryEntry.purok} (as recorded — not on the list)
                  </option>
                )}
              </select>
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-household-number-optional" className="modal-form-label">Household Number (optional)</label>
              <input id="off-household-number-optional"
                type="text"
                className="modal-form-input"
                placeholder="e.g. HH-0012"
                value={newRegistryEntry.household_number}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, household_number: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor="off-contact-number-optional-2" className="modal-form-label">Contact Number (optional)</label>
              <input id="off-contact-number-optional-2"
                type="text"
                className="modal-form-input"
                placeholder="09xx xxx xxxx"
                value={newRegistryEntry.contact_number}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, contact_number: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => { setShowRegistryModal(false); setEditingRegistryEntry(null) }}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleSaveRegistryEntry} disabled={submitting}>
                {submitting ? 'Saving...' : editingRegistryEntry ? 'Update Entry' : 'Save Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ The preview owns its own dialog semantics and its own
          `useModalA11y` call, rather than joining the nine-modal list
          above. It is a self-contained component so the same preview
          can serve any future caller, and the two hooks never run at
          once -- the dashboard's sees `false` while the preview is
          open, because no dashboard modal is. */}
      <DocumentPreview
        request={documentRequestToPrint}
        open={Boolean(documentRequestToPrint)}
        onClose={() => setDocumentRequestToPrint(null)}
      />

      {decliningRequest && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-6-title">
            <h3 id="offdlg-6-title">Decline {decliningRequest.document_type} Request</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This resident will see this explanation on their Document Requests page.
            </p>

            <div className="modal-form-group">
              <label htmlFor="off-reason" className="modal-form-label">Reason</label>
              <textarea id="off-reason"
                className="modal-form-textarea"
                placeholder="e.g. Missing required signature, incomplete purpose, please visit the office"
                value={declineNotes}
                onChange={(e) => setDeclineNotes(e.target.value)}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setDecliningRequest(null)}>
                Cancel
              </button>
              <button
                className="btn-deny"
                onClick={handleConfirmDeclineRequest}
                disabled={processingDocRequestIds.has(decliningRequest.id)}
              >
                {processingDocRequestIds.has(decliningRequest.id) ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingId && (
        <div className="modal-overlay" onClick={() => setViewingId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }} role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-7-title">
            <h3 id="offdlg-7-title">ID — {viewingId.resident.full_name}</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
              This link expires in 2 minutes. Check that the name and address match
              what the resident entered.
            </p>
            <img
              src={viewingId.url}
              alt={`ID submitted by ${viewingId.resident.full_name}`}
              style={{
                width: '100%', maxHeight: '60vh', objectFit: 'contain',
                borderRadius: 8, background: '#f3f4f6',
              }}
            />
            <div className="modal-buttons">
              {/* A plain anchor, so this one IS click-initiated and
                  opens normally when an official needs to zoom in. */}
              <a
                className="btn-add"
                href={viewingId.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                Open full size
              </a>
              <button className="btn-cancel" onClick={() => setViewingId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {ineligibleResident && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-8-title">
            <h3 id="offdlg-8-title">Mark {ineligibleResident.full_name} as Not a Resident</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              Use this when the applicant is not a resident of Barangay Batinguel.
              Unlike Reject, they cannot put themselves back in the queue — only an
              official can reinstate the account.
            </p>
            {/* Spelled out because the old placeholder below offered
                "not listed in the residents registry" as a worked example of
                a reason, and that list is voter data rather than a roll of
                residents. A resident too young to vote, or registered
                elsewhere, or simply not yet supplied by the city, is absent
                from it while being a resident. */}
            <p style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>
              Not being on the Voter Reference List is <strong>not</strong> a reason
              to use this. That list covers registered voters the barangay holds
              records for, not every resident. Use it only when residency itself has
              been established as false.
            </p>
            {ineligibleResident.id_document_url && (
              <p style={{ fontSize: 12, color: '#b45309', marginBottom: 16 }}>
                Their uploaded ID will be permanently deleted. The account record and
                this decision are kept.
              </p>
            )}

            <div className="modal-form-group">
              <label htmlFor="off-reason-2" className="modal-form-label">Reason</label>
              <textarea id="off-reason-2"
                className="modal-form-textarea"
                placeholder="e.g. confirmed to be living in another barangay"
                value={ineligibleNotes}
                onChange={(e) => setIneligibleNotes(e.target.value)}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setIneligibleResident(null)}>
                Cancel
              </button>
              <button
                className="btn-deny"
                style={{ background: '#7f1d1d' }}
                onClick={handleConfirmIneligible}
                disabled={submitting}
              >
                {submitting ? 'Saving...' : 'Confirm Not a Resident'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectingResident && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} aria-labelledby="offdlg-9-title">
            <h3 id="offdlg-9-title">Reject {rejectingResident.full_name}'s Account</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This resident will see this explanation and can re-upload a new ID.
            </p>

            <div className="modal-form-group">
              <label htmlFor="off-reason-3" className="modal-form-label">Reason</label>
              <textarea id="off-reason-3"
                className="modal-form-textarea"
                placeholder="e.g. ID photo is blurry, name doesn't match, please re-upload"
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setRejectingResident(null)}>
                Cancel
              </button>
              <button className="btn-deny" onClick={handleConfirmReject} disabled={submitting}>
                {submitting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}

      {/* Officials archive. Each dialog renders only while its row is set,
          so there is no `open` prop to keep in sync with the row. */}
      <ArchiveOfficialDialog
        official={archivingOfficial}
        busy={submitting}
        onConfirm={handleArchiveOfficial}
        onCancel={() => { if (!submitting) setArchivingOfficial(null) }}
      />

      <RestoreOfficialDialog
        official={restoringOfficial}
        takenOrders={activeDisplayOrders}
        occupiedBy={officialsList.find(
          (o) => o.display_order === restoringOfficial?.display_order,
        )?.full_name}
        busy={submitting}
        onConfirm={handleRestoreOfficial}
        onCancel={() => { if (!submitting) setRestoringOfficial(null) }}
      />
    </div>
  )
}

export default OfficialDashboard