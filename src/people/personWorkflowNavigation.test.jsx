// Phase 2: People & History left the sidebar and its workflows moved into
// Incidents & Blotter. These pin that nothing was lost on the way: the search,
// the history viewer, external-person intake, and verifying or correcting a
// resident link -- the last two for records administrators only, and always
// as an explicit choice, never a name match. The database is still what
// enforces every write (person_history_require_admin, 061).
import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PeopleHistory, { PersonDialog } from './PeopleHistory'
import IdentityLinkPanel, { CORRECTION_HISTORY_NOTE, IDENTITY_LINK_NOTE } from './IdentityLinkPanel'
import * as api from './peopleApi'
import { MOVED_OFFICIAL_TABS, OFFICIAL_TABS, resolveOfficialTab } from '../utils/officialTabs'

jest.mock('./peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children }) => <div role="dialog" aria-label={title}>{children}</div>)

const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n')
const code = (rel) => src(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const external = { kind: 'external', id: 'e1', full_name: 'Juan Dela Cruz', recorded_barangay: 'Bantayan', recorded_city_municipality: 'Dumaguete' }
const linkedExternal = { ...external, linked_resident_id: 'r-old', linked_resident_name: 'Juan Cruz' }
const resident = { kind: 'resident', id: 'r1', full_name: 'Ana Santos', purok: 'Purok 1', resident_status: 'active', credit_applicable: true }
const dialogData = (identity) => ({ identity, incidents: [], complaints: [], timeline: [], analytics: null })

beforeEach(() => jest.resetAllMocks())

describe('sidebar and tab routing', () => {
  test('People & History is no longer a sidebar entry or a dashboard tab', () => {
    expect(OFFICIAL_TABS).not.toContain('people-history')
    expect(code('components/Sidebar.jsx')).not.toMatch(/people-history|People & History/)
    expect(code('dashboards/OfficialDashboard.jsx')).not.toMatch(/people-history|PeopleHistory/)
  })

  test('a stored or bookmarked people-history id opens Incidents & Blotter, not a blank tab', () => {
    expect(resolveOfficialTab('people-history')).toBe('incidents')
    expect(OFFICIAL_TABS).toContain('incidents')
    Object.values(MOVED_OFFICIAL_TABS).forEach((tab) => expect(OFFICIAL_TABS).toContain(tab))
    expect(Object.isFrozen(MOVED_OFFICIAL_TABS)).toBe(true)
    // An inherited property name is not a moved tab.
    ;['constructor', 'toString', '__proto__'].forEach((v) => expect(resolveOfficialTab(v)).toBe('dashboard'))
  })

  test('no retired module comes back', () => {
    ;['reservations', 'registry', 'waste', 'health-events', 'nurse', 'kapitan'].forEach((tab) => {
      expect(OFFICIAL_TABS).not.toContain(tab)
      expect(Object.keys(MOVED_OFFICIAL_TABS)).not.toContain(tab)
    })
  })

  test('Incidents & Blotter carries the people section with the records-administrator flag', () => {
    expect(code('incidents/IncidentsPanel.jsx')).toMatch(/<PeopleHistory embedded canManage=\{canAdminister\} \/>/)
    expect(code('dashboards/OfficialDashboard.jsx')).toMatch(/<IncidentsPanel canAdminister=\{isSecretary \|\| isKapitan\}/)
  })

  test('residents still open through Residents -> the unified Resident Profile, and only there', () => {
    expect(code('residents/ResidentDirectory.jsx')).toMatch(/<ResidentProfileDialog/)
    expect(code('people/PeopleHistory.jsx')).not.toMatch(/ResidentProfileDialog/)
  })

  test('the complaint-party link no longer points at a tab that does not exist', () => {
    const party = src('casesupport/PartyLink.jsx')
    expect(party).not.toMatch(/in People & History/)
    expect(party).toMatch(/Incidents & Blotter → People & identity records/)
  })
})

describe('the embedded people section', () => {
  test('renders as a section (h2), not a second page heading', () => {
    render(<PeopleHistory embedded />)
    expect(screen.getByRole('heading', { level: 2, name: 'People & identity records' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search people')).toBeInTheDocument()
  })

  test('adding an external person is offered to records administrators only, and is absent (not disabled) otherwise', () => {
    const { unmount } = render(<PeopleHistory embedded />)
    expect(screen.queryByRole('button', { name: 'Add external person' })).not.toBeInTheDocument()
    unmount()
    render(<PeopleHistory embedded canManage />)
    fireEvent.click(screen.getByRole('button', { name: 'Add external person' }))
    expect(screen.getByRole('button', { name: 'Save external person' })).toBeInTheDocument()
  })

  test('search and history remain reachable from the section', async () => {
    api.searchPeople.mockResolvedValue([{ person_kind: 'external', person_id: 'e1', full_name: 'Juan Dela Cruz', secondary_text: 'Bantayan' }])
    api.loadPersonHistory.mockResolvedValue(dialogData(external))
    api.loadPersonAnalytics.mockResolvedValue(null)
    render(<PeopleHistory embedded />)
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Juan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View history' }))
    expect(await screen.findByRole('dialog', { name: 'Person History' })).toBeInTheDocument()
    expect(api.loadPersonHistory).toHaveBeenCalledWith('external', 'e1')
  })
})

describe('verifying and correcting a resident link', () => {
  test('appears for an external person and a records administrator only', () => {
    const { unmount } = render(<PersonDialog data={dialogData(external)} canManage onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Verify resident link' })).toBeInTheDocument()
    unmount()
    const second = render(<PersonDialog data={dialogData(external)} onClose={() => {}} />)
    expect(screen.queryByRole('heading', { name: /resident link/ })).not.toBeInTheDocument()
    second.unmount()
    render(<PersonDialog data={dialogData(resident)} canManage onClose={() => {}} />)
    expect(screen.queryByRole('heading', { name: /resident link/ })).not.toBeInTheDocument()
  })

  test('linking is an explicit choice: a lone search result is not selected for the official', async () => {
    api.searchPeople.mockResolvedValue([
      { person_kind: 'resident', person_id: 'r9', full_name: 'Juan Dela Cruz', secondary_text: 'Purok 2' },
      { person_kind: 'external', person_id: 'e7', full_name: 'Juan Dela Cruz', secondary_text: 'Valencia' },
    ])
    api.linkExternalToResident.mockResolvedValue(null)
    const onChanged = jest.fn()
    render(<IdentityLinkPanel identity={external} onChanged={onChanged} />)
    expect(screen.getByText(IDENTITY_LINK_NOTE)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search Batinguel residents'), { target: { value: 'Juan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const list = await screen.findByRole('list')
    // Only residents are offered; the same-named external record is not.
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Verify link' })).toBeDisabled()
    fireEvent.click(within(list).getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify link' }))
    await waitFor(() => expect(api.linkExternalToResident).toHaveBeenCalledWith('e1', 'r9', ''))
    expect(api.correctExternalResidentLink).not.toHaveBeenCalled()
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  test('a correction needs a reason, uses the correction RPC, and says the history is kept', async () => {
    api.searchPeople.mockResolvedValue([
      { person_kind: 'resident', person_id: 'r-old', full_name: 'Juan Cruz', secondary_text: 'Purok 1' },
      { person_kind: 'resident', person_id: 'r-new', full_name: 'Juan Dela Cruz', secondary_text: 'Purok 3' },
    ])
    api.correctExternalResidentLink.mockResolvedValue(null)
    render(<IdentityLinkPanel identity={linkedExternal} onChanged={jest.fn()} />)
    expect(screen.getByRole('heading', { name: 'Correct resident link' })).toBeInTheDocument()
    expect(screen.getByText(CORRECTION_HISTORY_NOTE)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search Batinguel residents'), { target: { value: 'Juan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    const list = await screen.findByRole('list')
    // The currently linked resident is not offered as a "correction" to itself.
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('button', { name: 'Save correction' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for correction (required)'), { target: { value: 'Wrong resident chosen at intake' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }))
    await waitFor(() => expect(api.correctExternalResidentLink).toHaveBeenCalledWith('e1', 'r-new', 'Wrong resident chosen at intake'))
    expect(api.linkExternalToResident).not.toHaveBeenCalled()
  })

  test('a database refusal is reported neutrally and changes nothing on screen', async () => {
    api.searchPeople.mockResolvedValue([{ person_kind: 'resident', person_id: 'r9', full_name: 'Juan Dela Cruz', secondary_text: 'Purok 2' }])
    api.linkExternalToResident.mockRejectedValue(Object.assign(new Error('x'), { code: '42501' }))
    const onChanged = jest.fn()
    render(<IdentityLinkPanel identity={external} onChanged={onChanged} />)
    fireEvent.change(screen.getByLabelText('Search Batinguel residents'), { target: { value: 'Juan' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(within(await screen.findByRole('list')).getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify link' }))
    expect(await screen.findByText('The link could not be saved. Check access and try again.')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toMatch(/42501|link_external|Not authorized/)
  })

  test('no name matching and no new permission logic in the frontend', () => {
    const panel = code('people/IdentityLinkPanel.jsx')
    expect(panel).not.toMatch(/full_name\s*===|toLowerCase\(\)\s*===|similar|levenshtein|soundex|isSecretary|isKapitan|position/)
    expect(code('people/peopleApi.js')).toMatch(/rpc\('link_external_person_to_resident'/)
    expect(code('people/peopleApi.js')).toMatch(/rpc\('correct_external_person_resident_link'/)
  })
})
