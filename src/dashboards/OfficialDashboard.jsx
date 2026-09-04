import { useState, useEffect, useMemo } from 'react'
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
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import { PersonAvatar } from '../utils/officialPhotos'
import '../components/Sidebar.css'
import './OfficialDashboard.css'

const OfficialDashboard = () => {
  const { user } = useAuth()
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

  // Logged-in user info from profiles + barangay_officials
  const [userProfile, setUserProfile] = useState(null)
  const [officialInfo, setOfficialInfo] = useState(null)

  // Modal States
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [showEventModal, setShowEventModal] = useState(false)
  const [showOfficialModal, setShowOfficialModal] = useState(false)
  const [editingOfficial, setEditingOfficial] = useState(null)
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
    fetchDocumentRequests()
    fetchWasteSchedule()
    fetchResidentsList()
    fetchRegistryEntries()
    fetchActivityLog()
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

      // Get position/committee/avatar from barangay_officials
      const { data: official } = await supabase
        .from('barangay_officials')
        .select('id, position, committee, photo_url')
        .eq('full_name', profile.full_name)
        .single()

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

  const fetchOfficialsList = async () => {
    const { data, error } = await supabase
      .from('barangay_officials')
      .select('*')
      .order('display_order', { ascending: true })

    if (!error) setOfficialsList(data || [])
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

  const fetchActivityLog = async () => {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (!error) setActivityLog(data || [])
  }

  // Simple case-insensitive substring match on name (and purok when
  // both are known) — a helper SIGNAL for the official during
  // verification, not an automatic decision. A no-match doesn't
  // block anything; the official still decides.
  const findRegistryMatch = (resident) => {
    if (!resident?.full_name) return null
    const nameLower = resident.full_name.trim().toLowerCase()
    return registryEntries.find((entry) => {
      const entryName = (entry.full_name || '').trim().toLowerCase()
      return entryName === nameLower || entryName.includes(nameLower) || nameLower.includes(entryName)
    })
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
          setShowRegistryModal(false)
          fetchRegistryEntries()
        }
      } else {
        const { error } = await supabase.from('residents_registry').insert([{
          full_name: newRegistryEntry.full_name,
          purok: newRegistryEntry.purok || null,
          household_number: newRegistryEntry.household_number || null,
          contact_number: newRegistryEntry.contact_number || null,
          added_by: user?.id ?? null,
        }])

        if (error) {
          toast.error('Failed to add entry!')
        } else {
          toast.success('Registry entry added!')
          setShowRegistryModal(false)
          fetchRegistryEntries()
        }
      }
      setEditingRegistryEntry(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRegistryEntry = async (id) => {
    const { error } = await supabase.from('residents_registry').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete entry!')
    } else {
      toast.success('Registry entry removed!')
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
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
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
      const { error } = await supabase
        .from('document_requests')
        .update({
          status,
          reviewed_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
          ...(notes !== null ? { reviewer_notes: notes } : {}),
        })
        .eq('id', request.id)

      if (error) {
        toast.error('Failed to update request!')
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
          setShowWasteModal(false)
          fetchWasteSchedule()
        }
      } else {
        const { error } = await supabase.from('waste_schedule').insert([{
          purok: newWasteEntry.purok,
          waste_type: newWasteEntry.waste_type,
          day_of_week: newWasteEntry.day_of_week,
          time_label: newWasteEntry.time_label || null,
          notes: newWasteEntry.notes || null,
          display_order: Number(newWasteEntry.display_order) || 0,
          created_by: user?.id ?? null,
        }])

        if (error) {
          toast.error('Failed to add schedule entry!')
        } else {
          toast.success('Schedule entry added!')
          setShowWasteModal(false)
          fetchWasteSchedule()
        }
      }
      setEditingWaste(null)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteWaste = async (id) => {
    const { error } = await supabase.from('waste_schedule').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete schedule entry!')
    } else {
      toast.success('Schedule entry removed!')
      fetchWasteSchedule()
    }
  }

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

  const notifyResident = async (reservation, status) => {
    try {
      const { data, error } = await supabase.functions.invoke('notify-reservation-sms', {
        body: {
          contact_number: reservation.contact_number,
          full_name: reservation.full_name,
          status,
          preferred_date: reservation.preferred_date,
          preferred_time: reservation.preferred_time,
        },
      })
      if (error) {
        console.error('SMS notify error:', error)
      } else if (data?.skipped) {
        // SMS not configured yet — this is expected until SEMAPHORE_API_KEY is set.
        console.warn('SMS skipped:', data.reason)
      }
    } catch (err) {
      console.error('SMS notify error:', err)
    }
  }

  // Appends to the append-only audit trail. Deliberately fire-and-
  // forget with its own error handling: a logging failure should never
  // block or roll back the actual action the official just took.
  const logActivity = async ({ action, entityType, entityId, subject, details }) => {
    try {
      await supabase.from('activity_log').insert([{
        actor_id: user?.id ?? null,
        actor_name: userProfile?.full_name || 'Official',
        action,
        entity_type: entityType,
        entity_id: entityId ?? null,
        subject: subject ?? null,
        details: details ?? null,
      }])
    } catch (err) {
      console.error('Activity log error:', err)
    }
  }

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
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'approved', reviewed_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', reservation.id)

      if (error) {
        toast.error('Failed to approve reservation!')
      } else {
        toast.success('Reservation approved!')
        logActivity({
          action: 'approved',
          entityType: 'reservation',
          entityId: reservation.id,
          subject: `${reservation.full_name} — ${reservation.preferred_date} ${reservation.preferred_time}`,
        })
        notifyResident(reservation, 'approved')
        fetchReservations()
      }
    })

  const handleDeclineReservation = (reservation) =>
    withReservationGuard(reservation, async () => {
      if (!isTreasurer) {
        toast.error('Only the Treasurer can decline reservations.')
        return
      }
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'declined', reviewed_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq('id', reservation.id)

      if (error) {
        toast.error('Failed to decline reservation!')
      } else {
        toast.success('Reservation declined!')
        logActivity({
          action: 'declined',
          entityType: 'reservation',
          entityId: reservation.id,
          subject: `${reservation.full_name} — ${reservation.preferred_date} ${reservation.preferred_time}`,
        })
        notifyResident(reservation, 'declined')
        fetchReservations()
      }
    })

  const handleUpdateKapitanStatus = async (status) => {
    if (!isKapitan) return

    const { data } = await supabase
      .from('kapitan_status')
      .select('id')
      .single()

    const { error } = await supabase
      .from('kapitan_status')
      .update({ status })
      .eq('id', data.id)

    if (error) {
      toast.error('Failed to update status!')
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
            display_order: Number(newOfficial.display_order) || 0,
            updated_by: user?.id ?? null,
          })
          .eq('id', editingOfficial.id)

        if (error) {
          toast.error('Failed to update official!')
        } else {
          toast.success('Official updated!')
          setShowOfficialModal(false)
          fetchOfficialsList()
        }
      } else {
        const { error } = await supabase.from('barangay_officials').insert([{
          full_name: newOfficial.full_name,
          position: newOfficial.position,
          committee: newOfficial.committee || null,
          contact_number: newOfficial.contact_number || null,
          display_order: Number(newOfficial.display_order) || 0,
          created_by: user?.id ?? null,
        }])

        if (error) {
          toast.error('Failed to add official!')
        } else {
          toast.success('Official added!')
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
      display_order: official.display_order || 0,
    })
    setShowOfficialModal(true)
  }

  const handleOpenAddOfficial = () => {
    setEditingOfficial(null)
    setNewOfficial({ full_name: '', position: '', committee: '', contact_number: '', display_order: 0 })
    setShowOfficialModal(true)
  }

  const handleDeleteOfficial = async (id) => {
    const { error } = await supabase.from('barangay_officials').delete().eq('id', id)
    if (error) {
      toast.error('Failed to delete official!')
    } else {
      toast.success('Official removed from directory.')
      fetchOfficialsList()
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
      const { error } = await supabase
        .from('announcements')
        .insert([{
          title: newAnnouncement.title,
          description: newAnnouncement.description,
          badge: newAnnouncement.badge,
        }])

      if (error) {
        toast.error('Failed to add announcement!')
      } else {
        toast.success('Announcement added!')
        setShowAnnouncementModal(false)
        setNewAnnouncement({ title: '', description: '', badge: '' })
        fetchAnnouncements()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteAnnouncement = async (id) => {
    const { error } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete announcement!')
    } else {
      toast.success('Announcement deleted!')
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

      const { error } = await supabase
        .from('events')
        .insert([{
          title: newEvent.title,
          location: newEvent.location,
          event_date: newEvent.event_date,
          event_month: month,
          event_day: day,
        }])

      if (error) {
        toast.error('Failed to add event!')
      } else {
        toast.success('Event added!')
        setShowEventModal(false)
        setNewEvent({ title: '', location: '', event_date: '' })
        fetchEvents()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)

    if (error) {
      toast.error('Failed to delete event!')
    } else {
      toast.success('Event deleted!')
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

  // ── Reports: derived entirely from data already fetched, so no
  // extra queries are needed for the charts. ──────────────────────
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
      <div className="dashboard-main">

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
                        <th>Name</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Purpose</th>
                        <th>Action</th>
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
                        <th>Title</th>
                        <th>Badge</th>
                        <th>Date Posted</th>
                        <th>Action</th>
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
                              onClick={() => handleDeleteAnnouncement(ann.id)}>
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
                        <th>Title</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Action</th>
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
                              onClick={() => handleDeleteEvent(event.id)}>
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
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Purok</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Duration</th>
                        <th>Purpose</th>
                        <th>Donation</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Action</th>
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
                          <td data-label="Donation">
                            {res.payment_status === 'unpaid' || !res.payment_status ? (
                              <span style={{ fontSize: 12, color: '#9ca3af' }}>No donation</span>
                            ) : (
                              <span className={`badge badge-${res.payment_status === 'paid' ? 'approved' : res.payment_status === 'rejected' ? 'declined' : 'pending'}`}>
                                {res.payment_status === 'pending_verification' ? 'pledged' : res.payment_status}
                              </span>
                            )}
                            {res.payment_reference && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                Details: {res.payment_reference}
                              </div>
                            )}
                            {res.payment_screenshot && (
                              <a
                                href={res.payment_screenshot}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 11, color: '#1e3a8a', display: 'block', marginTop: 2 }}
                              >
                                View Proof
                              </a>
                            )}
                          </td>
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
                        <th>Resident</th>
                        <th>Document</th>
                        <th>Purpose</th>
                        <th>Contact</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th>Action</th>
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
                        <th>Purok</th>
                        <th>Waste Type</th>
                        <th>Day</th>
                        <th>Time</th>
                        <th>Notes</th>
                        <th>Action</th>
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
                              onClick={() => handleDeleteWaste(entry.id)}>
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
              <p>Registered resident accounts and ID verification.</p>
            </div>

            <div className="dashboard-card">
              {residentsList.length === 0 ? (
                <p className="dashboard-empty">No residents have registered yet.</p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Contact</th>
                        <th>Purok</th>
                        <th>Registry Match</th>
                        <th>Verification</th>
                        <th>ID</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {residentsList.map((resident) => {
                        const registryMatch = findRegistryMatch(resident)
                        return (
                        <tr key={resident.id}>
                          <td data-label="Name">{resident.full_name}</td>
                          <td data-label="Contact">{resident.contact_number || '—'}</td>
                          <td data-label="Purok">{resident.purok || '—'}</td>
                          <td data-label="Registry Match">
                            {registryMatch ? (
                              <span className="badge badge-approved" title={`Matches: ${registryMatch.full_name} (${registryMatch.purok || 'no purok'})`}>
                                ✓ Found
                              </span>
                            ) : (
                              <span className="badge badge-declined">No match</span>
                            )}
                          </td>
                          <td data-label="Verification">
                            <span className={`badge badge-${
                              resident.verification_status === 'verified' ? 'approved'
                                : resident.verification_status === 'rejected' ? 'declined'
                                  : 'pending'
                            }`}>
                              {resident.verification_status}
                            </span>
                            {resident.verification_status === 'rejected' && resident.verification_notes && (
                              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
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
                              <span className="role-restricted-note">Not uploaded</span>
                            )}
                          </td>
                          <td data-label="Action" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {resident.verification_status !== 'verified' && (
                              <button
                                className="btn-approve"
                                disabled={processingVerificationIds.has(resident.id)}
                                onClick={() => handleVerifyResident(resident)}
                              >
                                Verify
                              </button>
                            )}
                            {resident.verification_status !== 'rejected' && (
                              <button
                                className="btn-deny"
                                disabled={processingVerificationIds.has(resident.id)}
                                onClick={() => handleOpenReject(resident)}
                              >
                                Reject
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
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Purok</th>
                        <th>Household #</th>
                        <th>Contact</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registryEntries.map((entry) => (
                        <tr key={entry.id}>
                          <td data-label="Name">{entry.full_name}</td>
                          <td data-label="Purok">{entry.purok || '—'}</td>
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
                              onClick={() => handleDeleteRegistryEntry(entry.id)}>
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
                        <th>Photo</th>
                        <th>Order</th>
                        <th>Name</th>
                        <th>Position</th>
                        <th>Committee</th>
                        <th>Contact</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {officialsList.map((official) => (
                        <tr key={official.id}>
                          <td data-label="Photo">
                            <PersonAvatar
                              name={official.full_name}
                              photoUrl={official.photo_url}
                              fallbackIcon={<FaUser style={{ fontSize: 18, color: '#9ca3af' }} />}
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
                            <button
                              className="btn-deny"
                              onClick={() => handleDeleteOfficial(official.id)}>
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
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">{residentsList.length}</div>
                <div className="report-stat-label">Registered Residents</div>
              </div>
              <div className="dashboard-card report-stat">
                <div className="report-stat-number">
                  {residentsList.filter((r) => r.verification_status === 'pending').length}
                </div>
                <div className="report-stat-label">Pending Verifications</div>
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
                        <th>When</th>
                        <th>Who</th>
                        <th>Action</th>
                        <th>Type</th>
                        <th>Subject</th>
                        <th>Notes</th>
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
                      <FaUser style={{ fontSize: 24, color: '#9ca3af' }} />
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
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
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
                      border: 'none', cursor: 'pointer', color: '#94a3b8',
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
                      border: 'none', cursor: 'pointer', color: '#94a3b8',
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

      </div>

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
              <label className="modal-form-label">Purok</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Purok 3"
                value={newRegistryEntry.purok}
                onChange={(e) => setNewRegistryEntry({ ...newRegistryEntry, purok: e.target.value })}
              />
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

    </div>
  )
}

export default OfficialDashboard