import { useState } from 'react'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import ResidentProfileDialog from './ResidentProfileDialog'
import ResidentDirectory from './ResidentDirectory'
import { supabase } from '../supabase/supabaseClient'
import { residentBirthDateLabel, residentMobileLabel } from './residentProfileDisplay'
import { incidentDate } from '../incidents/incidentLabels'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))

const resident=Object.freeze({id:'private-resident-uuid',profile_id:'private-profile-uuid',first_name:'Ana',last_name:'Cruz',resident_status:'active',purok:'1',birth_date:'1965-03-22',mobile_number:'09982971260'})
const profile={id:resident.profile_id,photo_url:'https://example.test/resident.jpg',verification_status:'verified'}
const friday=day=>`2026-10-${day}T13:30:00Z`
const HISTORY={
  identity:{kind:'resident',id:resident.id,full_name:'Ana Cruz'},
  incidents:[
    {incident_id:'i1',matter_key:'incident:i1',reference:'INC-2026-AAAAAA',occurred_at:friday('02'),type:'disturbance',status:'resolved',role:'victim',outcome:'not_determined',blotter_reference:'BLT-2026-AAAAAA'},
    {incident_id:'i1',matter_key:'incident:i1',reference:'INC-2026-AAAAAA',occurred_at:friday('02'),type:'disturbance',status:'resolved',role:'witness',outcome:'not_determined',blotter_reference:'BLT-2026-AAAAAA'},
    {incident_id:'i2',matter_key:'incident:i2',reference:'INC-2026-BBBBBB',occurred_at:friday('09'),type:'threat',status:'recorded',role:'respondent',outcome:'not_determined'},
  ],
  complaints:[{complaint_id:'c1',matter_key:'complaint:c1',reference:'CMP-2026-CCCCCC',created_at:'2026-10-20T03:00:00Z',category:'noise',status:'received',roles:['respondent']}],
  timeline:[
    {kind:'complaint',occurred_at:'2026-10-20T03:00:00Z',matter_key:'complaint:c1',record:{reference:'CMP-2026-CCCCCC'}},
    {kind:'incident',occurred_at:friday('09'),matter_key:'incident:i2',record:{reference:'INC-2026-BBBBBB'}},
    {kind:'incident',occurred_at:friday('02'),matter_key:'incident:i1',record:{reference:'INC-2026-AAAAAA'}},
  ],
}
const ANALYTICS={contributing_matters:[
  ...['02','09','16','23','30'].map(d=>({matter_key:`incident:f${d}`,kind:'incident',reference:`INC-F${d}`,occurred_at:friday(d),category:'disturbance',area:'Purok 2',role:'respondent',outcome:'not_determined'})),
  {matter_key:'complaint:c1',kind:'complaint',reference:'CMP-2026-CCCCCC',occurred_at:'2026-10-20T03:00:00Z',category:'noise',area:'Restricted',role:'respondent',outcome:'unknown'},
]}
const CREDIT={configured:true,enrolled:true,policy_name:'Community Credit v1',current_score:100,maximum_score:100,minimum_score:0,starting_score:100,event_total:0,positive_event_count:0,negative_event_count:0,repair_event_count:0,ledger:[]}

let responses
beforeEach(()=>{
  supabase.rpc.mockReset()
  responses={person_history:{data:HISTORY,error:null},person_analytics:{data:ANALYTICS,error:null},community_credit_profile:{data:CREDIT,error:null},barangay_resident_directory:{data:[resident],error:null}}
  supabase.rpc.mockImplementation(async name=>responses[name]||{data:null,error:{code:'PGRST202'}})
})
const open=(props={})=>render(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} onEdit={()=>{}} canViewRestricted {...props}/>)
const dialog=()=>screen.getByRole('dialog',{name:'Resident Profile'})
const heading=()=>dialog().querySelector('.resident-profile-heading')
const card=label=>within(dialog().querySelector('.rp-summary')).getByText(label).closest('div')
const tab=name=>screen.getByRole('tab',{name})

