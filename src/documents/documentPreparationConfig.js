// Provisional preparation guidance only. Replace centrally after barangay approval.
// These entries are not legal requirements, upload rules, or verification records.
export const DOCUMENT_REQUIREMENTS = Object.freeze({
  'Barangay Clearance': Object.freeze(['Valid government-issued ID', 'Proof of residency', 'Voter certification or barangay residency record, if available']),
  'Barangay Certificate': Object.freeze(['Valid government-issued ID', "Supporting document related to the certificate's purpose", 'PSA certificate or voter certification, when applicable']),
  'Certificate of Indigency': Object.freeze(['Valid government-issued ID', 'Information about the assistance or application purpose', 'Supporting information requested by Barangay personnel, if applicable']),
  'Certificate of Residency': Object.freeze(['Valid government-issued ID', 'Proof of current residence', 'Voter certification or other barangay residency record, if available']),
  'Business Clearance': Object.freeze(['Valid ID of business owner or authorized representative', 'Proof of business address', 'Supporting business documents requested by the Barangay, if applicable']),
  'Other': Object.freeze(['Valid government-issued ID, if requested', 'Supporting documents related to your stated purpose, if applicable', 'Confirm preparation for the requested document with Barangay Hall']),
})
export const preparationFor = (type) => Object.prototype.hasOwnProperty.call(DOCUMENT_REQUIREMENTS, type)
  ? DOCUMENT_REQUIREMENTS[type] : ['Confirm preparation for this document with Barangay Hall.']
