import { createClient } from '@supabase/supabase-js'

// Support both Vite (import.meta.env) and process.env
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const procEnv = typeof process !== 'undefined' && process.env ? process.env : {}

const supabaseUrl = env.VITE_SUPABASE_URL || env.REACT_APP_SUPABASE_URL || procEnv.VITE_SUPABASE_URL || procEnv.REACT_APP_SUPABASE_URL || ''
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.REACT_APP_SUPABASE_ANON_KEY || procEnv.VITE_SUPABASE_ANON_KEY || procEnv.REACT_APP_SUPABASE_ANON_KEY || ''

const isConfigured = Boolean(
  supabaseUrl &&
  supabaseKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-supabase-url')
)

// In-memory / localStorage mock store for offline & preview environments
const STORAGE_PREFIX = 'batinguel_'

const getStored = (key, fallback) => {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key)
    return val ? JSON.parse(val) : fallback
  } catch {
    return fallback
  }
}

const setStored = (key, val) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val))
  } catch {}
}

// Initial Mock Datasets
const INITIAL_OFFICIALS = [
  { id: '1', full_name: 'Hon. Frankie Credo', position: 'Punong Barangay', chairmanship: 'Executive & Peace and Order', display_order: 1, contact_number: '(035) 225-4831', email: 'kapitan@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '2', full_name: 'Alexis Theress P. Tan', position: 'Barangay Kagawad', chairmanship: 'Committee on Health and Sanitation', display_order: 2, contact_number: '0917-123-4502', email: 'a.tan@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '3', full_name: 'Adelina Fabillar Remata', position: 'Barangay Kagawad', chairmanship: 'Committee on Education and Culture', display_order: 3, contact_number: '0917-123-4503', email: 'a.remata@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '4', full_name: 'Caroline Catan Amparado', position: 'Barangay Kagawad', chairmanship: 'Committee on Finance, Budget & Appropriations', display_order: 4, contact_number: '0917-123-4504', email: 'c.amparado@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '5', full_name: 'Sheila Mae Flores Bardago', position: 'Barangay Kagawad', chairmanship: 'Committee on Public Works and Infrastructure', display_order: 5, contact_number: '0917-123-4505', email: 's.bardago@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '6', full_name: 'Harold Katada Baroy', position: 'Barangay Kagawad', chairmanship: 'Committee on Agriculture and Environment', display_order: 6, contact_number: '0917-123-4506', email: 'h.baroy@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '7', full_name: 'Moronihea Alcancia Cabrera', position: 'Barangay Kagawad', chairmanship: 'Committee on Women, Children and Family', display_order: 7, contact_number: '0917-123-4507', email: 'm.cabrera@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '8', full_name: 'Arnulfo Abol Catalan', position: 'Barangay Kagawad', chairmanship: 'Committee on Rules, Ordinances & Human Rights', display_order: 8, contact_number: '0917-123-4508', email: 'a.catalan@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '9', full_name: 'Nicholas Khyle R. Mondoñedo', position: 'SK Chairperson', chairmanship: 'Committee on Youth and Sports Development', display_order: 9, contact_number: '0917-123-4509', email: 'n.mondonedo@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '10', full_name: 'Jeffrey Feria Duran', position: 'Barangay Secretary', chairmanship: 'Secretariat & Records Administration', display_order: 10, contact_number: '0917-123-4510', email: 'secretary@batinguel.gov.ph', is_active: true, archived_at: null },
  { id: '11', full_name: 'Rey Catadman Barba', position: 'Barangay Treasurer', chairmanship: 'Financial Administration & Treasury', display_order: 11, contact_number: '0917-123-4511', email: 'treasurer@batinguel.gov.ph', is_active: true, archived_at: null },
]

const INITIAL_AVAILABILITY = [
  { official_id: '1', day_of_week: 'Monday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Regular office hours' },
  { official_id: '1', day_of_week: 'Tuesday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Regular office hours' },
  { official_id: '1', day_of_week: 'Wednesday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Barangay session in morning' },
  { official_id: '1', day_of_week: 'Thursday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Regular office hours' },
  { official_id: '1', day_of_week: 'Friday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Regular office hours' },
  { official_id: '2', day_of_week: 'Monday', time_start: '09:00', time_end: '12:00', status: 'available', note: 'Health committee consult' },
  { official_id: '2', day_of_week: 'Wednesday', time_start: '13:00', time_end: '17:00', status: 'available', note: 'Afternoon session' },
  { official_id: '10', day_of_week: 'Monday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Intake and clearances' },
  { official_id: '10', day_of_week: 'Tuesday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Intake and clearances' },
  { official_id: '10', day_of_week: 'Wednesday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Session documentation' },
  { official_id: '10', day_of_week: 'Thursday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Intake and clearances' },
  { official_id: '10', day_of_week: 'Friday', time_start: '08:00', time_end: '17:00', status: 'available', note: 'Intake and clearances' },
]

const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: 'Barangay-Wide Clean-Up Drive & Anti-Dengue Operation',
    content: 'We invite all residents across Puroks 1 to 7 to participate in our quarterly synchronized clean-up drive. Please clear stagnant water and cooperate with the health and sanitation team.',
    category: 'Community Clean-up',
    date_posted: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    author: 'Barangay Council',
    is_pinned: true,
  },
  {
    id: 'ann-2',
    title: 'Free Medical Consultation & Dental Mission This Saturday',
    content: 'The Barangay Health Center in partnership with the City Health Office will host free general consultations, blood pressure screening, dental checkups, and free maintenance medicine distribution.',
    category: 'Health Mission',
    date_posted: new Date(Date.now() - 86400000 * 5).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    author: 'Barangay Health Center',
    is_pinned: false,
  },
  {
    id: 'ann-3',
    title: 'Notice of Barangay General Assembly & Budget Transparency Report',
    content: 'All registered voters and household heads are invited to the Barangay General Assembly at the Batinguel Covered Court. Financial reports, ongoing projects, and safety programs will be discussed.',
    category: 'Public Advisory',
    date_posted: new Date(Date.now() - 86400000 * 8).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    author: 'Office of the Punong Barangay',
    is_pinned: false,
  },
]

