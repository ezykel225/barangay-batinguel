import fs from 'fs'
import path from 'path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import IncidentParties from './IncidentParties'
import PeopleHistory from './PeopleHistory'
import * as api from './peopleApi'

jest.mock('./peopleApi')
jest.mock('../components/PortalDetailsDialog', () => ({ title, children, onClose }) => <div role="dialog" aria-label={title}>{children}<button onClick={onClose}>Close</button></div>)

const sql = fs.readFileSync(path.join(process.cwd(), 'supabase-migrations/061_person_matter_linking.sql'), 'utf8')
const clean = sql.replace(/--[^\n]*/g, '').toLowerCase()

beforeEach(() => { jest.clearAllMocks(); api.searchPeople.mockResolvedValue([]); api.loadIncidentParties.mockResolvedValue([]) })

describe('migration 061 identity and security contracts', () => {
  test('is ordered after 060 and leaves earlier migrations present', () => {
    const files = fs.readdirSync(path.join(process.cwd(), 'supabase-migrations')).filter(f => /^\d{3}_.*\.sql$/.test(f)).sort()
    expect(files.slice(-3)).toEqual(['060_community_credit_enrollment.sql', '061_person_matter_linking.sql', '062_analytics_insights.sql'])
  })
  test('creates external identities, reviewed resident transitions, and exact-one incident links', () => {
    expect(clean).toContain('create table public.external_persons')
    expect(clean).toContain('create table public.external_person_resident_links')
    expect(clean).toContain('create table public.incident_parties')
    expect(clean).toContain('incident_parties_exactly_one_identity')
    expect(clean).toContain('resident_id uuid references public.barangay_residents')
    expect(clean).toContain('external_person_id uuid references public.external_persons')
  })
  test('keeps names out of linkage predicates and makes linking explicit by UUID', () => {
    expect(clean).toContain('create function public.link_complaint_party_identity(p_party_id uuid,p_person_kind text,p_person_id uuid)')
    expect(clean).toContain('create function public.save_incident_party(p_id uuid,p_incident_id uuid,p_resident_id uuid,p_external_person_id uuid')
    expect(clean).not.toMatch(/update public\.complaint_parties[\s\S]{0,500}where[\s\S]{0,100}(full_name_snapshot|ilike)/)
  })
  test('uses existing incident, blotter, complaint and KP relationships', () => {
    expect(clean).toContain('left join public.blotter_entries b on b.incident_id=i.id')
    expect(clean).toContain('left join public.incident_case_links l on l.incident_id=i.id')
    expect(clean).toContain('from public.kp_cases k2 join public.incident_case_links l on l.case_id=k2.id')
    expect(clean).not.toContain('create table public.matters')
  })
  test('defaults outcomes neutrally and makes no Community Credit writes', () => {
    expect(clean).toContain("outcome_status text not null default 'not_determined'")
    expect(clean).not.toMatch(/(?:insert into|update|delete from) public\.community_credit_/)
  })
  test('enables RLS, revokes tables, narrows grants, and checks official authority', () => {
    for (const table of ['external_persons', 'external_person_resident_links', 'incident_parties']) expect(clean).toContain(`alter table public.${table} enable row level security`)
    expect(clean).toContain('from public,anon,authenticated,service_role')
    expect(clean).toContain('public.current_official_is_active()')
    expect(clean).toContain('public.current_official_may_administer_records()')
    expect(clean).not.toMatch(/grant (select|insert|update|delete|all) on/)
  })
  test('all callable definers use an empty search path', () => {
    clean.split(/create (?:or replace )?function /).slice(1).forEach(definition => {
      const header=definition.split('as $$')[0]
      expect(header).toMatch(/set search_path\s*=\s*''/)
      if(!definition.startsWith('public.person_identity_history_immutable()')) expect(header).toContain('security definer')
    })
  })

  test('historical complaint parties remain valid while stable identities are XOR constrained', () => {
    const alteration=clean.split('alter table public.complaint_parties')[1].split('create index complaint_parties_resident_idx')[0]
    expect(clean).toContain('check(not (resident_id is not null and external_person_id is not null))')
    expect(alteration).not.toMatch(/resident_id uuid not null|external_person_id uuid not null/)
    expect(clean).toContain('create function public.guard_complaint_party_identity()')
    expect(clean).toContain('new.resident_id is not null and new.external_person_id is not null')
  })

  test('stable resident identity must agree with a legacy linked profile and registry is metadata only', () => {
    expect(clean).toContain('r.id=new.resident_id and r.profile_id=new.profile_id')
    expect(clean).toContain('r.id=p_person_id and r.profile_id=v_party.profile_id')
    const guard=clean.split('create function public.guard_complaint_party_identity()')[1].split('end; $$;')[0]
    expect(guard).not.toContain('registry_entry_id')
    expect(sql).toContain('residents_registry remains')
  })

  test('legacy complaint link RPC is replaced and cannot bypass the identity trigger', () => {
    expect(clean).toContain('create or replace function public.link_complaint_party(p_party_id uuid,p_record_kind text,p_record_id uuid)')
    expect(clean).toContain('create trigger complaint_party_identity_guard before insert or update of profile_id,resident_id,external_person_id')
    expect(clean).toContain("raise exception 'external identity conflicts with the linked resident profile'")
  })

  test('ordinary external-to-resident linking is insert-once, idempotent, and rejects remapping', () => {
    const normal=clean.split('create function public.link_external_person_to_resident')[1].split('end; $$;')[0]
    expect(normal).toContain('if v_existing=p_resident_id then return')
    expect(normal).toContain('already linked to a different resident')
    expect(normal).not.toContain('on conflict')
    expect(normal).not.toContain('update public.external_person_resident_links')
  })

  test('dedicated mapping correction is admin-only, reasoned, and preserves old/new UUIDs', () => {
    const correction=clean.split('create function public.correct_external_person_resident_link')[1].split('end; $$;')[0]
    expect(correction).toContain('perform public.person_history_require_admin()')
    expect(correction).toContain("raise exception 'a correction reason is required'")
    expect(correction).toContain('external_person_resident_link_history(external_person_id,previous_resident_id,new_resident_id,corrected_by,reason)')
    expect(clean).toContain('external_person_resident_link_history_immutable before update or delete')
  })

  test('incident identity, role, and outcome corrections preserve immutable before/after history', () => {
    expect(clean).toContain('create table public.incident_party_history')
    expect(clean).toContain('v_identity_changed:=')
    expect(clean).toContain('v_role_changed:=')
    expect(clean).toContain('v_outcome_changed:=')
    expect(clean).toContain('previous_resident_id,previous_external_person_id')
    expect(clean).toContain('new_resident_id,new_external_person_id')
    expect(clean).toContain('incident_party_history_immutable before update or delete')
  })

  test('exact duplicate resident/external roles are blocked while different roles remain possible', () => {
    expect(clean).toContain('on public.incident_parties(incident_id,resident_id,role) where resident_id is not null')
    expect(clean).toContain('on public.incident_parties(incident_id,external_person_id,role) where external_person_id is not null')
    expect(clean).not.toContain('on public.incident_parties(incident_id,resident_id) where')
  })

  test('respondent and subject remain neutral and closed is procedural only', () => {
    expect(clean).toContain("outcome_status text not null default 'not_determined'")
    expect(sql).toContain('closed is procedural record closure only; it is not substantiation or proof of responsibility.')
    expect(clean).not.toMatch(/role\s*=\s*'(respondent|subject)'[\s\S]{0,100}substantiated/)
  })

  test('complaint history is grouped once and nests multiple linked incident references', () => {
    expect(clean).toContain('array_agg(distinct cp.party_role order by cp.party_role) roles')
    expect(clean).toContain('linked_incident_references')
    expect(clean).toContain('group by c.id,c.reference,c.created_at,c.category,c.status')
    expect(clean).toContain("'matter_key','complaint:'||q.complaint_id::text")
    expect(clean).toContain("'matter_key','incident:'||p.incident_id::text")
  })

  test('history tables are private and corrections have no Community Credit side effects', () => {
    expect(clean).toContain('public.external_person_resident_link_history,')
    expect(clean).toContain('public.incident_parties,public.incident_party_history')
    expect(clean).not.toMatch(/(?:insert into|update|delete from) public\.community_credit_/)
    expect(clean).not.toContain('community_credit_enrollments')
  })

  test('broad incident-party viewing omits address and involvement notes', () => {
    const view=clean.split('create function public.incident_parties_for')[1].split('end; $$;')[0]
    expect(view).not.toContain('address_snapshot')
    expect(view).not.toContain('involvement_note')
  })

  test('view and correction authority exclude resident, ordinary official, and Tanod mutation', () => {
    const admin=clean.split('create function public.person_history_require_admin()')[1].split('end; $$;')[0]
    const correction=clean.split('create function public.correct_external_person_resident_link')[1].split('end; $$;')[0]
    expect(clean).toContain('public.current_official_is_active()')
    expect(admin).toContain('public.current_official_may_administer_records()')
    expect(correction).toContain('perform public.person_history_require_admin()')
    expect(correction).not.toMatch(/role\s*=\s*'(resident|tanod)'/)
  })
})

