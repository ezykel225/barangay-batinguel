// Reference text about the barangay. Kept as constants rather than a
// database table on purpose: this is history and geography, not
// operational data. It changes when the barangay rewrites it, not
// day to day, so a table and an editor would be machinery for a file
// nobody edits. Population is the one figure that drifts -- update it
// here when the barangay publishes a new count.

export const BARANGAY_HISTORY = [
  'The word "Batinguel" literally means a type of hard stone. The story ' +
  'says that during the early part of our history the people of the barrio ' +
  'had a strong adherence of sectionalism. They were hostile to strangers, ' +
  'and strangers and visitors were stoned. The natives were also of the ' +
  'rebellious headed type of people.',

  'Hence the people of the neighbouring barrios and visitors called the ' +
  'barrio Batinguel. The word must have reference to the hardheadedness of ' +
  'the people, and to the stone actually used by the natives against ' +
  'visitors and strangers.',

  // Kept because the source keeps it: the name is a relic of how the
  // place was once seen, not a description of anyone living here now.
  'Although the characteristics of the people must have already changed in ' +
  'the course of time, the name continued to live up to this time.',
]

export const BARANGAY_PROFILE = {
  intro:
    'With a population of more than 13,000, Barangay Batinguel is one of ' +
    'the biggest barangays in Dumaguete. Close to the city centre yet far ' +
    'enough from the busy streets, it is a popular location for middle ' +
    'class housing projects.',

  facts: [
    { label: 'Population', value: 'More than 13,000' },
    { label: 'City', value: 'Dumaguete City, Negros Oriental' },
    // Where one ends and the other begins depends on who you ask, so
    // it is described rather than mapped.
    { label: 'Divisions', value: 'Lower Batinguel and Upper Batinguel' },
  ],

  boundaries: [
    { direction: 'North', barangay: 'Barangay Motong' },
    { direction: 'East', barangay: 'Barangay Taclobo' },
    { direction: 'South', barangay: 'Barangay Junob' },
    { direction: 'West', barangay: 'Barangay Candau-ay' },
  ],
}

export const BATINGUEL_ELEMENTARY = {
  name: 'Batinguel Elementary School',
  description:
    'Located in the western part of Dumaguete City, roughly 4 kilometres ' +
    'from the city centre. The school sits on about 10,000 square metres ' +
    'with 14 buildings, and serves over 1,000 students.',
  facts: [
    { label: 'Distance from city centre', value: '~4 kilometres' },
    { label: 'Land area', value: '~10,000 square metres' },
    { label: 'Buildings', value: '14' },
    { label: 'Students', value: 'Over 1,000' },
  ],
}
