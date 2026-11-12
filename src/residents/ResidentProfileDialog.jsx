import { useId, useRef, useState } from 'react'
import { FaMapMarkerAlt, FaUser, FaUserShield } from 'react-icons/fa'
import PortalDetailsDialog from '../components/PortalDetailsDialog'
import { residentName } from './directoryData'
import { describeVerification } from '../utils/residentGroups'
import { purokLabel } from './residentPresentation'
import { residentBirthDateLabel, residentMobileLabel } from './residentProfileDisplay'
import './ResidentProfileDialog.css'
import '../dashboards/OfficialPeople.css'
import CreditProfile from '../communityCredit/CreditProfile'

export function ResidentAvatar({ resident, profile }) {
  const [failed, setFailed] = useState(false)
  let photo = ''
  try { const url=new URL(profile?.photo_url); if(['https:','http:'].includes(url.protocol)) photo=url.href } catch {}
  const initials = [resident.first_name?.trim()[0],resident.last_name?.trim()[0]].filter(Boolean).join('').toUpperCase() || 'R'
  return <div className="resident-profile-avatar">{photo && !failed ? <img src={photo} alt={`${residentName(resident)} profile`} onError={()=>setFailed(true)}/> : <span aria-label={`${residentName(resident)} initials`}>{initials}</span>}</div>
}

export default function ResidentProfileDialog(props) {
  return <ResidentProfileContent key={props.resident.id} {...props} />
}

const PROFILE_TABS = [['information', 'Information'], ['history', 'History'], ['analytics', 'Analytics'], ['credit', 'Community Credit']]

function ResidentProfileContent({resident,profile: suppliedProfile,onClose,onEdit}) {
  const profile = resident.profile_id && suppliedProfile?.id === resident.profile_id ? suppliedProfile : null
  const [tab, setTab] = useState('information')
  const base = useId()
  const tabRefs = useRef({})
  const onTabKey = event => {
    const index = PROFILE_TABS.findIndex(([id]) => id === tab)
    const next = { ArrowRight: (index + 1) % 4, ArrowLeft: (index + 3) % 4, Home: 0, End: 3 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    const id = PROFILE_TABS[next][0]
    setTab(id)
    tabRefs.current[id]?.focus()
  }
  const fieldLabel = (key, format) => key in resident ? format(resident[key]) : 'Not shown to your account'
  const linked = resident.account_linked || resident.profile_id ? 'Linked' : 'Not linked'
  const active = resident.resident_status === 'active'
  return <div className="resident-profile-dialog resident-profile-refined"><PortalDetailsDialog title="Resident Profile" onClose={onClose}>
    <div className="resident-profile-heading">
      <ResidentAvatar resident={resident} profile={profile}/>
      <div className="resident-profile-summary">
        <h3 className="resident-profile-name">{residentName(resident)}</h3>
        <div className="resident-profile-status"><span className={`badge ${active?'badge-approved':'badge-pending'}`}>{active?'Active':resident.resident_status === 'inactive'?'Inactive':'Status unavailable'}</span></div>
        <p className="resident-profile-purok"><FaMapMarkerAlt aria-hidden="true"/><span>{purokLabel(resident.purok) || 'Purok not recorded'}</span></p>
      </div>
      {onEdit&&<button type="button" className="confirm-dialog-confirm" onClick={onEdit}>Edit Resident</button>}
    </div>
    <div className="rp-tabs" role="tablist" aria-label="Resident profile sections" onKeyDown={onTabKey}>
      {PROFILE_TABS.map(([id, label]) => <button key={id} ref={element => { tabRefs.current[id] = element }} type="button" role="tab" id={`${base}-tab-${id}`} aria-controls={`${base}-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${base}-panel-information`} aria-labelledby={`${base}-tab-information`} hidden={tab !== 'information'} tabIndex={0}>
    <div className="resident-profile-sections">
      <section className="resident-profile-section" aria-label="Personal Information">
        <h3><FaUser aria-hidden="true"/>Personal Information</h3>
        <dl><div><dt>Birth date</dt><dd>{fieldLabel('birth_date', residentBirthDateLabel)}</dd></div><div><dt>Mobile number</dt><dd>{fieldLabel('mobile_number', residentMobileLabel)}</dd></div></dl>
      </section>
      <section className="resident-profile-section" aria-label="Account Information">
        <h3><FaUserShield aria-hidden="true"/>Account Information</h3>
        <dl><div><dt>Online account</dt><dd>{linked}</dd></div><div><dt>Account verification</dt><dd><span className="resident-profile-verification">{profile ? describeVerification(profile.verification_status).label : 'Not available'}</span></dd></div></dl>
      </section>
    </div>
    </div>
    <div role="tabpanel" id={`${base}-panel-history`} aria-labelledby={`${base}-tab-history`} hidden={tab !== 'history'} tabIndex={0}>
      <section className="rp-unavailable"><h3>Linked resident history unavailable</h3><p>Authorized resident-linked history access has not been verified for this application version. No history records have been requested.</p><p>Matching names are not treated as verified identity links. Use existing authorized service workspaces to review records.</p></section>
    </div>
    <div role="tabpanel" id={`${base}-panel-analytics`} aria-labelledby={`${base}-tab-analytics`} hidden={tab !== 'analytics'} tabIndex={0}>
      <section className="rp-unavailable"><h3>Resident analytics unavailable</h3><p>Complete, authorized resident-linked data is not verified. No incident or complaint totals are calculated here; unavailable data does not mean zero records.</p><p>Recorded involvement alone does not establish wrongdoing or automatically affect Community Credit.</p></section>
    </div>
    <div role="tabpanel" id={`${base}-panel-credit`} aria-labelledby={`${base}-tab-credit`} hidden={tab !== 'credit'} tabIndex={0}>
      <CreditProfile residentId={resident.id} />
    </div>
  </PortalDetailsDialog></div>
}