test('People & History distinguishes resident and external results without displaying UUIDs', async () => {
  api.searchPeople.mockResolvedValue([
    { person_kind: 'resident', person_id: 'resident-1', full_name: 'Ana One', secondary_text: 'Purok 1' },
    { person_kind: 'external', person_id: 'external-1', full_name: 'Ana One', secondary_text: 'External person' },
  ])
  render(<PeopleHistory canManage />)
  fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Ana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(await screen.findByText('Batinguel Resident')).toBeInTheDocument()
  expect(screen.getByText('External Person')).toBeInTheDocument()
  expect(screen.getByText('Purok 1')).toBeInTheDocument()
  expect(screen.queryByText('resident-1')).not.toBeInTheDocument()
  expect(screen.queryByText('external-1')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'View history' })).toHaveLength(2)
})

test('incident party linking sends the selected UUID and a neutral default outcome', async () => {
  api.searchPeople.mockResolvedValue([{ person_kind: 'external', person_id: 'external-1', full_name: 'Pat Example' }])
  api.saveIncidentParty.mockResolvedValue('party-1')
  render(<IncidentParties incidentId="incident-1" canManage />)
  fireEvent.click(screen.getByRole('button', { name: /Add person/ }))
  fireEvent.change(screen.getByLabelText('1. Role'), { target: { value: 'reporting_party' } })
  fireEvent.change(screen.getByLabelText('Search Batinguel residents or external people'), { target: { value: 'Pat' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Select' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add person' }))
  await waitFor(() => expect(api.saveIncidentParty).toHaveBeenCalledWith(expect.objectContaining({ incidentId: 'incident-1', kind: 'external', personId: 'external-1', role: 'reporting_party', outcome: 'not_determined' })))
})

