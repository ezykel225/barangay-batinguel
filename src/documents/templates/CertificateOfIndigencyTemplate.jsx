import { DocumentShell, DocumentFields, PrototypeProse } from '../DocumentShell'

// ⚠️ PROTOTYPE, and this is the template where the rule matters most.
//
// NOTHING HERE ASSERTS THAT THE RESIDENT IS INDIGENT. The system stores
// no income, no household size, no classification and no assessment --
// a resident requesting this document is evidence that they asked for
// it, and nothing more. So no economic statement, figure or bracket is
// printed, and none is left blank for one.
//
// The barangay's own form decides what is certified and on what basis;
// until it is supplied, this layout shows the submitted request only.
export const CertificateOfIndigencyTemplate = ({ data }) => (
  <DocumentShell
    title="Certificate of Indigency"
    reference={data.reference}
    issueDate={data.issueDate}
    signatory={data.signatory}
  >
    <PrototypeProse>
      This sample document demonstrates how approved request information
      is populated into a certificate layout. It states no finding about
      the resident's circumstances: the system records no income,
      household size or classification, and the official Barangay
      Batinguel wording and its basis for certification have not been
      supplied.
    </PrototypeProse>

    <DocumentFields rows={[
      { label: 'Name', value: data.resident.fullName },
      { label: 'Purok', value: data.resident.purok },
      { label: 'Contact number', value: data.resident.contactNumber },
      { label: 'Purpose', value: data.purpose },
    ]} />
  </DocumentShell>
)
