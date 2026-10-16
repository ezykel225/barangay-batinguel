import { useRef, useState } from 'react'
import { FaPlus, FaTrash, FaPaperclip, FaInfoCircle } from 'react-icons/fa'

import {
  COMPLAINT_CATEGORIES,
  COMPLAINT_ERRORS,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_FILES,
  EVIDENCE_MAX_LABEL,
  EVIDENCE_TYPES_LABEL,
  evidenceProblem,
  formatBytes,
  mediaKindFor,
} from './complaintLabels'
import { encodeWalkInWithEvidence } from './complaintApi'

// The Barangay Secretary encoding a complaint brought to the hall in
// person.
//
// ─── ⚠️ IT ASKS FOR NOTHING THE SERVER OWNS ───────────────────────────
//
// No reference, no status, no `encoded_by`, no timestamp, no actor and
// no system id -- none of those is a parameter of
// `encode_walk_in_complaint()`. The reference is stamped by a trigger,
// the status is the literal `received`, `encoded_by` comes from
// `auth.uid()` and `filed_by_profile_id` is NULL because a walk-in
// complainant has no account. There is nothing on this form a crafted
// call could forge, because the form asks for nothing forgeable.
//
// ─── ⚠️ SECRETARY-ONLY, DECIDED BY THE DATABASE ───────────────────────
//
// `encode_walk_in_complaint()` raises `P0001` unless
// `current_official_holds_position('Barangay Secretary')`. Measured
// against the live database, the PUNONG BARANGAY is refused by it --
// even though he reads every complaint -- so he is rendered no intake
// control at all. The caller's position flag decides whether this
// component is mounted and decides nothing about what is permitted.
//
// ─── ⚠️ NO RESIDENT OR VOTER LOOKUP, BY DESIGN ────────────────────────
//
// Every name here is a free-text SNAPSHOT of what the complainant said
// at the counter. There is deliberately no account picker and no
// searchable Voter Reference List: that table holds the voter records
// the barangay happens to have, not a roll of who lives here, and
// putting it behind a search box on an intake screen would publish it
// one query at a time. P3-A links a party only where a real link
// already exists, and being named in a complaint must create nothing --
// no profile, and no registry row.
const blankRespondent = () => ({
  key: `r-${Math.random().toString(36).slice(2, 9)}`,
  fullName: '',
  contactNumber: '',
  addressNote: '',
})

const WalkInComplaintForm = ({ onEncoded, onCancel }) => {
  const [complainantName, setComplainantName] = useState('')
  const [complainantContact, setComplainantContact] = useState('')
  const [category, setCategory] = useState('')
  const [narrative, setNarrative] = useState('')
  const [locationNote, setLocationNote] = useState('')
  const [respondents, setRespondents] = useState([blankRespondent()])
  const [files, setFiles] = useState([])
  const [fileProblem, setFileProblem] = useState('')
  const [problem, setProblem] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeFile = (index) => setFiles((list) => list.filter((_, i) => i !== index))

  const handleSubmit = async (event) => {
    event.preventDefault()
    // ⚠️ DUPLICATE SUBMISSION IS PREVENTED TWICE: the button disables,
    // and this returns early if a request is already in flight. A
    // keyboard Enter can beat a re-render, and a second encode would
    // create a second complaint with its own reference that nothing
    // downstream could tell apart from the first.
    if (submitting) return

    if (complainantName.trim() === '') {
      setProblem("Please record the complainant's name.")
      return
    }
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
      const result = await encodeWalkInWithEvidence(
        {
          complainantName: complainantName.trim(),
          complainantContact: complainantContact.trim(),
          category,
          narrative: narrative.trim(),
          locationNote: locationNote.trim(),
          respondents,
        },
        files
      )
      onEncoded({ ...result, hasContact: complainantContact.trim() !== '' })
    } catch (err) {
      // ⚠️ The sentence comes from the label map, never from the error.
      // An SQLSTATE, a policy name, an RPC name or a Supabase message
      // must not reach a screen -- and on this screen that includes the
      // trigger's own `P0001` text, which names the position gate.
      setProblem(COMPLAINT_ERRORS[err?.kind] || COMPLAINT_ERRORS.encodeFailed)
      setSubmitting(false)
    }
  }

  return (
    <form className="complaint-form" onSubmit={handleSubmit} noValidate>
      {/* ⚠️ WHAT THE CONTACT NUMBER ACTUALLY UNLOCKS, stated because the
          consequence is invisible otherwise and permanent.
          `encode_walk_in_complaint()` accepts a blank contact
          deliberately -- somebody may have no phone, or decline to give
          one, and an intake the barangay has accepted in person must
          not be refused by a form. But `track_complaint()` requires a
          non-empty contact and matches it against the complainant's
          stored one, so a complaint encoded without a number can NEVER
          be tracked by the person who filed it. Measured against the
          live database: zero rows for any contact, the empty string
          included.

          So the form asks, says why, and lets the Secretary proceed
          without one. It does NOT fabricate a number, and it does not
          block the intake. */}
      <div className="complaint-notice" role="note">
        <FaInfoCircle aria-hidden="true" />
        <p>
          Record the complainant's contact number if they can give one. It is
          the second factor they will need, with the reference number, to
          check this complaint on the public tracking page.{' '}
          <strong>
            A complaint recorded without a contact number cannot be tracked
            online
          </strong>{' '}
          — the complainant would have to return to the Barangay Hall to ask
          about it.
        </p>
      </div>

      <fieldset className="complaint-fieldset">
        <legend>Complainant</legend>

        <div className="modal-form-group">
          <label htmlFor="walkin-name" className="modal-form-label">
            Full name <span aria-hidden="true">*</span>
          </label>
          <input
            id="walkin-name"
            type="text"
            className="modal-form-input"
            value={complainantName}
            onChange={(e) => setComplainantName(e.target.value)}
            aria-required="true"
            aria-describedby="walkin-name-note"
          />
          {/* The name is recorded as given. There is no spelling
              correction, no matching against any list, and no check
              that the person is a registered voter -- absence from the
              Voter Reference List causes nothing anywhere in this
              system, and a complaint is not where that would start. */}
          <p className="field-note" id="walkin-name-note">
            As the complainant gives it. This is recorded on the complaint as
            a snapshot and is not matched against any list.
          </p>
        </div>

        <div className="modal-form-group">
          <label htmlFor="walkin-contact" className="modal-form-label">
            Contact number
          </label>
          <input
            id="walkin-contact"
            type="tel"
            className="modal-form-input"
            value={complainantContact}
            onChange={(e) => setComplainantContact(e.target.value)}
            aria-describedby="walkin-contact-note"
          />
          <p className="field-note" id="walkin-contact-note">
            Optional, but it is what makes online tracking possible.
          </p>
        </div>
      </fieldset>

      <div className="modal-form-group">
        <label htmlFor="walkin-category" className="modal-form-label">
          What is this complaint about? <span aria-hidden="true">*</span>
        </label>
        <select
          id="walkin-category"
          className="modal-form-input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-required="true"
        >
          <option value="">Please choose</option>
          {COMPLAINT_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className="modal-form-group">
        <label htmlFor="walkin-narrative" className="modal-form-label">
          What happened? <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="walkin-narrative"
          className="modal-form-input"
          rows={6}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          aria-required="true"
          aria-describedby="walkin-narrative-note"
        />
        {/* ⚠️ RECORDED, NOT ASSESSED. The Secretary writes down what the
            complainant reported. Nothing on this screen judges whether
            the matter is within Katarungang Pambarangay jurisdiction,
            and nothing may -- P2.5 found no Lupon, Justice or
            Katarungan committee recorded anywhere, so this system has
            no record from which to infer who is entitled to make that
            judgment. It is P4's, and it is the barangay's. */}
        <p className="field-note" id="walkin-narrative-note">
          In the complainant's own account, as reported at the counter.
        </p>
      </div>

      <div className="modal-form-group">
        <label htmlFor="walkin-location" className="modal-form-label">
          Where did this happen?
        </label>
        <input
          id="walkin-location"
          type="text"
          className="modal-form-input"
          value={locationNote}
          onChange={(e) => setLocationNote(e.target.value)}
          aria-describedby="walkin-location-note"
        />
        {/* ⚠️ FREE TEXT, AND DELIBERATELY NOT A PUROK DROPDOWN. The
            column is `location_note`, not `purok`: P2 established that
            no entry in the current purok list has a documentary source,
            that Purok 7's only evidence post-dates the commit that
            added it to the dropdown, and that 17 off-list values sit in
            the live data. There is nothing canonical to choose from
            yet, so this records a description rather than asserting a
            purok. */}
        <p className="field-note" id="walkin-location-note">
          Optional. A landmark or a description is fine.
        </p>
      </div>

      <fieldset className="complaint-fieldset">
        <legend>Person or people complained about (optional)</legend>
        <p className="field-note">
          Leave this blank if the complainant does not know who is
          responsible. Nothing is created for anyone named here.
        </p>

        {respondents.map((r, index) => (
          <div className="complaint-respondent" key={r.key}>
            <div className="complaint-respondent-head">
              <span>Person {index + 1}</span>
              {respondents.length > 1 && (
                <button
                  type="button"
                  className="btn-deny btn-sm"
                  onClick={() => removeRespondent(r.key)}
                  /* Eleven identical "Remove" buttons would all be
                     announced the same; the index is what tells them
                     apart, the same rule ActionMenu's `subject` follows. */
                  aria-label={`Remove person ${index + 1}`}
                >
                  <FaTrash aria-hidden="true" /> Remove
                </button>
              )}
            </div>

            <div className="modal-form-group">
              <label htmlFor={`walkin-respondent-name-${r.key}`} className="modal-form-label">
                Name
              </label>
              <input
                id={`walkin-respondent-name-${r.key}`}
                type="text"
                className="modal-form-input"
                value={r.fullName}
                onChange={(e) => updateRespondent(r.key, 'fullName', e.target.value)}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor={`walkin-respondent-contact-${r.key}`} className="modal-form-label">
                Contact number
              </label>
              <input
                id={`walkin-respondent-contact-${r.key}`}
                type="tel"
                className="modal-form-input"
                value={r.contactNumber}
                onChange={(e) => updateRespondent(r.key, 'contactNumber', e.target.value)}
              />
            </div>

            <div className="modal-form-group">
              <label htmlFor={`walkin-respondent-address-${r.key}`} className="modal-form-label">
                Address or landmark
              </label>
              <input
                id={`walkin-respondent-address-${r.key}`}
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
        {/* ⚠️ The same four MIME types and the same ceiling the resident
            form states, because it is the same bucket and the same
            CHECK. No video: `video/quicktime` does not play in a
            browser `<video>` on every platform and a few seconds of
            phone video exceeds 5 MB, so offering it would produce a
            failure at the counter that nobody could explain. */}
        <p className="field-note" id="walkin-files-note">
          {EVIDENCE_TYPES_LABEL}, up to {EVIDENCE_MAX_LABEL} each, up to{' '}
          {EVIDENCE_MAX_FILES} files. <strong>Video is not supported yet.</strong>
        </p>

        <label htmlFor="walkin-files" className="modal-form-label">
          Attach photos or a PDF
        </label>
        <input
          id="walkin-files"
          ref={fileInputRef}
          type="file"
          className="modal-form-input"
          accept={EVIDENCE_ACCEPT}
          multiple
          onChange={(e) => addFiles(e.target.files)}
          aria-describedby="walkin-files-note"
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

      <div className="modal-actions">
        <button type="button" className="btn-cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn-save" disabled={submitting}>
          {submitting ? 'Recording...' : 'Record complaint'}
        </button>
      </div>
    </form>
  )
}

export default WalkInComplaintForm