test('mapped external person is clearly presented as linked without auto-merging', async () => {
  api.searchPeople.mockResolvedValue([{ person_kind: 'external', person_id: 'external-1', full_name: 'Pat Example', secondary_text: 'External person' }])
  api.loadPersonHistory.mockResolvedValue({ identity: { kind: 'external', id: 'external-1', full_name: 'Pat Example', credit_applicable: false, linked_resident_id: 'resident-1', linked_resident_name: 'Pat Resident' }, incidents: [], complaints: [], timeline: [] })
  render(<PeopleHistory />)
  fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Pat' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  fireEvent.click((await screen.findAllByRole('button', { name: 'View history' }))[0])
  expect((await screen.findAllByText(/Linked to current resident record/)).find(node=>node.textContent.includes('Pat Resident'))).toBeTruthy()
  expect(screen.queryByText('resident-1')).not.toBeInTheDocument()
  expect(screen.queryByText('external-1')).not.toBeInTheDocument()
  expect(screen.queryByText(/dangerous|repeat offender|high risk|suspicious/i)).not.toBeInTheDocument()
})

test('two external people with the same name remain separate through locality, without visible UUIDs', async () => {
  api.searchPeople.mockResolvedValue([
    { person_kind: 'external', person_id: 'external-1', full_name: 'Same Name', secondary_text: 'Purok A' },
    { person_kind: 'external', person_id: 'external-2', full_name: 'Same Name', secondary_text: 'Purok B' },
  ])
  render(<PeopleHistory />)
  fireEvent.change(screen.getByLabelText('Search people'), { target: { value: 'Same' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(await screen.findAllByText('Same Name')).toHaveLength(2)
  expect(screen.getByText('Purok A')).toBeInTheDocument()
  expect(screen.getByText('Purok B')).toBeInTheDocument()
  expect(screen.queryByText('external-1')).not.toBeInTheDocument()
  expect(screen.queryByText('external-2')).not.toBeInTheDocument()
})

test('person history uses factual overview and meaningful empty states', async () => {
  api.searchPeople.mockResolvedValue([{ person_kind:'resident',person_id:'resident-1',full_name:'Ana One',secondary_text:'Purok 1' }])
  api.loadPersonHistory.mockResolvedValue({identity:{kind:'resident',id:'resident-1',full_name:'Ana One',purok:'Purok 1',resident_status:'active',credit_applicable:true},incidents:[],complaints:[],timeline:[]})
  render(<PeopleHistory />)
  fireEvent.change(screen.getByLabelText('Search people'),{target:{value:'Ana'}});fireEvent.click(screen.getByRole('button',{name:'Search'}))
  fireEvent.click((await screen.findAllByRole('button',{name:'View history'}))[0])
  expect(await screen.findByText('Resident status')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab',{name:'Incidents & Blotter'}))
  expect(screen.getByText('No linked incident or blotter records yet.')).toBeInTheDocument()
  expect(screen.queryByText('resident-1')).not.toBeInTheDocument()
})