describe('header, summary cards and tabs',()=>{
  test('header shows avatar, name, status, purok and Edit for authorized officials',async()=>{
    open()
    const head=within(heading())
    expect(head.getByRole('img',{name:'Ana Cruz profile'})).toHaveAttribute('src',profile.photo_url)
    expect(head.getByRole('heading',{name:'Ana Cruz'})).toBeVisible()
    expect(head.getByText('Active')).toBeVisible();expect(head.getByText('Purok 1')).toBeVisible()
    expect(head.getByRole('button',{name:'Edit Resident'})).toBeVisible()
    expect(heading()).not.toHaveTextContent(/linked/i)
    await waitFor(()=>expect(card('Incident records')).toHaveTextContent('2'))
  })

  test('summary cards count records separately and never sum incidents with complaints',async()=>{
    open()
    await waitFor(()=>expect(card('Incident records')).toHaveTextContent('2'))
    expect(card('Complaint records')).toHaveTextContent('1')
    expect(card('Resolved or closed incidents')).toHaveTextContent('1')
    expect(dialog().querySelector('.rp-summary')).not.toHaveTextContent(/\b3\b/)
  })

  test('summary cards say Loading..., then Unavailable when history fails -- never 0',async()=>{
    let release;responses.person_history=new Promise(r=>{release=r})
    supabase.rpc.mockImplementation(name=>name==='person_history'?responses.person_history:Promise.resolve(responses[name]))
    open()
    expect(card('Incident records')).toHaveTextContent('Loading...')
    release({data:null,error:{code:'08006'}})
    await waitFor(()=>expect(card('Incident records')).toHaveTextContent('Unavailable'))
    expect(card('Resolved or closed incidents')).toHaveTextContent('Unavailable')
    expect(dialog().querySelector('.rp-summary')).not.toHaveTextContent(/\b0\b/)
  })

  test('four tabs, Information selected, with a full tabs pattern',()=>{
    open()
    const tabs=screen.getAllByRole('tab')
    expect(tabs.map(t=>t.textContent)).toEqual(['Information','History','Analytics','Community Credit'])
    expect(tab('Information')).toHaveAttribute('aria-selected','true');expect(tab('Information')).toHaveAttribute('tabindex','0')
    tabs.slice(1).forEach(t=>{expect(t).toHaveAttribute('aria-selected','false');expect(t).toHaveAttribute('tabindex','-1')})
    tabs.forEach(t=>{const panel=document.getElementById(t.getAttribute('aria-controls'));expect(panel).toHaveAttribute('role','tabpanel');expect(panel).toHaveAttribute('aria-labelledby',t.id)})
    expect(screen.getByRole('tablist',{name:'Resident profile sections'})).toBeInTheDocument()
  })

  test('arrow keys, Home and End move selection and focus',()=>{
    open()
    tab('Information').focus()
    fireEvent.keyDown(tab('Information'),{key:'ArrowRight'});expect(tab('History')).toHaveFocus();expect(tab('History')).toHaveAttribute('aria-selected','true')
    fireEvent.keyDown(tab('History'),{key:'End'});expect(tab('Community Credit')).toHaveFocus()
    fireEvent.keyDown(tab('Community Credit'),{key:'ArrowRight'});expect(tab('Information')).toHaveFocus()
    fireEvent.keyDown(tab('Information'),{key:'ArrowLeft'});expect(tab('Community Credit')).toHaveFocus()
    fireEvent.keyDown(tab('Community Credit'),{key:'Home'});expect(tab('Information')).toHaveFocus()
  })
})

