import { useRef, useState } from 'react'
import { FaPlus, FaTrash, FaPaperclip, FaExclamationTriangle, FaTimes } from 'react-icons/fa'
import {
  COMPLAINT_CATEGORIES,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_LABEL,
  EVIDENCE_TYPES_LABEL,
  evidenceProblem,
  formatBytes,
  mediaKindFor,
  COMPLAINT_ERRORS,
} from './complaintLabels'
import { fileComplaintWithEvidence } from './complaintApi'
import { DialogShell } from '../components/OfficialArchiveDialog'
import './Complaints.css'

// Filing a complaint online, as an authenticated resident.
//
// ─── ⚠️ THE FORM ASKS FOR NOTHING THE SERVER OWNS ─────────────────────
//
// No status, no reference, no `filed_by_profile_id`, no `encoded_by`,
// no timestamp and no history actor -- none of them is a parameter of
// `file_complaint_as_resident()`, so there is nothing for this form to
// offer and nothing to forge. The resident's identity comes from
// `auth.uid()` inside the function.
//
// ─── NEUTRAL COPY, THROUGHOUT ─────────────────────────────────────────
//
// ⚠️ Nothing here promises mediation, a hearing, a settlement, arrest,
// a response time, or that the matter is within Katarungang
// Pambarangay jurisdiction. P3-A records a complaint as `received` and
// builds no screening at all -- deciding jurisdiction is a human
// judgment a later phase records, and the system must not appear to
// have made it. The word "case" is avoided for the same reason: a
// complaint is not a case.

const blankRespondent = () => ({
  key: `r${Math.random().toString(36).slice(2, 9)}`,
  fullName: '',
  contactNumber: '',
  addressNote: '',
})