const now = new Date()
const INITIAL_EVENTS = [
  {
    id: 'evt-1',
    title: 'Barangay General Assembly 2026',
    description: 'Batinguel Covered Court general meeting with all Purok leaders, residents, and officials.',
    event_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 9, 0).toISOString(),
    location: 'Batinguel Covered Court',
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-2',
    title: 'Inter-Purok Youth Basketball Cup',
    description: 'Opening ceremony and tournament bracket games for youth division categories.',
    event_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 9, 14, 0).toISOString(),
    location: 'Batinguel Covered Court',
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-3',
    title: 'Maternal and Child Healthcare Clinic',
    description: 'Vaccinations, prenatal vitamins, child nutrition monitoring and pediatric consultations.',
    event_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14, 8, 30).toISOString(),
    location: 'Barangay Health Center',
    created_at: new Date().toISOString(),
  },
  {
    id: 'evt-4',
    title: 'Community Disaster Preparedness & First Aid Workshop',
    description: 'Hands-on training conducted by CDRRMO with our Tanod brigade and youth volunteers.',
    event_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 19, 13, 30).toISOString(),
    location: 'Barangay Hall Multi-purpose Room',
    created_at: new Date().toISOString(),
  },
]

const INITIAL_MEDICINES = [
  { id: 'med-1', name: 'Paracetamol 500mg', category: 'Analgesic / Antipyretic', dosage: '500mg tablet', quantity: 450, unit: 'tablets', is_available: true, description: 'For relief of fever and mild to moderate pain' },
  { id: 'med-2', name: 'Amoxicillin 500mg', category: 'Antibiotic', dosage: '500mg capsule', quantity: 280, unit: 'capsules', is_available: true, description: 'For bacterial infections upon doctor prescription' },
  { id: 'med-3', name: 'Losartan Potassium 50mg', category: 'Antihypertensive', dosage: '50mg tablet', quantity: 320, unit: 'tablets', is_available: true, description: 'Maintenance for hypertensive patients' },
  { id: 'med-4', name: 'Metformin 500mg', category: 'Antidiabetic', dosage: '500mg tablet', quantity: 260, unit: 'tablets', is_available: true, description: 'Maintenance for diabetes management' },
  { id: 'med-5', name: 'Cetirizine 10mg', category: 'Antihistamine', dosage: '10mg tablet', quantity: 300, unit: 'tablets', is_available: true, description: 'For allergic rhinitis and skin allergies' },
  { id: 'med-6', name: 'Oral Rehydration Salts', category: 'Electrolyte', dosage: '1 sachet in 1L water', quantity: 500, unit: 'sachets', is_available: true, description: 'For dehydration treatment in diarrhea and vomiting' },
  { id: 'med-7', name: 'Vitamin C + Zinc', category: 'Vitamins & Supplements', dosage: '500mg capsule', quantity: 600, unit: 'capsules', is_available: true, description: 'Immune system booster for families' },
  { id: 'med-8', name: 'Salbutamol Inhaler', category: 'Respiratory', dosage: '100mcg/dose', quantity: 35, unit: 'canisters', is_available: true, description: 'Reliever inhaler for asthma episodes' },
]