describe('Information tab',()=>{
  test('consolidates personal and account details with no technical identifiers',()=>{
    open()
    const personal=within(screen.getByRole('region',{name:'Personal Information'}))
    expect(personal.getByText('March 22, 1965')).toBeVisible();expect(personal.getByText('0998 297 1260')).toBeVisible()
    expect(personal.getByText('Ana Cruz')).toBeVisible();expect(personal.getByText('Purok 1')).toBeVisible();expect(personal.getByText('Active')).toBeVisible()
    const account=within(screen.getByRole('region',{name:'Account Information'}))
    expect(account.getByText('Linked')).toBeVisible();expect(account.getByText('Verified')).toBeVisible()
    expect(within(dialog()).getAllByText('Linked')).toHaveLength(1)
    expect(dialog()).not.toHaveTextContent(/private-.*uuid|profile_id|Senior Citizen|civil status/i)
  })

  test('a field the directory reader withheld reads as restricted, not as missing',()=>{
    const restricted={id:'resident-only-id',first_name:'Lina',last_name:'Santos',resident_status:'active',purok:'2',account_linked:true}
    render(<ResidentProfileDialog resident={restricted} profile={null} onClose={()=>{}} onEdit={null}/>)
    const personal=within(screen.getByRole('region',{name:'Personal Information'}))
    expect(personal.getAllByText('Not shown to your account')).toHaveLength(2)
    expect(within(screen.getByRole('region',{name:'Account Information'})).getByText('Linked')).toBeVisible()
    expect(screen.queryByRole('button',{name:'Edit Resident'})).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(/profile_id|profile uuid/i)
  })

  test('a recorded-but-empty field still reads Not recorded',()=>{
    open({resident:{...resident,birth_date:null,mobile_number:''}})
    expect(within(screen.getByRole('region',{name:'Personal Information'})).getAllByText('Not recorded')).toHaveLength(2)
  })

  test('inactive status and initials fallback, including a failed photo',()=>{
    const {rerender}=render(<ResidentProfileDialog resident={{...resident,resident_status:'inactive'}} profile={null} onClose={()=>{}} onEdit={()=>{}}/>)
    expect(screen.getByLabelText('Ana Cruz initials')).toHaveTextContent('AC');expect(within(heading()).getByText('Inactive')).toBeVisible()
    rerender(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} onEdit={()=>{}}/>)
    fireEvent.error(screen.getByRole('img',{name:'Ana Cruz profile'}));expect(screen.getByLabelText('Ana Cruz initials')).toHaveTextContent('AC')
  })
})