const FileComplaintForm = ({ onFiled, onCancel, dialog = false }) => {
  const [category, setCategory] = useState('')
  const [narrative, setNarrative] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [respondents, setRespondents] = useState([blankRespondent()])
  const [files, setFiles] = useState([])
  const [fileProblem, setFileProblem] = useState('')
  const [problem, setProblem] = useState('')
  // ⚠️ The duplicate-submission guard. A second click while the first
  // request is in flight would file a second complaint with its own
  // reference, and nothing downstream could tell them apart -- the
  // resident would simply have two. Checked at the top of the handler
  // as well as disabling the button, because a keyboard Enter can beat
  // a re-render.
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)
  const closeRef = useRef(null)

  const addRespondent = () => setRespondents((list) => [...list, blankRespondent()])

  const removeRespondent = (key) => setRespondents(
    (list) => (list.length === 1 ? list : list.filter((r) => r.key !== key))
  )

  const updateRespondent = (key, field, value) => setRespondents(
    (list) => list.map((r) => (r.key === key ? { ...r, [field]: value } : r))
  )

  const addFiles = (chosen) => {
    setFileProblem('')
    const incoming = Array.from(chosen || [])
    const accepted = []
    for (const file of incoming) {
      if (files.length + accepted.length >= EVIDENCE_MAX_FILES) {
        setFileProblem(`You can attach up to ${EVIDENCE_MAX_FILES} files.`)
        break
      }
      const bad = evidenceProblem(file)
      if (bad) {
        setFileProblem(bad)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length) setFiles((list) => [...list, ...accepted])
    // Let the same file be chosen again after a removal.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index) => setFiles((list) => list.filter((_, i) => i !== index))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    if (!category) {
      setProblem('Please choose what the complaint is about.')
      return
    }
    if (narrative.trim() === '') {
      setProblem('Please describe what happened.')
      return
    }
    setProblem('')

    try {
      setSubmitting(true)
      const result = await fileComplaintWithEvidence(
        {
          category,
          narrative: narrative.trim(),
          locationNote: locationNote.trim(),
          respondents,
        },
        files
      )
      onFiled(result)
    } catch (err) {
      // ⚠️ The sentence comes from the label map, never from the error.
      // A Supabase message, an SQLSTATE, a policy name or an RPC name
      // must not reach a screen; the real error is already in the
      // console in this project's shape.
      setProblem(COMPLAINT_ERRORS[err?.kind] || COMPLAINT_ERRORS.submitFailed)
      setSubmitting(false)
    }
  }

  const form = (
    <form className="complaint-form" onSubmit={handleSubmit} noValidate>
      <div className="complaint-form-body">
      {/* ⚠️ NOT AN EMERGENCY SERVICE, said before the form rather than
          after it. There is deliberately NO phone number here: the only
          numbers this repository holds are the Barangay Hall's own
          office landline and mobile, which keep office hours with a
          lunch closure -- presenting those as emergency response would
          be untrue, and inventing a police or hotline number would be
          worse. */}
      <div className="complaint-emergency" role="note">
        <FaExclamationTriangle aria-hidden="true" />
        <div>
          <strong>This form is not an emergency service.</strong>
          <p>
            Nobody is alerted immediately when you submit it, and it is read
            during barangay office hours. If someone is in danger or a crime is
            happening now, contact your local emergency or police service
            directly instead of using this form.
          </p>
        </div>
      </div>

      <div className="modal-form-group">
        <label htmlFor="complaint-category" className="modal-form-label">
          What is this complaint about? <span aria-hidden="true">*</span>
        </label>
        <select
          id="complaint-category"
          className="modal-form-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          required
          aria-required="true"
        >
          <option value="">Choose one</option>
          {/* ⚠️ The label is read from the shared map; the VALUE is the
              stored one the CHECK accepts. No raw underscore value
              reaches the screen. */}
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="modal-form-group">
        <label htmlFor="complaint-narrative" className="modal-form-label">
          What happened? <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="complaint-narrative"
          className="modal-form-input"
          rows={6}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          required
          aria-required="true"
          aria-describedby="complaint-narrative-note"
          placeholder="Describe what happened, when, and who was involved."
        />
        <p className="field-note" id="complaint-narrative-note">
          Write it in your own words. Barangay officials read this; it is not
          shown to other residents.
        </p>
      </div>

      <div className="modal-form-group">
        <label htmlFor="complaint-location" className="modal-form-label">
          Where did it happen? (optional)
        </label>
        <input
          id="complaint-location"
          type="text"
          className="modal-form-input"
          value={locationNote}
          onChange={(e) => setLocationNote(e.target.value)}
          aria-describedby="complaint-location-note"
          placeholder="e.g. near the covered court"
        />
        {/* ⚠️ FREE TEXT, AND NOT A PUROK DROPDOWN. P2 established that
            the official purok list is unconfirmed -- no entry in the
            current constant has a documentary source -- so there is
            nothing canonical to choose from, and the backend column is
            `location_note`, deliberately not named `purok`. */}
        <p className="field-note" id="complaint-location-note">
          A landmark or a street is enough. Write it however you would say it.
        </p>
      </div>

      <fieldset className="complaint-fieldset">
        <legend>Who is the complaint about? (optional)</legend>
        <p className="field-note">
          {/* ⚠️ Optional, and said so. A noise complaint may not know who
              is responsible, and requiring a name would push people to
              invent one. The backend accepts zero respondents. */}
          If you do not know who is responsible, leave this blank. The person
          does not need an account on this website.
        </p>

        {respondents.map((r, index) => (
          <div className="complaint-respondent" key={r.key}>
            <div className="complaint-respondent-head">
              <h3>Person {index + 1}</h3>
              {respondents.length > 1 && (
                <button
                  type="button"
                  className="btn-deny btn-sm"
                  onClick={() => removeRespondent(r.key)}
                  /* ⚠️ Named with the person it removes, not just
                     "Remove" -- eleven identical buttons announced the
                     same way is the defect `ActionMenu`'s `subject`
                     prop exists to fix. */
                  aria-label={`Remove person ${index + 1}`}
                >
                  <FaTrash aria-hidden="true" /> Remove
                </button>
              )}
            </div>

            <div className="modal-form-group">
              <label htmlFor={`respondent-name-${r.key}`} className="modal-form-label">
                Name
              </label>
              <input
                id={`respondent-name-${r.key}`}
                type="text"
                className="modal-form-input"
                value={r.fullName}
                onChange={(e) => updateRespondent(r.key, 'fullName', e.target.value)}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor={`respondent-contact-${r.key}`} className="modal-form-label">
                Contact number (optional)
              </label>
              <input
                id={`respondent-contact-${r.key}`}
                type="tel"
                className="modal-form-input"
                value={r.contactNumber}
                onChange={(e) => updateRespondent(r.key, 'contactNumber', e.target.value)}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor={`respondent-address-${r.key}`} className="modal-form-label">
                Where they live (optional)
              </label>
              <input
                id={`respondent-address-${r.key}`}
                type="text"
                className="modal-form-input"
                value={r.addressNote}
                onChange={(e) => updateRespondent(r.key, 'addressNote', e.target.value)}
              />
            </div>
          </div>
        ))}

        <button type="button" className="btn-add" onClick={addRespondent}>
          <FaPlus aria-hidden="true" /> Add another person
        </button>
      </fieldset>

      <fieldset className="complaint-fieldset">
        <legend>Supporting files (optional)</legend>
        {/* Keep these limits aligned with migration 050 and the private bucket. */}
        <p className="field-note" id="complaint-files-note">
          {EVIDENCE_TYPES_LABEL}, up to {EVIDENCE_MAX_LABEL} each, up to{' '}
          {EVIDENCE_MAX_FILES} files. <strong>Videos: MP4 or WebM; witness statements: PDF or plain text.</strong>
        </p>

        <label htmlFor="complaint-files" className="modal-form-label">
          Attach photos or a PDF, video or witness statement
        </label>
        <input
          id="complaint-files"
          ref={fileInputRef}
          type="file"
          className="modal-form-input"
          /* ⚠️ Constrained to the allowed MIME types the bucket accepts,
             never an unrestricted wildcard allowlist. */
          accept={EVIDENCE_ACCEPT}
          multiple
          onChange={(e) => addFiles(e.target.files)}
          aria-describedby="complaint-files-note"
        />

        {fileProblem && (
          <p className="complaint-field-error" role="alert">{fileProblem}</p>
        )}

        {files.length > 0 && (
          <ul className="complaint-file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="complaint-file">
                <FaPaperclip aria-hidden="true" />
                <span className="complaint-file-name">{file.name}</span>
                <span className="complaint-file-meta">
                  {mediaKindFor(file.type)} · {formatBytes(file.size)}
                </span>
                <button
                  type="button"
                  className="btn-deny btn-sm"
                  onClick={() => removeFile(index)}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {problem && <p className="complaint-field-error" role="alert">{problem}</p>}

      </div>
      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-save" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit complaint'}
        </button>
      </div>
    </form>
  )
  return dialog ? <div className="resident-filing-dialog"><DialogShell open titleId="file-complaint-title" title="File a Complaint" busy={submitting} onCancel={onCancel} initialFocusRef={closeRef}
    header={<header className="resident-filing-header"><h2 id="file-complaint-title">File a Complaint</h2><button type="button" className="btn-cancel" ref={closeRef} aria-label="Close file a complaint" onClick={onCancel} disabled={submitting}><FaTimes aria-hidden="true" /></button></header>}>
    {form}
  </DialogShell></div> : form
}

export default FileComplaintForm
