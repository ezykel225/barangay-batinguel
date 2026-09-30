import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FaClipboardList,
  FaBullhorn,
  FaCalendarAlt,
  FaUsers,
  FaUser,
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
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { pathFromPublicUrl } from '../utils/storagePath'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import { PersonAvatar } from '../utils/officialPhotos'
import { logActivity } from '../utils/activityLog'
import { useConfirm } from '../components/ConfirmDialog'
import {
  ArchiveOfficialDialog,
  RestoreOfficialDialog,
} from '../components/OfficialArchiveDialog'
import { PUROKS } from '../constants/barangay'
import {
  RESIDENT_GROUPS,
  RESIDENT_SEARCH_FIELDS,
  REGISTRY_SEARCH_FIELDS,
  PUROK_FILTER_UNLISTED,
  describeVerification,
  filterRows,
  findReconciliationIssues,
  groupResidents,
  isKnownPurok,
  normalizeName,
} from '../utils/residentGroups'
import '../components/Sidebar.css'
import './OfficialDashboard.css'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Search box + purok filter + result count + reset, shared by the
// Residents and Residents Registry tabs.
//
// ⚠️ Declared at module scope, NOT inside OfficialDashboard. A component
// defined in a render body is a brand-new component type on every
// render, so React unmounts the old tree and mounts a fresh one --
// which throws the text cursor out of the search box after the first
// keystroke and makes the field feel broken. Same reason the filter
// state lives in the dashboard rather than in here.
const ResidentFilterBar = ({
  idPrefix,
  searchLabel,
  placeholder,
  query,
  onQueryChange,
  purokLabel,
  purok,
  onPurokChange,
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

    <div className="filter-select-wrap">
      <FaFilter style={{ fontSize: 12, color: '#6b7280' }} aria-hidden="true" />
      <label className="visually-hidden" htmlFor={`${idPrefix}-purok`}>
        {purokLabel}
      </label>
      <select
        id={`${idPrefix}-purok`}
        className="filter-select"
        value={purok}
        onChange={(event) => onPurokChange(event.target.value)}
      >
        <option value="all">All puroks</option>
        {PUROKS.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        {/* Blank and off-list share one option because they are the same
            job from here: a value that cannot be grouped or matched. */}
        <option value={PUROK_FILTER_UNLISTED}>Blank or not on the list</option>
      </select>
    </div>

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

const OfficialDashboard = () => {
  const { user } = useAuth()
  // Destructive actions go through this rather than acting on the first
  // click. confirm() resolves true/false, so each handler needs one
  // early return and nothing else changes -- which matters, because
  // several of these sit on top of the per-row processing locks.
  const [confirm, confirmDialog] = useConfirm()
  const [activeTab, setActiveTab] = useState('dashboard')
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
  const [announcementFilter, setAnnouncementFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')

  // Residents tab: which of the three groups is open, plus the search
  // box and purok filter that apply within it. 'requests' is the default
  // because it is the group that needs an official to do something.
  const [residentGroup, setResidentGroup] = useState('requests')
  const [residentQuery, setResidentQuery] = useState('')
  const [residentPurok, setResidentPurok] = useState('all')
  // Residents Registry tab has its own pair, so switching tabs does not
  // silently carry a filter across into a different dataset.
  const [registryQuery, setRegistryQuery] = useState('')
  const [registryPurok, setRegistryPurok] = useState('all')

  // Logged-in user info from profiles + barangay_officials
  const [userProfile, setUserProfile] = useState(null)
  const [officialInfo, setOfficialInfo] = useState(null)

  // Modal States
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showOfficialModal, setShowOfficialModal] = useState(false)
  const [editingOfficial, setEditingOfficial] = useState(null)
  // Officials archive (migration 018). `archivingOfficial` and
  // `restoringOfficial` each hold the row a dialog is open for, or null.
  const [archivedOfficials, setArchivedOfficials] = useState([])
  const [archivingOfficial, setArchivingOfficial] = useState(null)
  const [restoringOfficial, setRestoringOfficial] = useState(null)
  const [showWasteModal, setShowWasteModal] = useState(false)
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
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .order('created_at', { ascending: false })

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
  // name is in the registry -- a badge reading "in registry" beside a
  // panel counting the same account as missing would leave an official
  // with no way to tell which was right. Collapsing runs of whitespace
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
          toast.success('Registry entry updated!')
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
          toast.success('Registry entry added!')
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
      title: 'Remove this registry entry?',
      message: `${entry.full_name} will be removed from the barangay's own resident `
        + 'record. This does not change their account if they have one, but the '
        + 'name will no longer appear as a registry match during verification.',
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
      toast.error('Nothing was removed — you may not have permission to change the registry.')
    } else {
      toast.success('Registry entry removed!')
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

  const handleVerifyResident = (resident) =>
    withVerificationGuard(resident.id, async () => {
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
  // Only the Treasurer approves/denies court reservations — they're the
  // one who actually receives the GCash payment and can verify it.
  const isTreasurer = officialInfo?.position === 'Barangay Treasurer'
  // Only the Secretary approves/denies document requests — they manage
  // administrative documents and official records.
  const isSecretary = officialInfo?.position === 'Barangay Secretary'

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

  const handleApproveReservation = (reservation) =>
    withReservationGuard(reservation, async () => {
      if (!isTreasurer) {
        toast.error('Only the Treasurer can approve reservations.')
        return
      }
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

  const handleDeclineReservation = (reservation) =>
    withReservationGuard(reservation, async () => {
      if (!isTreasurer) {
        toast.error('Only the Treasurer can decline reservations.')
        return
      }
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
      toast.error('No Kapitan status record exists yet. Ask the admin to create one.')
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

    setSubmitting(true)
    try {
      if (editingOfficial) {
        const { error } = await supabase
          .from('barangay_officials')
          .update({
            full_name: newOfficial.full_name,
            position: newOfficial.position,
            committee: newOfficial.committee || null,
            contact_number: newOfficial.contact_number || null,
            display_order: requestedOrder,
            updated_by: user?.id ?? null,
          })
          .eq('id', editingOfficial.id)

        if (error) {
          toast.error('Failed to update official!')
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

  const handleAddEvent = async () => {
    if (submitting) return
    if (!newEvent.title || !newEvent.event_date) {
      toast.error('Please fill in all fields!')
      return
    }

    setSubmitting(true)
    try {
      const date = new Date(newEvent.event_date)
      const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase()
      const day = String(date.getDate()).padStart(2, '0')

      // Readback returns the new id so the audit entry can point at the
      // row. Safe here: this table's SELECT policy covers whoever may
      // insert, so a successful insert is always readable by its author.
      const { data: inserted, error } = await supabase
        .from('events')
        .insert([{
          title: newEvent.title,
          location: newEvent.location,
          event_date: newEvent.event_date,
          event_month: month,
          event_day: day,
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

  // D6. Detection only -- see findReconciliationIssues for why this
  // cannot conclude anything about identity, and why it never writes.
  const reconciliationIssues = useMemo(
    () => findReconciliationIssues({ residents: residentsList, registryEntries }),
    [residentsList, registryEntries]
  )
  const reconciliationTotal = reconciliationIssues.reduce(
    (total, issue) => total + issue.items.length, 0
  )

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

  return (
    <div className="dashboard-layout">

      {/* Sidebar */}
      <Sidebar
        role="official"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content */}
      <main className="dashboard-main" id="main-content">

        {/* ========================
            DASHBOARD TAB
        ======================== */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="official-dashboard-header">
              <h1>Administrative Hub</h1>
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
                <div className="stat-card-value">{events.length}</div>
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

            {/* Kapitan Status — compact summary only. Full controls live on
                the dedicated "Kapitan Status" tab to avoid duplicating the
                same control in two places. */}
            <div className="kapitan-status-section">
              <h3>{isKapitan ? 'My Status' : "Kapitan's Status"}</h3>
              <div className="kapitan-current-display">
                {kapitanStatusDisplay(kapitanStatus)}
              </div>
              {isKapitan && (
                <button
                  className="view-all-link"
                  style={{ marginTop: 8 }}
                  onClick={() => setActiveTab('kapitan')}
                >
                  Update Status →
                </button>
              )}
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
                          <td data-label="Time">{res.preferred_time}</td>
                          <td data-label="Purpose">{res.purpose}</td>
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
              <h1>Community Voice</h1>
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
                  <button className="btn-add" onClick={() => setShowAnnouncementModal(true)}>
                    <FaPlus /> New Announcement
                  </button>
                </div>
              </div>

              {(() => {
                const filteredAnnouncements = announcementFilter === 'all'
                  ? announcements
                  : announcements.filter((a) => a.badge === announcementFilter)

                return filteredAnnouncements.length === 0 ? (
                  <p className="dashboard-empty">No announcements found.</p>
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
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteAnnouncement(ann)}>
                              Delete
                            </button>
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
              <h1>Community Events</h1>
              <p>Manage upcoming neighborhood activities and events.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Events</h3>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div className="filter-select-wrap">
                    <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                    <select
                      className="filter-select"
                      value={eventFilter}
                      onChange={(e) => setEventFilter(e.target.value)}
                    >
                      <option value="all">All Events</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="past">Past</option>
                    </select>
                  </div>
                  <button className="btn-add" onClick={() => setShowEventModal(true)}>
                    <FaPlus /> Add New Event
                  </button>
                </div>
              </div>

              {(() => {
                const todayStr = new Date().toISOString().slice(0, 10)
                const filteredEvents = eventFilter === 'all'
                  ? events
                  : eventFilter === 'upcoming'
                    ? events.filter((ev) => ev.event_date >= todayStr)
                    : events.filter((ev) => ev.event_date < todayStr)

                return filteredEvents.length === 0 ? (
                  <p className="dashboard-empty">No events found.</p>
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
                          <td data-label="Action">
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteEvent(event)}>
                              Delete
                            </button>
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
              <h1>Facility Booking Queue</h1>
              <p>Review pending court reservations and manage time slots.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>All Reservations</h3>
                <div className="filter-select-wrap">
                  <FaFilter style={{ fontSize: 12, color: '#6b7280' }} />
                  <select
                    className="filter-select"
                    value={reservationFilter}
                    onChange={(e) => setReservationFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
              </div>

              {(() => {
                // fetchReservations already orders by created_at desc, so
                // "All Statuses" shows most recent first by default.
                const filteredReservations = reservationFilter === 'all'
                  ? reservations
                  : reservations.filter((r) => r.status === reservationFilter)

                return filteredReservations.length === 0 ? (
                  <p className="dashboard-empty">No reservations found.</p>
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
                        <th scope="col">Duration</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Submitted</th>
                        <th scope="col">Status</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReservations.map((res) => (
                        <tr key={res.id}>
                          <td data-label="Name">{res.full_name}</td>
                          <td data-label="Phone">{res.contact_number || '—'}</td>
                          <td data-label="Email">{res.email || '—'}</td>
                          <td data-label="Purok">{res.purok}</td>
                          <td data-label="Date">{res.preferred_date}</td>
                          <td data-label="Time">{res.preferred_time}</td>
                          <td data-label="Duration">{res.duration_hours}h</td>
                          <td data-label="Purpose">{res.purpose}</td>
                          <td data-label="Submitted">
                            {res.created_at ? new Date(res.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td data-label="Status">
                            <span className={`badge badge-${res.status}`}>
                              {res.status}
                            </span>
                          </td>
                          <td data-label="Action">
                            {res.status === 'pending' && (
                              isTreasurer ? (
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
            </div>
          </div>
        )}

        {/* ========================
            KAPITAN STATUS TAB
            (Only visible to Punong Barangay via Sidebar)
        ======================== */}
        {activeTab === 'kapitan' && (
          <div>
            <div className="kapitan-page-header">
              <h1>Kapitan Status Tracker</h1>
              <p>Maintain transparency by providing real-time updates on your availability.</p>
            </div>

            {isKapitan ? (
              <div className="kapitan-status-section">
                <h3>Set Your Status</h3>
                <div className="kapitan-current-display">
                  {kapitanStatusDisplay(kapitanStatus)}
                </div>
                <div className="kapitan-status-grid">
                  {KAPITAN_STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      className={`kapitan-status-option ${kapitanStatus === option.value ? 'active' : ''}`}
                      onClick={() => handleUpdateKapitanStatus(option.value)}>
                      {option.emoji} {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kapitan-status-section">
                <h3>Kapitan's Current Status</h3>
                <div className="kapitan-current-display">
                  {kapitanStatusDisplay(kapitanStatus)}
                </div>
              </div>
            )}
          </div>
        )}

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
              {documentRequests.length === 0 ? (
                <p className="dashboard-empty">No document requests yet.</p>
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
                      {documentRequests.map((req) => (
                        <tr key={req.id}>
                          <td data-label="Resident">{req.full_name}</td>
                          <td data-label="Document">{req.document_type}</td>
                          <td data-label="Purpose">{req.purpose}</td>
                          <td data-label="Contact">{req.contact_number || '—'}</td>
                          <td data-label="Status">
                            <span className={`badge badge-${
                              req.status === 'ready_for_pickup' ? 'ready'
                                : req.status === 'claimed' ? 'claimed'
                                  : req.status
                            }`}>
                              {req.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td data-label="Submitted">
                            {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
                          </td>
                          <td data-label="Action" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {isSecretary ? (
                              <>
                                {req.status === 'pending' && (
                                  <>
                                    <button
                                      className="btn-approve"
                                      disabled={processingDocRequestIds.has(req.id)}
                                      onClick={() => handleUpdateDocRequestStatus(req, 'approved')}>
                                      Approve
                                    </button>
                                    <button
                                      className="btn-deny"
                                      disabled={processingDocRequestIds.has(req.id)}
                                      onClick={() => handleOpenDeclineRequest(req)}>
                                      Decline
                                    </button>
                                  </>
                                )}
                                {req.status === 'approved' && (
                                  <button
                                    className="btn-approve"
                                    disabled={processingDocRequestIds.has(req.id)}
                                    onClick={() => handleUpdateDocRequestStatus(req, 'ready_for_pickup')}>
                                    Mark Ready
                                  </button>
                                )}
                                {req.status === 'ready_for_pickup' && (
                                  <button
                                    className="btn-approve"
                                    disabled={processingDocRequestIds.has(req.id)}
                                    onClick={() => handleUpdateDocRequestStatus(req, 'claimed')}>
                                    Mark Claimed
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="role-restricted-note">Secretary only</span>
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
                  <FaPlus /> Add Entry
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
                          <td data-label="Purok">{entry.purok}</td>
                          <td data-label="Waste Type">{entry.waste_type}</td>
                          <td data-label="Day">{entry.day_of_week}</td>
                          <td data-label="Time">{entry.time_label || '—'}</td>
                          <td data-label="Notes">{entry.notes || '—'}</td>
                          <td data-label="Action" style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-add"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => handleEditWaste(entry)}>
                              <FaEdit /> Edit
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteWaste(entry)}>
                              <FaTrash /> Delete
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

                  <ResidentFilterBar
                    idPrefix="residents"
                    searchLabel="Search resident accounts by name, contact number or purok"
                    placeholder="Search name, contact or purok…"
                    query={residentQuery}
                    onQueryChange={setResidentQuery}
                    purokLabel="Filter resident accounts by purok"
                    purok={residentPurok}
                    onPurokChange={setResidentPurok}
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
                        <th scope="col">Registry Match</th>
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
                          <td data-label="Purok">
                            {resident.purok || '—'}
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
                          <td data-label="Registry Match">
                            {registryMatch?.exact ? (
                              <span
                                className="badge badge-approved"
                                title={`Registry: ${registryMatch.entry.full_name}`
                                  + ` — ${registryMatch.entry.purok || 'no purok'}`
                                  + `${registryMatch.entry.household_number ? `, ${registryMatch.entry.household_number}` : ''}`}
                              >
                                ✓ In registry
                              </span>
                            ) : registryMatch ? (
                              <span
                                className="badge badge-pending"
                                title={`Closest entry: ${registryMatch.entry.full_name}`
                                  + ` — ${registryMatch.entry.purok || 'no purok'}`
                                  + `${registryMatch.entry.household_number ? `, ${registryMatch.entry.household_number}` : ''}`
                                  + '. Not an exact name match — check the ID.'}
                              >
                                ~ Similar name
                              </span>
                            ) : (
                              <span
                                className="role-restricted-note"
                                title="This name is not in the barangay's registry. The registry is not complete, so this is not a reason to reject — verify from the ID or in person."
                              >
                                Not in registry
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
                                className="btn-add"
                                style={{ fontSize: 12, padding: '4px 10px' }}
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
                          <td data-label="Action" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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

            {/* ── D6: account ↔ registry reconciliation ──────────────
                Always rendered, including when there is nothing to report.
                The Archived Officials panel was hidden while empty in
                migration 018's first cut and the result was a reviewer
                looking for a feature that was working correctly. A panel
                that says "nothing to reconcile" is the useful answer; a
                panel that is absent is indistinguishable from one that is
                broken.

                Read-only by construction: this block renders findings and
                offers no action. Nothing here merges records, rewrites a
                name, creates or deletes an account, or edits the registry. */}
            <div className="dashboard-card" style={{ marginTop: 20 }}>
              <div className="dashboard-card-header">
                <h3>Account &amp; registry reconciliation</h3>
                <span className="official-archive-count">
                  {reconciliationIssues.length === 0
                    ? 'nothing to reconcile'
                    : `${reconciliationTotal} ${reconciliationTotal === 1 ? 'record' : 'records'}`
                      + ` across ${reconciliationIssues.length}`
                      + ` ${reconciliationIssues.length === 1 ? 'check' : 'checks'}`}
                </span>
              </div>
              <p className="dashboard-card-note">
                Differences between resident accounts and the barangay&rsquo;s own
                registry. Informational only — nothing on this panel changes any
                record, and a listing here is never by itself a reason to reverse a
                verification. Accounts and registry entries are compared by exact
                name, because the two tables share no identifier; that is a string
                comparison, never a statement that two records are the same person.
              </p>

              {reconciliationIssues.length === 0 ? (
                <p className="dashboard-empty">
                  No inconsistencies found between resident accounts and the registry.
                </p>
              ) : (
                <ul className="reconcile-list">
                  {reconciliationIssues.map((issue) => (
                    <li key={issue.id} className={`reconcile-item reconcile-${issue.severity}`}>
                      <div className="reconcile-item-head">
                        <span className={`badge badge-${issue.severity === 'warning' ? 'pending' : 'claimed'}`}>
                          {issue.severity === 'warning' ? 'Needs a look' : 'For information'}
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
                An account and a registry entry cannot be linked reliably until
                there is a stored relationship between them — the{' '}
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
              <h1>Residents Registry</h1>
              <p>The barangay's own record of known residents — used as a cross-reference signal when verifying new accounts, not an automatic approval.</p>
            </div>

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>Registry Entries</h3>
                <button className="btn-add" onClick={handleOpenAddRegistryEntry}>
                  <FaPlus /> Add Entry
                </button>
              </div>

              {registryEntries.length === 0 ? (
                <p className="dashboard-empty">No registry entries yet.</p>
              ) : (
                <>
                  <ResidentFilterBar
                    idPrefix="registry"
                    searchLabel="Search the registry by name, purok, household number or contact number"
                    placeholder="Search name, purok, household or contact…"
                    query={registryQuery}
                    onQueryChange={setRegistryQuery}
                    purokLabel="Filter registry entries by purok"
                    purok={registryPurok}
                    onPurokChange={setRegistryPurok}
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
                      No registry entries match the search.
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
                          <td data-label="Purok">
                            {entry.purok || '—'}
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
                          <td data-label="Action" style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-add"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => handleEditRegistryEntry(entry)}>
                              <FaEdit /> Edit
                            </button>
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteRegistryEntry(entry)}>
                              <FaTrash /> Delete
                            </button>
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
              <h1>Leadership Directory</h1>
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
                          <td data-label="Action" style={{ display: 'flex', gap: 8 }}>
                            <button
                              className="btn-add"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              onClick={() => handleEditOfficial(official)}>
                              <FaEdit /> Edit
                            </button>
                            {/* Archive, not Delete. An official who leaves
                                office is kept as barangay history. There is
                                no permanent-delete control in this UI.

                                An official may not archive their own record.
                                The reason is stated in text rather than left
                                to a disabled button, which explains nothing
                                on its own. */}
                            {isOwnOfficialRecord(official) ? (
                              <span className="official-archive-blocked">
                                Your own record — another official must archive it
                              </span>
                            ) : (
                              <button
                                className="btn-deny"
                                onClick={() => setArchivingOfficial(official)}>
                                <FaArchive /> Archive
                              </button>
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
                              {entry.action.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td data-label="Type">{entry.entity_type.replace(/_/g, ' ')}</td>
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
                <label className="modal-form-label">New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
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
                <label className="modal-form-label">Confirm New Password</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="modal-form-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{ paddingRight: 40 }}
                  />
                  <button
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
          <div className="modal">
            <h3>New Announcement</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Title</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Announcement title"
                value={newAnnouncement.title}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Badge / Category</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. PUBLIC WORKS, HEALTH"
                value={newAnnouncement.badge}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, badge: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Description</label>
              <textarea
                className="modal-form-textarea"
                placeholder="Announcement description"
                value={newAnnouncement.description}
                onChange={(e) => setNewAnnouncement({ ...newAnnouncement, description: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowAnnouncementModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddAnnouncement} disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Announcement'}
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
          <div className="modal">
            <h3>Add New Event</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Event Title</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Location</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="Event location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Event Date</label>
              <input
                type="date"
                className="modal-form-input"
                value={newEvent.event_date}
                onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowEventModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddEvent} disabled={submitting}>
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
          <div className="modal">
            <h3>{editingOfficial ? 'Edit Official' : 'Add Official'}</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Full Name</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Hon. Frankie Credo"
                value={newOfficial.full_name}
                onChange={(e) => setNewOfficial({ ...newOfficial, full_name: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Position</label>
              <select
                className="modal-form-input"
                value={newOfficial.position}
                onChange={(e) => setNewOfficial({ ...newOfficial, position: e.target.value })}
              >
                <option value="">Select position</option>
                <option value="Punong Barangay">Punong Barangay</option>
                <option value="Barangay Secretary">Barangay Secretary</option>
                <option value="Barangay Treasurer">Barangay Treasurer</option>
                <option value="Kagawad">Kagawad</option>
                <option value="SK Chairperson">SK Chairperson</option>
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Committee (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Health and Sanitation"
                value={newOfficial.committee}
                onChange={(e) => setNewOfficial({ ...newOfficial, committee: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Contact Number (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="09XXXXXXXXX"
                value={newOfficial.contact_number}
                onChange={(e) => setNewOfficial({ ...newOfficial, contact_number: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Display Order</label>
              <input
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
          <div className="modal">
            <h3>{editingWaste ? 'Edit Schedule Entry' : 'Add Schedule Entry'}</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Purok</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Purok 3"
                value={newWasteEntry.purok}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, purok: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Waste Type</label>
              <select
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
              <label className="modal-form-label">Day of Week</label>
              <select
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
              <label className="modal-form-label">Time (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. 6:00 AM - 8:00 AM"
                value={newWasteEntry.time_label}
                onChange={(e) => setNewWasteEntry({ ...newWasteEntry, time_label: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Notes (optional)</label>
              <input
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
          <div className="modal">
            <h3>{editingRegistryEntry ? 'Edit Registry Entry' : 'Add Registry Entry'}</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Full Name</label>
              <input
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
              <label className="modal-form-label">Household Number (optional)</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. HH-0012"
                value={newRegistryEntry.household_number}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, household_number: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Contact Number (optional)</label>
              <input
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

      {decliningRequest && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Decline {decliningRequest.document_type} Request</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This resident will see this explanation on their Document Requests page.
            </p>

            <div className="modal-form-group">
              <label className="modal-form-label">Reason</label>
              <textarea
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>ID — {viewingId.resident.full_name}</h3>
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
          <div className="modal">
            <h3>Mark {ineligibleResident.full_name} as Not a Resident</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
              Use this when the applicant is not a resident of Barangay Batinguel.
              Unlike Reject, they cannot put themselves back in the queue — only an
              official can reinstate the account.
            </p>
            {ineligibleResident.id_document_url && (
              <p style={{ fontSize: 12, color: '#b45309', marginBottom: 16 }}>
                Their uploaded ID will be permanently deleted. The account record and
                this decision are kept.
              </p>
            )}

            <div className="modal-form-group">
              <label className="modal-form-label">Reason</label>
              <textarea
                className="modal-form-textarea"
                placeholder="e.g. address is in another barangay; not listed in the residents registry"
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
                {submitting ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectingResident && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Reject {rejectingResident.full_name}'s Account</h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              This resident will see this explanation and can re-upload a new ID.
            </p>

            <div className="modal-form-group">
              <label className="modal-form-label">Reason</label>
              <textarea
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