describe('History tab',()=>{
  test('incidents keep source references, dates, statuses and every role, once per incident',async()=>{
    open();fireEvent.click(tab('History'))
    const records=await screen.findAllByText(/^INC-2026-/)
    expect(records.map(r=>r.textContent)).toEqual(['INC-2026-AAAAAA','INC-2026-BBBBBB'])
    const first=within(records[0].closest('li'))
    expect(first.getByText(`Disturbance · ${incidentDate(friday('02'))}`)).toBeInTheDocument()
    expect(first.getByText('Status: Resolved')).toBeInTheDocument()
    expect(first.getByText('Role: Victim, Witness')).toBeInTheDocument()
    expect(first.getByText('Blotter: BLT-2026-AAAAAA')).toBeInTheDocument()
  })

  test('records staff can switch to complaints and the timeline',async()=>{
    open();fireEvent.click(tab('History'))
    await screen.findByText('INC-2026-AAAAAA')
    fireEvent.click(screen.getByRole('button',{name:'Complaints & KP'}))
    expect(screen.getByRole('button',{name:'Complaints & KP'})).toHaveAttribute('aria-pressed','true')
    expect(screen.getByText('CMP-2026-CCCCCC')).toBeInTheDocument();expect(screen.getByText('Status: Received')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Timeline'}))
    expect(within(dialog().querySelector('.rp-timeline')).getAllByRole('listitem')).toHaveLength(3)
  })

  test('an ordinary official sees no complaint record, count, category or timeline entry',async()=>{
    open({canViewRestricted:false,onEdit:null});fireEvent.click(tab('History'))
    await screen.findByText('INC-2026-AAAAAA')
    expect(screen.queryByRole('button',{name:'Complaints & KP'})).not.toBeInTheDocument()
    expect(screen.getByText(/shown only to authorized records staff/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Timeline'}))
    expect(within(dialog().querySelector('.rp-timeline')).getAllByRole('listitem')).toHaveLength(2)
    expect(dialog()).not.toHaveTextContent(/CMP-2026-CCCCCC|Noise|Complaint records/)
  })

  test('empty history says so; a failed history says it is unavailable',async()=>{
    responses.person_history={data:{incidents:[],complaints:[],timeline:[]},error:null}
    const {unmount}=open();fireEvent.click(tab('History'))
    expect(await screen.findByText('No linked incident or blotter records yet.')).toBeInTheDocument()
    await waitFor(()=>expect(card('Incident records')).toHaveTextContent('0'))
    unmount()
    responses.person_history={data:null,error:{code:'08006'}}
    open();fireEvent.click(tab('History'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Linked history is unavailable or your account cannot view it.')
  })
})

describe('Analytics tab',()=>{
  test('descriptive figures and a factual pattern sentence, no rating language',async()=>{
    open();fireEvent.click(tab('Analytics'))
    expect(await screen.findByText('Five linked incidents were recorded on Fridays between 8 PM and 11:59 PM during the selected period.')).toBeInTheDocument()
    const panel=within(document.getElementById(tab('Analytics').getAttribute('aria-controls')))
    expect(panel.getByText('Linked incidents').closest('div')).toHaveTextContent('5')
    expect(panel.getByText('Linked complaints').closest('div')).toHaveTextContent('1')
    expect(panel.getByRole('heading',{name:'Incident categories'})).toBeInTheDocument()
    expect(document.getElementById(tab('Analytics').getAttribute('aria-controls'))).not.toHaveTextContent(/danger|high-risk|habitual|offender|punish|recommend/i)
  })

  test('an ordinary official gets incident figures only',async()=>{
    open({canViewRestricted:false});fireEvent.click(tab('Analytics'))
    await screen.findByText(/Five linked incidents/)
    expect(screen.queryByText('Linked complaints')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Complaint categories'})).not.toBeInTheDocument()
    expect(screen.queryByText('Noise')).not.toBeInTheDocument()
  })

  test('presets filter in Manila time; a range with no records shows none rather than inventing them',async()=>{
    open();fireEvent.click(tab('Analytics'))
    await screen.findByText(/Five linked incidents/)
    fireEvent.change(screen.getByLabelText('Period'),{target:{value:'custom'}})
    expect(screen.getByRole('status')).toHaveTextContent('Choose a start date')
    fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-10-26'}})
    fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-11-01'}})
    expect(screen.getByText('Linked incidents').closest('div')).toHaveTextContent('1')
    expect(screen.queryByText(/linked incidents were recorded/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('From'),{target:{value:'2027-01-01'}});fireEvent.change(screen.getByLabelText('To'),{target:{value:'2027-01-31'}})
    expect(screen.getByText('Linked incidents').closest('div')).toHaveTextContent('0')
    expect(screen.getAllByText('No linked records in this period.').length).toBeGreaterThan(0)
  })

  test.each([
    [{code:'PGRST202'},/need a database update \(migration 062\)/],
    [{code:'42501'},/not available for this account/],
    [{code:'08006'},/unavailable right now/],
  ])('analytics failure %p reads clearly and the history still loads',async(error,message)=>{
    responses.person_analytics={data:null,error}
    open();fireEvent.click(tab('Analytics'))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    await waitFor(()=>expect(card('Incident records')).toHaveTextContent('2'))
  })
})

describe('Community Credit tab',()=>{
  test('loads the existing credit profile only when opened, on the current 100-point model',async()=>{
    open()
    await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('person_history',expect.anything()))
    expect(supabase.rpc).not.toHaveBeenCalledWith('community_credit_profile',expect.anything())
    fireEvent.click(tab('Community Credit'))
    expect(await screen.findByLabelText('Current community credit score 100 out of 100')).toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'Community Credit v1'})).toBeInTheDocument()
    expect(screen.getByText('No credit events recorded.')).toBeInTheDocument()
    expect(supabase.rpc).toHaveBeenCalledWith('community_credit_profile',{p_resident_id:resident.id})
    expect(screen.queryByText(/Public-Safety History/)).not.toBeInTheDocument()
    fireEvent.click(tab('Information'));fireEvent.click(tab('Community Credit'))
    expect(supabase.rpc.mock.calls.filter(([n])=>n==='community_credit_profile')).toHaveLength(1)
  })

  test('an unavailable credit profile says so',async()=>{
    responses.community_credit_profile={data:null,error:{code:'42501'}}
    open();fireEvent.click(tab('Community Credit'))
    expect(await screen.findByText('Community credit information is unavailable. Please try again later.')).toBeInTheDocument()
  })

  test('the profile computes no score of its own',()=>{
    const source=fs.readFileSync(path.join(__dirname,'ResidentProfileDialog.jsx'),'utf8')+fs.readFileSync(path.join(__dirname,'residentProfileData.js'),'utf8')
    expect(source).not.toMatch(/current_score|points_delta|starting_score|event_total/)
  })
})

describe('opening and editing through the directory',()=>{
  test('opens by the stable directory id and Edit keeps original saved values',async()=>{
    render(<ResidentDirectory profiles={[profile]}/>);fireEvent.click(await screen.findByRole('button',{name:'Ana Cruz'}))
    await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('person_history',{p_person_kind:'resident',p_person_id:resident.id}))
    expect(supabase.rpc).toHaveBeenCalledWith('person_analytics',{p_person_kind:'resident',p_person_id:resident.id,p_from:null,p_to:null,p_window:'all'})
    expect(supabase.rpc).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button',{name:'Edit Resident'}))
    await screen.findByRole('dialog',{name:'Edit Resident'})
    expect(screen.getByLabelText('Birth date (optional)')).toHaveValue('1965-03-22');expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue('09982971260')
  })

  test('the directory gives complaint visibility only to the officials who manage it',()=>{
    const source=fs.readFileSync(path.join(__dirname,'ResidentDirectory.jsx'),'utf8')
    expect(source).toMatch(/canViewRestricted=\{canManage\}/)
    expect(fs.readFileSync(path.join(__dirname,'ResidentProfileDialog.jsx'),'utf8')).toMatch(/canViewRestricted = false/)
  })

  test('Escape, close label, scroll lock and focus return survive the tabbed layout',async()=>{
    function Harness(){const [isOpen,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open profile</button>{isOpen&&<ResidentProfileDialog resident={resident} onClose={()=>setOpen(false)} onEdit={()=>{}}/>}</>}
    render(<Harness/>);const opener=screen.getByRole('button',{name:'Open profile'});opener.focus();fireEvent.click(opener)
    expect(screen.getByRole('button',{name:'Close resident profile'})).toHaveFocus();expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(opener).toHaveFocus();expect(document.body.style.overflow).not.toBe('hidden')
  })
})

describe('responsive rules (stylesheet)',()=>{
  const css=fs.readFileSync(path.join(__dirname,'ResidentProfileDialog.css'),'utf8')
  test('no bare 1fr track; tabs at least 44px; narrow screens stack figures and pair tabs',()=>{
    const added=css.slice(css.indexOf('Unified profile'))
    expect(added).not.toMatch(/repeat\(\d+,\s*1fr\)|:\s*1fr\b/)
    expect(added).toMatch(/\[role="tab"\] \{[^}]*min-height:44px/)
    expect(added).toMatch(/@media \(max-width:600px\)[\s\S]*rp-figures-grid \{ grid-template-columns:minmax\(0,1fr\)/)
    expect(added).toMatch(/prefers-reduced-motion: reduce[\s\S]*transition:none/)
  })
})

test.each([['09982971260','0998 297 1260'],['0998-297-1260','0998 297 1260'],['+639982971260','+63 998 297 1260'],['639982971260','63 998 297 1260'],['035 226 2931','035 226 2931'],['unrecognized','unrecognized'],[null,'Not recorded']])('mobile formatting is display-only: %s',(raw,label)=>expect(residentMobileLabel(raw)).toBe(label))
test.each([['1965-03-22','March 22, 1965'],['2000-02-29','February 29, 2000'],['2026-02-30','2026-02-30'],[null,'Not recorded']])('birth-date formatting is calendar-safe: %s',(raw,label)=>expect(residentBirthDateLabel(raw)).toBe(label))
