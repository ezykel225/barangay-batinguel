import fs from 'fs'
import path from 'path'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { caseRpc, dueState, manilaDate } from './caseSupportApi'
import CaseFollowups from './CaseFollowups'
import CaseProjectDocuments from './CaseProjectDocuments'
import PartyLink from './PartyLink'
import EvidenceActions from './EvidenceActions'
import ClearanceWarning from './ClearanceWarning'
import IncidentKpLink from './IncidentKpLink'
import HearingSchedule from './HearingSchedule'
import SupportHistory from './SupportHistory'
import { uploadEvidence } from '../complaints/complaintApi'

jest.mock('./caseSupportApi', () => ({ ...jest.requireActual('./caseSupportApi'), caseRpc: jest.fn() }))
jest.mock('../complaints/complaintApi', () => ({ uploadEvidence: jest.fn() }))
beforeEach(() => { jest.clearAllMocks(); caseRpc.mockResolvedValue([]) })
test('audit timeline uses readable activity, Manila time and filename instead of UUID/JSON', async () => {
  caseRpc.mockResolvedValue([
    { id: 'a', event_kind: 'evidence_uploaded', created_at: '2026-10-18T10:59:00Z', detail: { attachment_id: 'private-uuid' } },
    { id: 'b', event_kind: 'evidence_withdrawn', created_at: '2026-10-18T11:00:00Z', detail: { attachment_id: 'private-uuid', reason: 'Wrong sample' } },
  ])
  const { container } = render(<SupportHistory complaintId="c1" attachments={[{ id: 'private-uuid', display_filename: 'proof.pdf' }]} />)
  fireEvent.click(screen.getByText('Evidence and case-support audit'))
  await screen.findByText('Evidence uploaded')
  expect(screen.getByText(/18 Oct 2026.*6:59 PM/)).toBeInTheDocument()
  expect(screen.getAllByText('proof.pdf')).toHaveLength(2)
  expect(screen.getByText('Reason: Wrong sample')).toBeInTheDocument()
  expect(container).not.toHaveTextContent('private-uuid')
  expect(container).not.toHaveTextContent('attachment_id')
  expect(container.querySelector('pre')).toBeNull()
})
test('historical evidence with unavailable filename has a readable fallback', async () => {
  caseRpc.mockResolvedValue([{ id: 'old', event_kind: 'evidence_uploaded', created_at: null, detail: { attachment_id: 'unknown-uuid' } }])
  render(<SupportHistory complaintId="c1" />)
  fireEvent.click(screen.getByText('Evidence and case-support audit'))
  expect(await screen.findByText('Evidence file (name unavailable in active attachments)')).toBeInTheDocument()
  expect(screen.getByText('Date not recorded')).toBeInTheDocument()
  expect(screen.queryByText('unknown-uuid')).toBeNull()
})
test('Manila date and due states are calendar based without statutory periods', () => {
  expect(manilaDate(new Date('2026-10-18T17:00:00Z'))).toBe('2026-10-19')
  expect(dueState('2026-10-17','2026-10-18')).toBe('Overdue')
  expect(dueState('2026-10-18','2026-10-18')).toBe('Due today')
  expect(dueState('2026-10-19','2026-10-18')).toBe('Upcoming')
  expect(dueState('')).toBe('Not set')
})
test('manual followups preserve case ID and only save once while pending', async () => {
  render(<CaseFollowups kpCase={{ id: 'case-1' }} parties={[]} />)
  await waitFor(() => expect(screen.getByLabelText('Mediation due date')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Mediation due date'), { target: { value: '2026-10-25' } })
  let finish
  caseRpc.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const save = screen.getByRole('button', { name: 'Save follow-up record' })
  fireEvent.submit(save.closest('form')); fireEvent.submit(save.closest('form'))
  expect(caseRpc.mock.calls.filter(([n]) => n === 'save_kp_followups')).toHaveLength(1)
  expect(caseRpc).toHaveBeenLastCalledWith('save_kp_followups', expect.objectContaining({ p_case_id: 'case-1', p_mediation_due: '2026-10-25', p_conciliation_due: null }))
  await act(async () => finish())
  expect(screen.getByRole('status')).toHaveTextContent('Case status was not changed')
})
test('resident linking requires explicit confirmation of a stable ID', async () => {
  caseRpc.mockResolvedValueOnce([{ record_kind: 'registry', record_id: 'resident-uuid', full_name: 'Sample Resident' }]).mockResolvedValue(null)
  render(<PartyLink party={{ id: 'party-uuid', full_name_snapshot: 'Sample' }} />)
  fireEvent.change(screen.getByLabelText(/Find existing resident/), { target: { value: 'Sam' } })
  fireEvent.click(screen.getByText('Search resident records'))
  fireEvent.click(await screen.findByText('Confirm this resident'))
  await waitFor(() => expect(caseRpc).toHaveBeenCalledWith('link_complaint_party', { p_party_id: 'party-uuid', p_record_kind: 'registry', p_record_id: 'resident-uuid' }))
  expect(screen.getByText(/not proof of identity/)).toBeInTheDocument()
})
test('additional video evidence uploads once; withdrawal needs a reason', async () => {
  render(<EvidenceActions complaintId="complaint-uuid" attachments={[{ id: 'file-uuid', display_filename: 'proof.pdf' }]} />)
  const file = new File(['video'], 'clip.mp4', { type: 'video/mp4' })
  fireEvent.change(screen.getByLabelText('Additional evidence'), { target: { files: [file] } })
  let finish
  uploadEvidence.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  fireEvent.click(screen.getByRole('button', { name: 'Upload evidence' })); fireEvent.click(screen.getByRole('button', { name: 'Upload evidence' }))
  expect(uploadEvidence).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(screen.getByRole('button', { name: 'Withdraw evidence' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('File'), { target: { value: 'file-uuid' } })
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wrong attachment' } })
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw evidence' }))
  await waitFor(() => expect(caseRpc).toHaveBeenCalledWith('withdraw_complaint_evidence', { p_attachment_id: 'file-uuid', p_reason: 'Wrong attachment' }))
})
test('clearance warning exposes no case details and cannot approve or reject', async () => {
  caseRpc.mockResolvedValue(true)
  render(<ClearanceWarning requestId="request-uuid" />)
  await screen.findByText(/Unresolved case on record/)
  expect(caseRpc).toHaveBeenCalledWith('clearance_case_warning', { p_request_id: 'request-uuid' })
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
test('incident linking displays independent KP status and uses existing case reference', async () => {
  caseRpc.mockResolvedValue([{ reference: 'KP-123', status: 'in_process' }])
  render(<IncidentKpLink incidentId="incident-uuid" />)
  await screen.findByText(/KP-123 — in_process/)
  fireEvent.change(screen.getByLabelText('Existing KP case reference'), { target: { value: 'KP-123' } })
  fireEvent.submit(screen.getByText('Link existing KP case').closest('form'))
  await waitFor(() => expect(caseRpc).toHaveBeenCalledWith('link_incident_kp', { p_incident_id: 'incident-uuid', p_case_reference: 'KP-123' }))
})
test('project certificate remains a draft and never certifies legal eligibility', () => {
  render(<CaseProjectDocuments kpCase={{ reference: 'KP-1' }} parties={[{ party_role: 'complainant', party_name: 'Sample' }]} followups={{ review_note: 'For review' }} />)
  fireEvent.click(screen.getByText('Preview certificate to file action'))
  expect(screen.getByRole('dialog')).toHaveTextContent('does not certify eligibility')
  expect(screen.getByRole('dialog')).toHaveTextContent('LGU/LEGAL REVIEW REQUIRED')
  expect(screen.getByRole('dialog')).toHaveTextContent('Sample')
  expect(caseRpc).not.toHaveBeenCalled()
})
test('hearing schedule filters by selected month and orders dates', () => {
  render(<HearingSchedule hearings={[{ id: 'b', hearing_date: '2026-08-10', start_time: '10:00', location: 'Hall', status: 'scheduled' },{ id: 'a', hearing_date: '2026-08-02', location: 'Hall', status: 'completed' },{ id: 'c', hearing_date: '2026-09-01', location: 'Other' }]} />)
  fireEvent.change(screen.getByLabelText('Schedule month'), { target: { value: '2026-08' } })
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(2); expect(rows[0]).toHaveTextContent('2026-08-02')
  expect(screen.queryByText('Other')).not.toBeInTheDocument()
})

describe('new SQL security contracts', () => {
  const load = (name) => fs.readFileSync(path.join(__dirname,'../../supabase-migrations',name),'utf8').replace(/--[^\n]*/g,'').toLowerCase()
  const evidence = load('050_case_evidence_support.sql')
  const support = load('051_case_review_support.sql')
  test.each([['evidence',evidence],['support',support]])('%s definers have empty search paths, revoked public/anon and authenticated grants', (_,sql) => {
    const definitions = sql.split(/create (?:or replace )?function /).slice(1)
    expect(definitions.length).toBeGreaterThan(0)
    definitions.forEach((f) => expect(f.split('as $$')[0]).toMatch(/security definer set search_path = ''/))
    expect(sql).toMatch(/from public, anon/)
    expect(sql).toMatch(/to authenticated/)
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete|all) on/)
  })
  test('all new tables are private with RLS and revoked clients', () => {
    for (const table of ['case_support_events','kp_case_followups','incident_case_links']) {
      expect(evidence+support).toContain(`alter table public.${table} enable row level security`)
    }
    expect(evidence).toContain('from public, anon, authenticated')
    expect(support).toContain('from public, anon, authenticated')
  })
  test('withdrawal blocks storage access and list access while retaining originals', () => {
    expect(evidence).toContain('public.complaint_is_visible_to_caller')
    expect(evidence).toContain('a.withdrawn_at is not null')
    expect(evidence).toContain('a.withdrawn_at is null')
    expect(evidence).toContain("file_size_limit = 26214400")
    expect(evidence).not.toMatch(/delete from|create policy/)
    expect(evidence).toContain('public.current_official_may_administer_records()')
  })
  test('clearance uses stable IDs and returns only a boolean; statuses remain separate', () => {
    expect(support).toContain('p.profile_id = d.resident_id')
    expect(support).toContain("k.status <> 'concluded'")
    expect(support).not.toMatch(/update public\.(incidents|blotter_entries|kp_cases|document_requests)/)
    expect(support).not.toContain('current_date +')
    expect(support).not.toContain('interval')
    expect(support).toContain('public.kp_case_is_visible_to_caller')
  })
})
