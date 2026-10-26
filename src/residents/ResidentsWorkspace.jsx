import { useId, useState } from 'react'
import ResidentDirectory from './ResidentDirectory'
import './ResidentDirectory.css'
export default function ResidentsWorkspace({ canManageDirectory, accounts, profiles = [], onEligibilityChange }) {
  const [active, setActive] = useState('directory')
  const id = useId()
  return <div className="residents-workspace">
    <div className="residents-view-switch" role="group" aria-label="Residents views">
      {[['directory','Barangay Residents'],['accounts','Account Verification']].map(([key,label]) =>
        <button key={key} type="button" aria-pressed={active === key} aria-controls={`${id}-${key}`} onClick={() => setActive(key)}>{label}</button>)}
    </div>
    <div id={`${id}-directory`} hidden={active !== 'directory'}><ResidentDirectory canManage={canManageDirectory} profiles={profiles} onEligibilityChange={onEligibilityChange} /></div>
    <section id={`${id}-accounts`} hidden={active !== 'accounts'} aria-label="Account Verification"><h2>Account Verification</h2><p className="dashboard-card-note">Review online-account residency requests and not-resident account history.</p>{accounts}</section>
  </div>
}
