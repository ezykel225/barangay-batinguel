import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE, and the template where the most is NOT known.
//
// This type was deliberately left unconfigured in X6 on the grounds
// that `document_requests` stores no business name, address or nature
// of business. That observation is still exactly true -- the table
// holds `full_name`, `contact_number`, `purok`, `purpose` and
// `additional_notes`, and nothing about a business. What changed is the
// conclusion: a resident can select Business Clearance in the request
// form, and the live table already holds one such request sitting at
// `ready_for_pickup`, so "no template at all" meant the Secretary had a
// real approved request and no sample output for it.
//
// So the three business values print as BRACKETED PLACEHOLDERS rather
// than as absent lines or invented text. A blank line invites somebody
// to write a value onto a sample; `[BUSINESS NAME]` cannot be mistaken
// for one.
//
// ─── ⚠️ WHAT IS DELIBERATELY ABSENT, AND WHY ──────────────────────────
//
// No permit number, OR number, fee, amount, tax or business-tax line,
// business classification, validity period, expiry date, regulatory
// approval, inspection finding or compliance statement appears here --
// not as text, not as a blank, and NOT AS A PLACEHOLDER EITHER.
//
// That last part is the subtle half. A `[PERMIT NO.]` placeholder looks
// cautious while still asserting that Barangay Batinguel's real form
// HAS a permit number field. Nobody has told this project that. A
// placeholder is only for a value the barangay has already indicated
// exists, or one the document plainly cannot be read without.
//
// ⚠️ `full_name` IS THE REQUESTER, NOT AN ESTABLISHED OWNER. The row
// records who filed the request; it records nothing about who owns the
// business. The label says "Requested by" for that reason, and the
// purok is labelled as the requester's so it cannot be read as the
// business address -- those are two different facts and the schema only
// has the first.
export const BusinessClearanceTemplate = ({ data }) => (
  <DocumentShell
    title="Business Clearance"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample document demonstrates how an approved Business Clearance
      request is populated into a layout. The system stores only the
      requester's own details and the purpose they wrote, so the business
      name, address and nature of business are shown as placeholders
      rather than values. No permit number, fee, validity period,
      classification or regulatory approval is stated, and the official
      Barangay Batinguel business clearance wording has not been supplied.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Business name', value: data.unrecorded.businessName, placeholder: true },
      { label: 'Nature of business', value: data.unrecorded.natureOfBusiness, placeholder: true },
      { label: 'Business address', value: data.unrecorded.businessAddress, placeholder: true },
      { label: 'Requested by', value: data.resident.fullName },
      { label: "Requester's purok", value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
