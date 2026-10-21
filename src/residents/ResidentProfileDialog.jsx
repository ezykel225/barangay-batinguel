import { useState } from 'react'
import { FaMapMarkerAlt, FaUser, FaUserShield } from 'react-icons/fa'
import PortalDetailsDialog from '../components/PortalDetailsDialog'
import { residentName } from './directoryData'
import { describeVerification } from '../utils/residentGroups'
import { purokLabel } from './residentPresentation'
import { residentBirthDateLabel, residentMobileLabel } from './residentProfileDisplay'
import './ResidentProfileDialog.css'

export function ResidentAvatar({ resident, profile }) {
  const [failed, setFailed] = useState(false)
  let photo = ''
  try { const url=new URL(profile?.photo_url); if(['https:','http:'].includes(url.protocol)) photo=url.href } catch {}
  const initials = [resident.first_name?.trim()[0],resident.last_name?.trim()[0]].filter(Boolean).join('').toUpperCase() || 'R'
  return <div className="resident-profile-avatar">{photo && !failed ? <img src={photo} alt={`${residentName(resident)} profile`} onError={()=>setFailed(true)}/> : <span aria-label={`${residentName(resident)} initials`}>{initials}</span>}</div>
}

export default function ResidentProfileDialog({resident,profile,onClose,onEdit}) {
  const linked = resident.profile_id ? 'Linked' : 'Not linked'
  const active = resident.resident_status === 'active'
  return <div className="resident-profile-dialog"><PortalDetailsDialog title="Resident Profile" onClose={onClose}>
    <div className="resident-profile-heading">
      <ResidentAvatar resident={resident} profile={profile}/>
      <div className="resident-profile-summary">
        <h3 className="resident-profile-name">{residentName(resident)}</h3>
        <div className="resident-profile-status"><span className={`badge ${active?'badge-approved':'badge-pending'}`}>{active?'Active':'Inactive'}</span></div>
        <p className="resident-profile-purok"><FaMapMarkerAlt aria-hidden="true"/><span>{purokLabel(resident.purok) || 'Purok not recorded'}</span></p>
      </div>
      <button type="button" className="confirm-dialog-confirm" onClick={onEdit}>Edit Resident</button>
    </div>
    <div className="resident-profile-sections">
      <section className="resident-profile-section" aria-label="Personal Information">
        <h3><FaUser aria-hidden="true"/>Personal Information</h3>
        <dl><div><dt>Birth date</dt><dd>{residentBirthDateLabel(resident.birth_date)}</dd></div><div><dt>Mobile number</dt><dd>{residentMobileLabel(resident.mobile_number)}</dd></div></dl>
      </section>
      <section className="resident-profile-section" aria-label="Account Information">
        <h3><FaUserShield aria-hidden="true"/>Account Information</h3>
        <dl><div><dt>Online account</dt><dd>{linked}</dd></div><div><dt>Account verification</dt><dd><span className="resident-profile-verification">{profile ? describeVerification(profile.verification_status).label : 'Not available'}</span></dd></div></dl>
      </section>
    </div>
  </PortalDetailsDialog></div>
}
