import { useCallback, useState, useEffect } from 'react'
import {
  FaFileAlt,
  FaEye,
  FaEyeSlash,
  FaLock,
  FaPlus,
  FaUser,
} from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import '../components/Sidebar.css'
import './ResidentDashboard.css'

const DOCUMENT_TYPES = [
  'Barangay Clearance',
  'Barangay Certificate',
  'Certificate of Indigency',
  'Certificate of Residency',
  'Business Clearance',
  'Other',
]

const STATUS_LABELS = {
  pending: { label: 'Pending Review', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  ready_for_pickup: { label: 'Ready for Pickup', className: 'badge-ready' },
  claimed: { label: 'Claimed', className: 'badge-claimed' },
}

const RESERVATION_STATUS_LABELS = {
  pending: { label: 'Pending', className: 'badge-pending' },
  approved: { label: 'Approved', className: 'badge-approved' },
  declined: { label: 'Declined', className: 'badge-declined' },
  cancelled: { label: 'Cancelled', className: 'badge-claimed' },
}

// Today's date in Manila as YYYY-MM-DD. 'en-CA' formats that way, and
// ISO date strings compare correctly with <, so no Date maths needed.
//
// Manila specifically, not the browser's timezone: the database rule
// uses Asia/Manila, and if a resident's laptop is set to another zone
// the button and the database would disagree about what "today" is.
const todayInManila = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())

// Mirrors the protect_reservation_status trigger: a resident may
// release a booking that is still pending or already approved, as long
// as its date hasn't passed. The database enforces this for real -- this
// only decides whether to show a button that would work.
const canCancel = (r) =>
  (r.status === 'pending' || r.status === 'approved') &&
  r.preferred_date >= todayInManila()

