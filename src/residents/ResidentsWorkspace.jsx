import { useId, useState } from 'react'
import ResidentDirectory from './ResidentDirectory'
import './ResidentDirectory.css'
import '../dashboards/OfficialPeople.css'
export default function ResidentsWorkspace({ canManageDirectory, accounts, profiles = [], onEligibilityChange, onAccountGroupChange }) {
  const [active, setActive] = useState('directory')
  const id = useId()
  return <div className="residents-workspace">
    <div className="residents-view-switch" role="group" aria-label="Residents views">
      {[['directory','Batinguel Residents'],['non-residents','Non-Residents'],['requests','Requests']].map(([key,label]) =>
        <button key={key} type="button" aria-pressed={active === key} aria-controls={`${id}-${key === 'directory' ? 'directory' : 'accounts'}`} onClick={() => { setActive(key); if (key !== 'directory') onAccountGroupChange?.(key === 'non-residents' ? 'notResidents' : 'requests') }}>{label}</button>)}
    </div>
    <details className="resident-scope-note"><summary>Directory records and account verification</summary><p className="resident-reference-note">Batinguel Residents defaults to active directory records. Inactive directory history is available through the status filter; inactivity alone does not establish non-residency. Non-Residents lists accounts explicitly marked Not a Resident. Requests concerns account verification, not every unlinked directory record.</p></details>
    <div id={`${id}-directory`} hidden={active !== 'directory'}><ResidentDirectory canManage={canManageDirectory} profiles={profiles} onEligibilityChange={onEligibilityChange} initialStatus="active" /></div>
    <section id={`${id}-accounts`} hidden={active === 'directory'} aria-label={active === 'non-residents' ? 'Non-Residents' : 'Requests'}><h2>{active === 'non-residents' ? 'Non-Residents' : 'Requests'}</h2><p className="dashboard-card-note">{active === 'non-residents' ? 'Online accounts explicitly classified as not residents; this is not a complete list of every non-resident person.' : 'Pending account reviews, returned requests and unrecognized verification states. Directory linkage alone never creates a request.'}</p>{accounts}</section>
  </div>
}
