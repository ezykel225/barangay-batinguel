import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE, and the one template that must NOT look like a form.
//
// "Other" is not a barangay document. It is the resident form's escape
// hatch: the resident could not find their document in the list, picked
// Other, and wrote what they actually need into `purpose`. Which
// barangay form answers that is the Secretary's decision, and no
// registry can make it.
//
// So the title is `Prototype Custom Barangay Document` -- deliberately
// not the name of any real form. Printing this under a plausible
// heading like "Barangay Certification" would be this project inventing
// which document a resident asked for, on the sheet that gets handed
// over.
//
// ⚠️ THE DOCUMENT TITLE IS A PLACEHOLDER; THE PURPOSE IS REAL. The
// purpose is the one thing here that genuinely carries what the
// resident wants, so it is printed verbatim as stored, and the title
// above it is bracketed because nothing in the row supplies one.
//
// ⚠️ NO BODY TEXT IS GENERATED FROM THE PURPOSE. Turning "I need proof
// I live here for my scholarship" into a certification sentence is the
// system writing a barangay document, which is precisely what the
// Secretary is for. The purpose is shown as a field -- quoted back,
// not acted on.
export const CustomDocumentTemplate = ({ data }) => (
  <DocumentShell
    title="Prototype Custom Barangay Document"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample layout covers a request filed as "Other", which is not
      a standardized barangay form. The system records no document title
      for such a request — only the purpose the resident wrote — so the
      title is shown as a placeholder and no certification text is
      generated from it. Which official Barangay Batinguel document
      answers this request is decided by the Barangay Secretary, not by
      this system.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Document requested', value: data.unrecorded.documentTitle, placeholder: true },
      { label: 'Name', value: data.resident.fullName },
      { label: 'Purok', value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Stated purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