const ResidentDashboard = () => {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [userProfile, setUserProfile] = useState(null)
  const [requests, setRequests] = useState([])
  const [myReservations, setMyReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState(null)
  const [showRequestModal, setShowRequestModal] = useState(false)

  const [newRequest, setNewRequest] = useState({
    document_type: DOCUMENT_TYPES[0],
    purpose: '',
    additional_notes: '',
  })

  // ── Settings: Change Password ──────────────────────────
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  // ──────────────────────────────────────────────────────

  const fetchUserProfile = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, contact_number, purok, photo_url, verification_status, verification_notes, id_document_url')
      .eq('id', user.id)
      .single()
    if (data) setUserProfile(data)
  }, [user])

  const fetchMyRequests = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('document_requests')
      .select('*')
      .eq('resident_id', user.id)
      .order('created_at', { ascending: false })

    if (!error) setRequests(data || [])
    setLoading(false)
  }, [user])

  const fetchMyReservations = useCallback(async () => {
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('resident_id', user.id)
      .order('preferred_date', { ascending: false })

    if (!error) setMyReservations(data || [])
  }, [user])

  useEffect(() => {
    if (user?.id) {
      fetchUserProfile()
      fetchMyRequests()
      fetchMyReservations()
    }
  }, [user, fetchUserProfile, fetchMyRequests, fetchMyReservations])

  // An item counts as "unseen" once an official has acted on it
  // (moved it past pending) and the resident hasn't opened that tab
  // since. A null updated_at means no tracked change (old data from
  // before this feature) — never flagged as unseen.
  const isUnseen = (item) =>
    item.status !== 'pending' &&
    !!item.updated_at &&
    (!item.resident_viewed_at || new Date(item.resident_viewed_at) < new Date(item.updated_at))

  const daysSince = (dateStr) => {
    if (!dateStr) return null
    const diffMs = Date.now() - new Date(dateStr).getTime()
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
  }

  const unseenRequestCount = requests.filter(isUnseen).length
  const unseenReservationCount = myReservations.filter(isUnseen).length

  const markRequestsViewed = async () => {
    const unseenIds = requests.filter(isUnseen).map((r) => r.id)
    if (unseenIds.length === 0) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('document_requests')
      .update({ resident_viewed_at: nowIso })
      .in('id', unseenIds)
    if (!error) {
      setRequests((prev) => prev.map((r) =>
        unseenIds.includes(r.id) ? { ...r, resident_viewed_at: nowIso } : r
      ))
    }
  }

  const markReservationsViewed = async () => {
    const unseenIds = myReservations.filter(isUnseen).map((r) => r.id)
    if (unseenIds.length === 0) return
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('reservations')
      .update({ resident_viewed_at: nowIso })
      .in('id', unseenIds)
    if (!error) {
      setMyReservations((prev) => prev.map((r) =>
        unseenIds.includes(r.id) ? { ...r, resident_viewed_at: nowIso } : r
      ))
    }
  }

  useEffect(() => {
    if (activeTab === 'documents') markRequestsViewed()
    if (activeTab === 'reservations') markReservationsViewed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    if (submitting) return

    setSubmitting(true)
    try {
      const fileExt = file.name.split('.').pop()
      // Path is prefixed with the resident's own user id — the storage
      // RLS policy requires this exact structure to allow the upload.
      const filePath = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('resident-photos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        console.error('Photo upload error:', uploadError)
        toast.error(uploadError.message || 'Failed to upload photo!')
        return
      }

      const { data: urlData } = supabase.storage
        .from('resident-photos')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: urlData.publicUrl })
        .eq('id', user.id)

      if (updateError) {
        console.error('Photo save error:', updateError)
        toast.error('Photo uploaded but could not be saved to your profile.')
        return
      }

      setUserProfile((prev) => ({ ...prev, photo_url: urlData.publicUrl }))
      toast.success('Profile photo updated!')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelReservation = async (reservation) => {
    if (cancellingId) return

    // Releasing an approved booking loses a slot the resident waited
    // for, so a misclick shouldn't do it silently.
    const ok = window.confirm(
      `Cancel your booking for ${reservation.preferred_date} at ${reservation.preferred_time}?\n\n` +
      'The slot will be released for someone else. Booking again means waiting for approval again.'
    )
    if (!ok) return

    setCancellingId(reservation.id)
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', reservation.id)

      if (error) {
        console.error('Cancel reservation error:', error)
        toast.error(error.message || 'Failed to cancel reservation.')
        return
      }

      // Append to the audit trail so officials can see who cancelled
      // what and when — a cancellation frees up a slot, so it's worth
      // recording alongside official actions.
      await supabase.from('activity_log').insert([{
        actor_id: user.id,
        actor_name: userProfile?.full_name || 'Resident',
        action: 'cancelled',
        entity_type: 'reservation',
        entity_id: reservation.id,
        subject: `${reservation.preferred_date} ${reservation.preferred_time}`,
        details: reservation.purpose || null,
      }])

      toast.success('Reservation cancelled. The time slot is now open again.')
      fetchMyReservations()
    } finally {
      setCancellingId(null)
    }
  }

  const handleIdUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !user?.id) return
    if (submitting) return

    setSubmitting(true)
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${user.id}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('id-verification')
        .upload(filePath, file)

      if (uploadError) {
        console.error('ID upload error:', uploadError)
        toast.error(uploadError.message || 'Failed to upload ID!')
        return
      }

      // Re-submitting an ID resets a previous rejection back to
      // pending so it re-enters the official's review queue, rather
      // than staying stuck showing the old rejection reason.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          id_document_url: filePath,
          verification_status: 'pending',
          verification_notes: null,
        })
        .eq('id', user.id)

      if (updateError) {
        console.error('ID save error:', updateError)
        toast.error('ID uploaded but could not be saved to your profile.')
        return
      }

      setUserProfile((prev) => ({
        ...prev,
        id_document_url: filePath,
        verification_status: 'pending',
        verification_notes: null,
      }))
      toast.success('ID uploaded! An official will review it soon.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitRequest = async () => {
    if (submitting) return
    if (userProfile?.verification_status !== 'verified') {
      toast.error('Your account needs to be verified by an official before you can request documents.')
      return
    }
    if (!newRequest.document_type || !newRequest.purpose) {
      toast.error('Please select a document type and enter a purpose.')
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('document_requests').insert([{
        resident_id: user.id,
        document_type: newRequest.document_type,
        full_name: userProfile?.full_name || '',
        contact_number: userProfile?.contact_number || null,
        purok: userProfile?.purok || null,
        purpose: newRequest.purpose,
        additional_notes: newRequest.additional_notes || null,
        status: 'pending',
      }])

      if (error) {
        console.error('Document request insert error:', error)
        toast.error(error.message || 'Failed to submit your request.')
      } else {
        toast.success('Document request submitted!')
        setShowRequestModal(false)
        setNewRequest({ document_type: DOCUMENT_TYPES[0], purpose: '', additional_notes: '' })
        fetchMyRequests()
      }
    } finally {
      setSubmitting(false)
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

  const pendingCount = requests.filter((r) => r.status === 'pending').length
  const readyCount = requests.filter((r) => r.status === 'ready_for_pickup').length
  const isVerified = userProfile?.verification_status === 'verified'
  const isRejected = userProfile?.verification_status === 'rejected'

  const VerificationBanner = () => {
    if (isVerified || !userProfile) return null
    return (
      <div className={`verification-banner ${isRejected ? 'verification-banner-rejected' : ''}`}>
        {isRejected ? (
          <>
            <strong>Your ID verification was declined.</strong>{' '}
            {userProfile.verification_notes || 'Please visit the Barangay Hall for assistance.'}
          </>
        ) : (
          <>
            <strong>Your account is pending verification.</strong>{' '}
            {userProfile.id_document_url
              ? 'An official needs to review your submitted ID before you can request documents. This usually happens within a few business days.'
              : "You didn't upload an ID, so please visit the Barangay Hall so an official can verify you in person before you can request documents."}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="dashboard-layout">
      <Sidebar
        role="resident"
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        badges={{ documents: unseenRequestCount, reservations: unseenReservationCount }}
      />

      <div className="dashboard-main">
        {activeTab === 'dashboard' && (
          <div>
            <div className="resident-dashboard-header">
              <h1>Welcome, {userProfile?.full_name || 'Resident'}</h1>
              <p>Request barangay documents and check waste collection schedules.</p>
            </div>

            <VerificationBanner />

            <div className="resident-stats-grid">
              <div className="dashboard-card resident-stat-card">
                <FaFileAlt className="resident-stat-icon" />
                <div>
                  <div className="resident-stat-number">{pendingCount}</div>
                  <div className="resident-stat-label">Pending Requests</div>
                </div>
              </div>
              <div className="dashboard-card resident-stat-card">
                <FaFileAlt className="resident-stat-icon" style={{ color: '#16a34a' }} />
                <div>
                  <div className="resident-stat-number">{readyCount}</div>
                  <div className="resident-stat-label">Ready for Pickup</div>
                </div>
              </div>
              <div className="dashboard-card resident-stat-card">
                <FaFileAlt className="resident-stat-icon" style={{ color: '#6b7280' }} />
                <div>
                  <div className="resident-stat-number">{requests.length}</div>
                  <div className="resident-stat-label">Total Requests</div>
                </div>
              </div>
            </div>

            <div className="dashboard-card" style={{ marginTop: 20 }}>
              <div className="dashboard-card-header">
                <h3>Recent Document Requests</h3>
                <button
                  className="btn-add"
                  onClick={() => setShowRequestModal(true)}
                  disabled={!isVerified}
                  title={!isVerified ? 'Your account must be verified first' : undefined}
                >
                  <FaPlus /> New Request
                </button>
              </div>
              {loading ? (
                <p>Loading...</p>
              ) : requests.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>
                  You haven't requested any documents yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.slice(0, 5).map((r) => (
                        <tr key={r.id}>
                          <td data-label="Document">{r.document_type}</td>
                          <td data-label="Purpose">{r.purpose}</td>
                          <td data-label="Status">
                            <span className={`badge ${STATUS_LABELS[r.status]?.className || ''}`}>
                              {STATUS_LABELS[r.status]?.label || r.status}
                            </span>
                            {r.status === 'ready_for_pickup' && (
                              <div className={`pickup-reminder ${daysSince(r.updated_at) >= 7 ? 'pickup-reminder-urgent' : ''}`}>
                                Ready for {daysSince(r.updated_at)} day{daysSince(r.updated_at) === 1 ? '' : 's'}
                              </div>
                            )}
                          </td>
                          <td data-label="Submitted">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
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

        {activeTab === 'documents' && (
          <div>
            <div className="resident-dashboard-header">
              <h1>Document Requests</h1>
              <p>Request barangay clearance, certificates, and more.</p>
            </div>

            <VerificationBanner />

            <div className="dashboard-card">
              <div className="dashboard-card-header">
                <h3>My Requests</h3>
                <button
                  className="btn-add"
                  onClick={() => setShowRequestModal(true)}
                  disabled={!isVerified}
                  title={!isVerified ? 'Your account must be verified first' : undefined}
                >
                  <FaPlus /> New Request
                </button>
              </div>
              {loading ? (
                <p>Loading...</p>
              ) : requests.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>
                  You haven't requested any documents yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Notes from Official</th>
                        <th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id}>
                          <td data-label="Document">{r.document_type}</td>
                          <td data-label="Purpose">{r.purpose}</td>
                          <td data-label="Status">
                            <span className={`badge ${STATUS_LABELS[r.status]?.className || ''}`}>
                              {STATUS_LABELS[r.status]?.label || r.status}
                            </span>
                            {r.status === 'ready_for_pickup' && (
                              <div className={`pickup-reminder ${daysSince(r.updated_at) >= 7 ? 'pickup-reminder-urgent' : ''}`}>
                                Ready for {daysSince(r.updated_at)} day{daysSince(r.updated_at) === 1 ? '' : 's'} — please claim soon
                              </div>
                            )}
                          </td>
                          <td data-label="Notes from Official">{r.reviewer_notes || '—'}</td>
                          <td data-label="Submitted">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
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

        {activeTab === 'reservations' && (
          <div>
            <div className="resident-dashboard-header">
              <h1>My Reservations</h1>
              <p>Covered court bookings you've made while logged in.</p>
            </div>

            <div className="dashboard-card">
              {myReservations.length === 0 ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>
                  You haven't made any court reservations while logged in yet.
                </p>
              ) : (
                <div className="table-wrapper">
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Purpose</th>
                        <th>Status</th>
                        <th>Donation</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myReservations.map((r) => (
                        <tr key={r.id}>
                          <td data-label="Date">
                            {r.preferred_date ? new Date(r.preferred_date).toLocaleDateString() : '—'}
                          </td>
                          <td data-label="Time">
                            {r.preferred_time}{r.end_time ? ` – ${r.end_time}` : ''}
                          </td>
                          <td data-label="Purpose">{r.purpose}</td>
                          <td data-label="Status">
                            <span className={`badge ${RESERVATION_STATUS_LABELS[r.status]?.className || ''}`}>
                              {RESERVATION_STATUS_LABELS[r.status]?.label || r.status}
                            </span>
                          </td>
                          <td data-label="Donation">
                            {r.payment_status && r.payment_status !== 'unpaid' ? 'Yes, thank you!' : 'None'}
                          </td>
                          <td data-label="Action">
                            {canCancel(r) ? (
                              <button
                                className="btn-deny"
                                disabled={cancellingId === r.id}
                                onClick={() => handleCancelReservation(r)}
                              >
                                {cancellingId === r.id ? 'Cancelling...' : 'Cancel'}
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
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

        {activeTab === 'settings' && (
          <div>
            <div className="resident-dashboard-header">
              <h1>Settings</h1>
              <p>Manage your account preferences.</p>
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480, marginBottom: 20 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaUser style={{ color: '#15803d' }} /> Profile Photo
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                {userProfile?.photo_url ? (
                  <img
                    src={userProfile.photo_url}
                    alt={userProfile?.full_name}
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', background: '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FaUser style={{ fontSize: 24, color: '#9ca3af' }} />
                  </div>
                )}
                <div>
                  <label
                    htmlFor="resident-avatar-upload"
                    className="btn-add"
                    style={{ cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Uploading...' : userProfile?.photo_url ? 'Change Photo' : 'Add Photo'}
                  </label>
                  <input
                    id="resident-avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={submitting}
                    style={{ display: 'none' }}
                  />
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                    JPG or PNG.
                  </p>
                </div>
              </div>
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480, marginBottom: 20 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaFileAlt style={{ color: '#15803d' }} /> ID Verification
                </h3>
              </div>
              {userProfile?.verification_status === 'verified' ? (
                <p style={{ fontSize: 13, color: '#16a34a' }}>
                  ✓ Your account is verified.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
                    {userProfile?.id_document_url
                      ? 'Your ID is under review. You can upload a different one below if needed.'
                      : "You haven't uploaded an ID yet — this speeds up verification, but you can also just visit the Barangay Hall in person."}
                  </p>
                  <label
                    htmlFor="resident-id-upload"
                    className="btn-add"
                    style={{ cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
                  >
                    {submitting ? 'Uploading...' : userProfile?.id_document_url ? 'Upload a Different ID' : 'Upload ID'}
                  </label>
                  <input
                    id="resident-id-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleIdUpload}
                    disabled={submitting}
                    style={{ display: 'none' }}
                  />
                </>
              )}
            </div>

            <div className="dashboard-card" style={{ maxWidth: 480 }}>
              <div className="dashboard-card-header">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FaLock style={{ color: '#15803d' }} /> Change Password
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

      {/* New Document Request Modal */}
      {showRequestModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Request a Document</h3>

            <div className="modal-form-group">
              <label className="modal-form-label">Document Type</label>
              <select
                className="modal-form-input"
                value={newRequest.document_type}
                onChange={(e) => setNewRequest({ ...newRequest, document_type: e.target.value })}
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Purpose</label>
              <input
                type="text"
                className="modal-form-input"
                placeholder="e.g. Employment requirement"
                value={newRequest.purpose}
                onChange={(e) => setNewRequest({ ...newRequest, purpose: e.target.value })}
              />
            </div>

            <div className="modal-form-group">
              <label className="modal-form-label">Additional Notes (optional)</label>
              <textarea
                className="modal-form-textarea"
                placeholder="Anything else the official should know"
                value={newRequest.additional_notes}
                onChange={(e) => setNewRequest({ ...newRequest, additional_notes: e.target.value })}
              />
            </div>

            <div className="modal-buttons">
              <button className="btn-cancel" onClick={() => setShowRequestModal(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleSubmitRequest} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResidentDashboard