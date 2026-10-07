import { DOCUMENT_BARANGAY, PROTOTYPE_WATERMARK, isPrototypeMode } from './documentConfig'
import logo from '../assets/images/logo.png'

// Everything the four prototype templates share: the heading block, the
// seal, the SAMPLE watermark, the signatory rule and the footer. A
// template supplies only its own title and body.
//
// ⚠️ THE WATERMARK IS HERE AND NOWHERE ELSE. One `isPrototypeMode()`
// call decides it for every template at once, so switching to verified
// forms is one constant in `documentConfig.js` rather than a hunt for
// banner markup in four files.
//
// ⚠️ THE SEAL IS THE PROJECT'S EXISTING LOGO ASSET -- the same
// `assets/images/logo.png` the public navbar and the mobile dashboard
// header already render. No government seal is generated, altered or
// redrawn.

export const DocumentShell = ({ title, reference, issueDate, signatory, children }) => (
  <article className="doc-page" aria-label={`${title} document preview`}>
    {isPrototypeMode() && (
      // Two layers, because one of them survives printing and the
      // other is what a reader notices on screen. The diagonal mark is
      // `aria-hidden` -- the banner below already says the same words
      // once, and a screen reader should not hear them twice.
      <div className="doc-watermark" aria-hidden="true">
        <span>{PROTOTYPE_WATERMARK.heading}</span>
      </div>
    )}

    <header className="doc-header">
      <img className="doc-seal" src={logo} alt="" aria-hidden="true" />
      <div className="doc-heading-lines">
        <p>{DOCUMENT_BARANGAY.republic}</p>
        <p>{DOCUMENT_BARANGAY.province}</p>
        <p>{DOCUMENT_BARANGAY.city}</p>
        <p className="doc-barangay-name">{DOCUMENT_BARANGAY.barangay}</p>
      </div>
    </header>

    {isPrototypeMode() && (
      <p className="doc-sample-banner">
        <strong>{PROTOTYPE_WATERMARK.heading}</strong>
        <span>{PROTOTYPE_WATERMARK.subheading}</span>
      </p>
    )}

    <h1 className="doc-title">{title}</h1>

    <div className="doc-body">{children}</div>

    <div className="doc-foot">
      {/* ⚠️ A RULE AND TWO PLACEHOLDERS. Nothing in this repository
          establishes who signs which document, so the prototype asserts
          nobody's authority and generates no signature image. */}
      <div className="doc-signatory">
        <span className="doc-sign-rule" aria-hidden="true" />
        <span className="doc-sign-name">{signatory?.name}</span>
        <span className="doc-sign-position">{signatory?.position}</span>
      </div>

      <dl className="doc-meta">
        {reference && (
          <>
            <dt>Reference</dt>
            <dd>{reference}</dd>
          </>
        )}
        {issueDate && (
          <>
            <dt>Date generated</dt>
            <dd>{issueDate}</dd>
          </>
        )}
      </dl>
    </div>

    <footer className="doc-footer">
      <p>{DOCUMENT_BARANGAY.contactLine} · {DOCUMENT_BARANGAY.landline}</p>
      {isPrototypeMode() && (
        <p className="doc-footer-sample">
          {PROTOTYPE_WATERMARK.heading} — {PROTOTYPE_WATERMARK.subheading}.
          This layout and its wording are placeholders for system
          development and are not an official {DOCUMENT_BARANGAY.barangay} form.
        </p>
      )}
    </footer>
  </article>
)

// The detail rows every template lays out the same way, so four
// templates cannot drift into four presentations of one resident.
export const DocumentFields = ({ rows }) => (
  <dl className="doc-fields">
    {rows.filter((row) => row && row.value).map((row) => (
      <div className="doc-field" key={row.label}>
        <dt>{row.label}</dt>
        <dd>{row.value}</dd>
      </div>
    ))}
  </dl>
)

// ⚠️ PROTOTYPE PROSE, LABELLED AS SUCH. These paragraphs exist so the
// page looks like a document rather than a form dump -- they are NOT a
// certification clause, and none of them asserts anything about the
// resident. The label above them says so in the document itself.
//
// ⚠️ THE LABEL IS DELIBERATELY *NOT* GATED ON `isPrototypeMode()`,
// and that is a safety property rather than an oversight.
//
// The replacement procedure is: replace each template's body with the
// verified form FIRST, then flip `DOCUMENT_TEMPLATE_MODE`. Flipping it
// the other way round is the dangerous order -- prototype prose on a
// page with no watermark. Because this label belongs to the prose and
// not to the mode, it survives a premature flip and still tells the
// reader the wording is a placeholder. Replacing the template removes
// the `<PrototypeProse>` call, and the label goes with it.
export const PrototypeProse = ({ children }) => (
  <div className="doc-prose">
    <p className="doc-prose-label">PROTOTYPE WORDING</p>
    <p>{children}</p>
  </div>
)