const INITIAL_CLINIC_SCHEDULES = [
  { id: 'cs-1', day_of_week: 'Monday', service_name: 'General Medical Consultation', morning_hours: '08:00 - 11:30 AM', afternoon_hours: '01:00 - 04:30 PM', nurse_name: 'Barangay Health Nurse', is_active: true },
  { id: 'cs-2', day_of_week: 'Tuesday', service_name: 'Immunization & Well-Baby Clinic', morning_hours: '08:00 - 11:30 AM', afternoon_hours: '01:00 - 04:00 PM', nurse_name: 'Barangay Health Nurse', is_active: true },
  { id: 'cs-3', day_of_week: 'Wednesday', service_name: 'Prenatal Care & Maternal Health', morning_hours: '08:00 - 11:30 AM', afternoon_hours: '01:00 - 04:30 PM', nurse_name: 'Barangay Health Nurse', is_active: true },
  { id: 'cs-4', day_of_week: 'Thursday', service_name: 'Senior Citizen Wellness & NCD Check', morning_hours: '08:00 - 11:30 AM', afternoon_hours: '01:00 - 04:30 PM', nurse_name: 'Barangay Health Nurse', is_active: true },
  { id: 'cs-5', day_of_week: 'Friday', service_name: 'Dental Care & Medicine Dispensing', morning_hours: '08:00 - 11:30 AM', afternoon_hours: '01:00 - 03:30 PM', nurse_name: 'Barangay Health Nurse', is_active: true },
]

const INITIAL_WASTE_SCHEDULE = [
  { id: 'ws-1', day_of_week: 'Monday', waste_type: 'Biodegradable (Kitchen & Yard Waste)', puroks: 'Puroks 1, 2, and 3', display_order: 1 },
  { id: 'ws-2', day_of_week: 'Tuesday', waste_type: 'Biodegradable (Kitchen & Yard Waste)', puroks: 'Puroks 4, 5, 6, and 7', display_order: 2 },
  { id: 'ws-3', day_of_week: 'Wednesday', waste_type: 'Recyclables (Plastics, Bottles, Cans)', puroks: 'All Puroks (1 to 7)', display_order: 3 },
  { id: 'ws-4', day_of_week: 'Friday', waste_type: 'Residual & Non-recyclable Waste', puroks: 'All Puroks (1 to 7)', display_order: 4 },
]

