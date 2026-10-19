import { FaRegFileAlt, FaClipboardList } from 'react-icons/fa'
import { preparationFor } from './documentPreparationConfig'
import './DocumentRequests.css'

export default function DocumentRequirements({ documentType, audience = 'resident' }) {
  const official = audience === 'official'
  const heading = official ? 'Requirements to Check' : 'What to prepare'
  return <section className="dr-requirements" aria-label={heading + ' for ' + documentType}>
    <h4>{official && <FaClipboardList aria-hidden="true" />} {heading}</h4>
    {!official && <p className="dr-muted">Prepare these documents and present them at the Barangay Hall when requested or when claiming the document.</p>}
    <ul>{preparationFor(documentType).map((text) => <li key={text}>{official && <FaRegFileAlt aria-hidden="true" />}{text}</li>)}</ul>
    {official ? <p className="dr-muted dr-requirement-note">Sample preparation guidance only. Confirm applicable requirements with Barangay Hall. Supporting documents are checked manually during processing, not verified online.</p>
      : <p className="dr-muted">Sample preparation list. Official requirements are not yet confirmed; check applicable requirements with Barangay Hall.</p>}
  </section>
}
