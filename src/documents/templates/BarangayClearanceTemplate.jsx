import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE. The real Barangay Batinguel clearance form has not been
// supplied, and nothing below is its wording, its layout or its
// certification clause. No fee, validity period, documentary
// requirement or legal statement is invented here -- the prose says
// only what the system did, which is populate approved request data
// into a sample layout.
export const BarangayClearanceTemplate = ({ data }) => (
  <DocumentShell
    title="Barangay Clearance"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample document demonstrates how approved resident and request
      information is populated into a clearance layout. The official
      Barangay Batinguel clearance wording, certification clause and
      signing authority have not been supplied and are deliberately not
      reproduced here.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Name', value: data.resident.fullName },
      { label: 'Purok', value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