const INITIAL_RESERVATIONS = [
  {
    id: 'res-1',
    reference_code: 'RES-2026-001',
    user_id: 'res-user-1',
    full_name: 'Juan Dela Cruz',
    email: 'resident@batinguel.gov.ph',
    contact_number: '09171234567',
    reservation_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().split('T')[0],
    time_slot: '08:00 - 11:00',
    start_time: '08:00',
    end_time: '11:00',
    purpose: 'Inter-Purok Youth Volleyball practice',
    status: 'approved',
    organization_name: 'Purok 3 Youth Club',
    is_resident: true,
    purok: 'Purok 3',
    created_at: new Date().toISOString(),
  },
]

const INITIAL_COMPLAINTS = [
  {
    id: 'cmp-1',
    reference_number: 'CMP-2026-001',
    complainant_name: 'Maria Santos',
    complainant_contact: '09179876543',
    respondent_name: 'Pedro Ramos',
    respondent_contact: '09181112233',
    incident_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3).toISOString().split('T')[0],
    category: 'Noise Disturbance',
    narrative: 'Excessive loud karaoke beyond 10:00 PM causing severe disturbance to neighbors and students studying.',
    status: 'under_review',
    kp_screening_status: 'provisional',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
]

const INITIAL_INCIDENTS = [
  {
    id: 'inc-1',
    reference_number: 'INC-2026-001',
    blotter_number: 'BLT-2026-001',
    incident_type: 'Physical altercation',
    incident_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2).toISOString().split('T')[0],
    location_label: 'Near Corner Purok 2 & Main Road',
    latitude: 9.3068,
    longitude: 123.2985,
    details: 'Verbal dispute between two motorcycle drivers resolved amicably by responding Tanod officers.',
    status: 'resolved',
    tanod_name: 'Tanod Patrol Team Alpha',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'inc-2',
    reference_number: 'INC-2026-002',
    blotter_number: 'BLT-2026-002',
    incident_type: 'Property damage',
    incident_date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4).toISOString().split('T')[0],
    location_label: 'Purok 4 Access Road',
    latitude: 9.3082,
    longitude: 123.3005,
    details: 'Tree branch fell during evening rain on perimeter fence. Tanod cleared hazard and coordinated with owner.',
    status: 'resolved',
    tanod_name: 'Tanod Patrol Team Beta',
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
]

const INITIAL_PROFILES = [
  { id: 'usr-official', email: 'official@batinguel.gov.ph', role: 'official', first_name: 'Frankie', last_name: 'Credo', middle_name: '', suffix: '', purok: 'Purok 1', contact_number: '0917-225-4831', is_verified: true },
  { id: 'usr-secretary', email: 'secretary@batinguel.gov.ph', role: 'official', first_name: 'Jeffrey', last_name: 'Duran', middle_name: 'Feria', suffix: '', purok: 'Purok 2', contact_number: '0917-123-4510', is_verified: true },
  { id: 'usr-nurse', email: 'nurse@batinguel.gov.ph', role: 'nurse', first_name: 'Elena', last_name: 'Batinguel', middle_name: '', suffix: 'RN', purok: 'Purok 3', contact_number: '0917-555-0199', is_verified: true },
  { id: 'usr-tanod', email: 'tanod@batinguel.gov.ph', role: 'tanod', first_name: 'Ramon', last_name: 'Tanod', middle_name: '', suffix: '', purok: 'Purok 4', contact_number: '0917-555-0188', is_verified: true },
  { id: 'usr-resident', email: 'resident@batinguel.gov.ph', role: 'resident', first_name: 'Juan', last_name: 'Dela Cruz', middle_name: '', suffix: '', purok: 'Purok 3', contact_number: '09171234567', is_verified: true },
]

