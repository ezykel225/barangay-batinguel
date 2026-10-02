import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE, and one omission in it is deliberate.
//
// A residency certificate often states how long somebody has lived in
// the barangay. `profiles` and `document_requests` store NO residency
// duration, no move-in date and no street address -- the finest
// address this system holds is a purok. So no duration is printed and
// no line is left blank for one: an invented "resident since" on a
// document handed to an office is a false statement, not a layout gap.
export const CertificateOfResidencyTemplate = ({ data }) => (
  <DocumentShell
    title="Certificate of Residency"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample document demonstrates how approved resident and request
      information is populated into a residency certificate layout. The
      system records a purok but no street address and no length of
      residency, so neither is stated. The official Barangay Batinguel
      wording has not been supplied.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Name', value: data.resident.fullName },
      { label: 'Purok', value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
