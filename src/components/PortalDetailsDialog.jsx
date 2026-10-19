import { useId, useRef } from 'react'
import { FaTimes } from 'react-icons/fa'
import { DialogShell } from './OfficialArchiveDialog'
import './PortalDetailsDialog.css'

export default function PortalDetailsDialog({ title, reference, status, statusClassName = '', children, onClose }) {
  const titleId = useId()
  const closeRef = useRef(null)
  return <div className="portal-details-dialog"><DialogShell open titleId={titleId} title={title} onCancel={onClose} initialFocusRef={closeRef}
    header={<header className="portal-details-header"><h2 id={titleId}>{title}</h2>
      <button type="button" className="btn-cancel" ref={closeRef} aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}><FaTimes aria-hidden="true" /></button>
      <div className="portal-details-identity">{reference && <strong>{reference}</strong>}{status && <span className={`badge ${statusClassName}`}>{status}</span>}</div>
    </header>}><div className="portal-details-body">{children}</div></DialogShell></div>
}