// Mock Query Builder
class MockQueryBuilder {
  constructor(table) {
    this.table = table
    this.filters = []
    this.sortCol = null
    this.ascending = true
    this.limitCount = null
    this.isSingle = false
    this.selectedFields = '*'
  }

  select(fields = '*') {
    this.selectedFields = fields
    return this
  }

  eq(col, val) {
    this.filters.push((row) => String(row[col]) === String(val))
    return this
  }

  neq(col, val) {
    this.filters.push((row) => String(row[col]) !== String(val))
    return this
  }

  is(col, val) {
    this.filters.push((row) => row[col] === val)
    return this
  }

  not(col, op, val) {
    if (op === 'is') {
      this.filters.push((row) => row[col] !== val)
    }
    return this
  }

  in(col, array) {
    this.filters.push((row) => array.includes(row[col]))
    return this
  }

  order(col, { ascending = true } = {}) {
    this.sortCol = col
    this.ascending = ascending
    return this
  }

  limit(count) {
    this.limitCount = count
    return this
  }

  single() {
    this.isSingle = true
    return this.execute()
  }

  maybeSingle() {
    this.isSingle = true
    return this.execute()
  }

  async execute() {
    const list = getStored(this.table, getDefaultDataForTable(this.table))
    let result = list.filter((row) => this.filters.every((f) => f(row)))

    if (this.sortCol) {
      result.sort((a, b) => {
        const valA = a[this.sortCol] ?? ''
        const valB = b[this.sortCol] ?? ''
        if (valA < valB) return this.ascending ? -1 : 1
        if (valA > valB) return this.ascending ? 1 : -1
        return 0
      })
    }

    if (this.limitCount !== null) {
      result = result.slice(0, this.limitCount)
    }

    if (this.isSingle) {
      if (result.length === 0) {
        return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
      }
      return { data: { ...result[0] }, error: null }
    }

    return { data: result.map((r) => ({ ...r })), error: null, count: result.length }
  }

  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected)
  }

  async insert(items) {
    const arr = Array.isArray(items) ? items : [items]
    const list = getStored(this.table, getDefaultDataForTable(this.table))
    const inserted = arr.map((item, idx) => ({
      id: item.id || `mock-${Date.now()}-${idx}`,
      created_at: new Date().toISOString(),
      ...item,
    }))
    setStored(this.table, [...list, ...inserted])
    return { data: inserted, error: null }
  }

  async update(values) {
    const list = getStored(this.table, getDefaultDataForTable(this.table))
    let updatedCount = 0
    const updated = list.map((row) => {
      if (this.filters.every((f) => f(row))) {
        updatedCount++
        return { ...row, ...values }
      }
      return row
    })
    setStored(this.table, updated)
    return { data: updated, error: null, count: updatedCount }
  }

  async delete() {
    const list = getStored(this.table, getDefaultDataForTable(this.table))
    const filtered = list.filter((row) => !this.filters.every((f) => f(row)))
    setStored(this.table, filtered)
    return { data: filtered, error: null }
  }

  async upsert(item) {
    const items = Array.isArray(item) ? item : [item]
    const list = getStored(this.table, getDefaultDataForTable(this.table))
    let next = [...list]
    for (const it of items) {
      const idx = next.findIndex((r) => r.id === it.id)
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...it }
      } else {
        next.push({ id: it.id || `mock-${Date.now()}`, ...it })
      }
    }
    setStored(this.table, next)
    return { data: next, error: null }
  }
}

function getDefaultDataForTable(table) {
  switch (table) {
    case 'barangay_officials':
      return INITIAL_OFFICIALS
    case 'official_availability':
      return INITIAL_AVAILABILITY
    case 'kapitan_availability':
      return INITIAL_AVAILABILITY.filter((a) => a.official_id === '1')
    case 'announcements':
      return INITIAL_ANNOUNCEMENTS
    case 'events':
      return INITIAL_EVENTS
    case 'medicines':
      return INITIAL_MEDICINES
    case 'clinic_schedules':
      return INITIAL_CLINIC_SCHEDULES
    case 'waste_schedule':
      return INITIAL_WASTE_SCHEDULE
    case 'court_reservations':
      return INITIAL_RESERVATIONS
    case 'complaints':
      return INITIAL_COMPLAINTS
    case 'incidents':
      return INITIAL_INCIDENTS
    case 'profiles':
      return INITIAL_PROFILES
    default:
      return []
  }
}

