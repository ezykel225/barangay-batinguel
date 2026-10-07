import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE. "Barangay Certificate" is one of the six types the
// resident form offers; what the barangay's own certificate certifies
// is not recorded anywhere in this project, so this template states
// nothing about the resident beyond the fields they submitted.
export const BarangayCertificateTemplate = ({ data }) => (
  <DocumentShell
    title="Barangay Certificate"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample document demonstrates how approved resident and request
      information is populated into a barangay certificate layout. What
      this certificate attests to is set by the official Barangay
      Batinguel form, which has not been supplied; no attestation is
      written here.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Name', value: data.resident.fullName },
      { label: 'Purok', value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