// Create Mock Supabase Client
function createMockSupabase() {
  const authListeners = new Set()

  const getCurrentSession = () => {
    const session = getStored('auth_session', {
      user: null,
      access_token: 'mock-token',
    })
    return session
  }

  const setCurrentSession = (user) => {
    const session = user ? { user, access_token: 'mock-token' } : null
    setStored('auth_session', session)
    authListeners.forEach((cb) => cb(user ? 'SIGNED_IN' : 'SIGNED_OUT', session))
  }

  return {
    auth: {
      onAuthStateChange: (callback) => {
        authListeners.add(callback)
        const session = getCurrentSession()
        // Fire immediately with existing session
        setTimeout(() => callback(session?.user ? 'SIGNED_IN' : 'INITIAL_SESSION', session), 0)
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(callback)
              },
            },
          },
        }
      },
      getSession: async () => {
        return { data: { session: getCurrentSession() }, error: null }
      },
      getUser: async () => {
        return { data: { user: getCurrentSession()?.user || null }, error: null }
      },
      signInWithPassword: async ({ email, password }) => {
        const profiles = getStored('profiles', INITIAL_PROFILES)
        let found = profiles.find((p) => p.email?.toLowerCase() === email?.toLowerCase())
        if (!found) {
          // Allow flexible demo sign in
          let determinedRole = 'resident'
          const lower = (email || '').toLowerCase()
          if (lower.includes('official') || lower.includes('kapitan') || lower.includes('secretary')) {
            determinedRole = 'official'
          } else if (lower.includes('nurse')) {
            determinedRole = 'nurse'
          } else if (lower.includes('tanod')) {
            determinedRole = 'tanod'
          }

          found = {
            id: `usr-${Date.now()}`,
            email: email,
            role: determinedRole,
            first_name: email.split('@')[0],
            last_name: 'User',
            purok: 'Purok 1',
            is_verified: true,
          }
          setStored('profiles', [...profiles, found])
        }

        const user = {
          id: found.id,
          email: found.email,
          user_metadata: { role: found.role },
        }
        setCurrentSession(user)
        return { data: { user, session: { user, access_token: 'mock-token' } }, error: null }
      },
      signUp: async ({ email, password, options = {} }) => {
        const profiles = getStored('profiles', INITIAL_PROFILES)
        const newProfile = {
          id: `usr-${Date.now()}`,
          email,
          role: 'resident',
          first_name: options.data?.first_name || '',
          last_name: options.data?.last_name || '',
          middle_name: options.data?.middle_name || '',
          suffix: options.data?.suffix || '',
          purok: options.data?.purok || 'Purok 1',
          contact_number: options.data?.contact_number || '',
          is_verified: false,
        }
        setStored('profiles', [...profiles, newProfile])
        const user = { id: newProfile.id, email }
        return { data: { user, session: null }, error: null }
      },
      signOut: async () => {
        setCurrentSession(null)
        return { error: null }
      },
      resetPasswordForEmail: async (email) => {
        return { data: {}, error: null }
      },
      updateUser: async (updates) => {
        const session = getCurrentSession()
        if (session?.user) {
          const updated = { ...session.user, ...updates }
          setCurrentSession(updated)
          return { data: { user: updated }, error: null }
        }
        return { data: null, error: new Error('Not signed in') }
      },
    },

    from: (table) => new MockQueryBuilder(table),

    rpc: async (fn, args = {}) => {
      // Court reservation tracking
      if (fn === 'track_court_reservation') {
        const reservations = getStored('court_reservations', INITIAL_RESERVATIONS)
        const ref = (args.p_reference || '').trim().toUpperCase()
        const contact = (args.p_contact || '').replace(/\D/g, '')
        const found = reservations.find((r) => {
          const rRef = (r.reference_code || '').trim().toUpperCase()
          const rContact = (r.contact_number || '').replace(/\D/g, '')
          return rRef === ref && rContact.slice(-7) === contact.slice(-7)
        })
        return { data: found ? [found] : [], error: null }
      }

      // Complaint tracking
      if (fn === 'track_complaint') {
        const complaints = getStored('complaints', INITIAL_COMPLAINTS)
        const ref = (args.p_reference || '').trim().toUpperCase()
        const contact = (args.p_contact || '').replace(/\D/g, '')
        const found = complaints.find((c) => {
          const cRef = (c.reference_number || '').trim().toUpperCase()
          const cContact = (c.complainant_contact || '').replace(/\D/g, '')
          return cRef === ref && (contact ? cContact.slice(-7) === contact.slice(-7) : true)
        })
        return { data: found ? [found] : [], error: null }
      }

      // Public safety aggregates
      if (fn === 'public_safety_overview') {
        const incidents = getStored('incidents', INITIAL_INCIDENTS)
        return {
          data: [
            {
              total_incidents: incidents.length,
              mapped_incidents: incidents.length,
              zone_count: 2,
            },
          ],
          error: null,
        }
      }

      if (fn === 'public_safety_zones') {
        return {
          data: [
            {
              center_lat: 9.3068,
              center_lng: 123.2985,
              total: 1,
              band: 'low',
            },
            {
              center_lat: 9.3082,
              center_lng: 123.3005,
              total: 1,
              band: 'low',
            },
          ],
          error: null,
        }
      }

      if (fn === 'public_safety_zone_type_counts') {
        return {
          data: [
            {
              center_lat: 9.3068,
              center_lng: 123.2985,
              incident_type: 'Physical altercation',
              type_count: 1,
            },
            {
              center_lat: 9.3082,
              center_lng: 123.3005,
              incident_type: 'Property damage',
              type_count: 1,
            },
          ],
          error: null,
        }
      }

      if (fn === 'public_safety_type_counts') {
        return {
          data: [
            { incident_type: 'Physical altercation', count: 1 },
            { incident_type: 'Property damage', count: 1 },
          ],
          error: null,
        }
      }

      if (fn === 'public_safety_monthly') {
        return {
          data: [
            { month: '2026-10', count: 1 },
            { month: '2026-11', count: 1 },
          ],
          error: null,
        }
      }

      if (fn === 'incident_map_points') {
        const incidents = getStored('incidents', INITIAL_INCIDENTS)
        return {
          data: incidents.map((inc) => ({
            id: inc.id,
            reference: inc.reference_number,
            incident_type: inc.incident_type,
            incident_date: inc.incident_date,
            location_label: inc.location_label,
            latitude: inc.latitude,
            longitude: inc.longitude,
          })),
          error: null,
        }
      }

      if (fn === 'community_credit_profile') {
        return {
          data: {
            credit_score: 100,
            standing: 'Good Standing',
            participations_count: 5,
            eligible_services: ['Barangay Clearance', 'Certificate of Residency', 'Indigency Certificate'],
          },
          error: null,
        }
      }

      return { data: [], error: null }
    },

    storage: {
      from: (bucket) => ({
        upload: async (path, file) => {
          return { data: { path }, error: null }
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: `/assets/mock/${path}` },
        }),
        createSignedUrl: async (path, expiry) => ({
          data: { signedUrl: `/assets/mock/${path}?token=mock` },
          error: null,
        }),
        remove: async (paths) => ({ data: paths, error: null }),
      }),
    },
  }
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : createMockSupabase()
