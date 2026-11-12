import { useState } from 'react'
import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import ResidentProfileDialog from './ResidentProfileDialog'
import ResidentDirectory from './ResidentDirectory'
import { supabase } from '../supabase/supabaseClient'
import { residentBirthDateLabel, residentMobileLabel } from './residentProfileDisplay'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))
const resident=Object.freeze({id:'private-resident-uuid',profile_id:'private-profile-uuid',first_name:'Ana',last_name:'Cruz',resident_status:'active',purok:'1',birth_date:'1965-03-22',mobile_number:'09982971260'})
const profile={id:resident.profile_id,photo_url:'https://example.test/resident.jpg',verification_status:'verified'}
test('profile summary and two detail groups show actual data with no technical identifiers',()=>{
 render(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} onEdit={()=>{}}/> )
 const dialog=screen.getByRole('dialog',{name:'Resident Profile'})
 expect(within(dialog).getByRole('img',{name:'Ana Cruz profile'})).toHaveAttribute('src',profile.photo_url)
 expect(within(dialog).getByRole('heading',{name:'Ana Cruz'})).toBeVisible()
 expect(within(dialog).getByText('Active')).toBeVisible();expect(within(dialog).getByText('Purok 1')).toBeVisible()
 const personal=within(within(dialog).getByRole('region',{name:'Personal Information'}))
 expect(personal.getByText('March 22, 1965')).toBeVisible();expect(personal.getByText('0998 297 1260')).toBeVisible()
 const account=within(within(dialog).getByRole('region',{name:'Account Information'}))
 expect(within(dialog).getAllByText('Linked')).toHaveLength(1)
 expect(dialog.querySelector('.resident-profile-heading')).not.toHaveTextContent(/linked/i)
 expect(within(dialog).queryByText('Explicitly linked')).not.toBeInTheDocument()
 expect(account.getByText('Linked')).toBeVisible();expect(account.getByText('Verified')).toBeVisible()
 expect(dialog).not.toHaveTextContent(/private-.*uuid|profile_id|Senior Citizen|civil status/i)
 expect(resident.mobile_number).toBe('09982971260');expect(resident.birth_date).toBe('1965-03-22')
})
test('restricted Resident 360 uses account_linked without a profile UUID',()=>{
 const restricted={id:'resident-only-id',first_name:'Lina',last_name:'Santos',resident_status:'active',purok:'2',account_linked:true}
 render(<ResidentProfileDialog resident={restricted} profile={null} onClose={()=>{}} onEdit={null}/>)
 const account=within(screen.getByRole('region',{name:'Account Information'}))
 expect(account.getByText('Linked')).toBeVisible()
 expect(screen.queryByRole('button',{name:'Edit Resident'})).not.toBeInTheDocument()
 expect(document.body).not.toHaveTextContent(/profile_id|profile uuid/i)
})
test('inactive status and initials fallback remain clear, including failed photo fallback',()=>{
 const {rerender}=render(<ResidentProfileDialog resident={{...resident,resident_status:'inactive'}} profile={null} onClose={()=>{}} onEdit={()=>{}}/> )
 expect(screen.getByLabelText('Ana Cruz initials')).toHaveTextContent('AC');expect(screen.getByText('Inactive')).toBeVisible()
 rerender(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} onEdit={()=>{}}/> )
 fireEvent.error(screen.getByRole('img',{name:'Ana Cruz profile'}));expect(screen.getByLabelText('Ana Cruz initials')).toHaveTextContent('AC')
})
test('Edit opens existing form with original unformatted saved values',async()=>{
 supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:[resident],error:null})
 render(<ResidentDirectory canManage profiles={[profile]}/>);fireEvent.click(await screen.findByRole('button',{name:'Ana Cruz'}));fireEvent.click(screen.getByRole('button',{name:'Edit Resident'}))
 await screen.findByRole('dialog',{name:'Edit Resident'})
 expect(screen.getByLabelText('Birth date (optional)')).toHaveValue('1965-03-22');expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue('09982971260')
 expect(supabase.rpc).toHaveBeenCalledTimes(2)
 expect(supabase.rpc).toHaveBeenCalledWith('community_credit_profile',{p_resident_id:resident.id})
})
test('Escape, close label, scroll lock and focus return survive presentation wrapper',async()=>{
 function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open profile</button>{open&&<ResidentProfileDialog resident={resident} onClose={()=>setOpen(false)} onEdit={()=>{}}/>}</>}
 render(<Harness/>);const opener=screen.getByRole('button',{name:'Open profile'});opener.focus();fireEvent.click(opener)
 expect(screen.getByRole('button',{name:'Close resident profile'})).toHaveFocus();expect(document.body.style.overflow).toBe('hidden')
 fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(opener).toHaveFocus();expect(document.body.style.overflow).not.toBe('hidden')
})
test.each([['09982971260','0998 297 1260'],['0998-297-1260','0998 297 1260'],['+639982971260','+63 998 297 1260'],['639982971260','63 998 297 1260'],['035 226 2931','035 226 2931'],['unrecognized','unrecognized'],[null,'Not recorded']])('mobile formatting is display-only: %s',(raw,label)=>expect(residentMobileLabel(raw)).toBe(label))
test.each([['1965-03-22','March 22, 1965'],['2000-02-29','February 29, 2000'],['2026-02-30','2026-02-30'],[null,'Not recorded']])('birth-date formatting is calendar-safe: %s',(raw,label)=>expect(residentBirthDateLabel(raw)).toBe(label))

test('four accessible tabs switch with arrows, Home and End without history or analytics requests',async()=>{
 supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:null,error:null})
 render(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} />)
 expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['Information','History','Analytics','Community Credit'])
 const info=screen.getByRole('tab',{name:'Information'});info.focus();fireEvent.keyDown(info,{key:'ArrowRight'})
 expect(screen.getByRole('tab',{name:'History'})).toHaveFocus()
 expect(screen.getByRole('tabpanel')).toHaveTextContent('No history records have been requested')
 fireEvent.keyDown(screen.getByRole('tab',{name:'History'}),{key:'ArrowRight'})
 expect(screen.getByRole('tabpanel')).toHaveTextContent('unavailable data does not mean zero records')
 fireEvent.keyDown(screen.getByRole('tab',{name:'Analytics'}),{key:'End'})
 expect(screen.getByRole('tab',{name:'Community Credit'})).toHaveFocus()
 fireEvent.keyDown(screen.getByRole('tab',{name:'Community Credit'}),{key:'Home'})
 expect(info).toHaveFocus();expect(info).toHaveAttribute('aria-selected','true')
 expect(supabase.rpc.mock.calls.map(([name])=>name)).toEqual(['community_credit_profile'])
})

test('restricted fields and mismatched account metadata are not presented as resident data',()=>{
 supabase.rpc.mockResolvedValue({data:null,error:null})
 render(<ResidentProfileDialog resident={{id:'restricted',first_name:'Unit',last_name:'Resident',account_linked:true}} profile={profile} onClose={()=>{}} />)
 expect(screen.getAllByText('Not shown to your account')).toHaveLength(2)
 expect(screen.queryByRole('img')).not.toBeInTheDocument()
 expect(screen.queryByText('Verified')).not.toBeInTheDocument()
 expect(screen.getByText('Status unavailable')).toBeVisible()
})

test('selected-resident changes reset tabs and cannot reuse an earlier credit response',async()=>{
 let resolveOld
 supabase.rpc.mockReset();supabase.rpc.mockImplementation((name,{p_resident_id})=>p_resident_id===resident.id?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve({data:null,error:null}))
 const {rerender}=render(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('tab',{name:'Community Credit'}))
 expect(screen.getByRole('status')).toHaveTextContent('Loading')
 rerender(<ResidentProfileDialog resident={{...resident,id:'second-resident',profile_id:null,first_name:'Second'}} profile={profile} onClose={()=>{}} />)
 expect(screen.getByRole('tab',{name:'Information'})).toHaveAttribute('aria-selected','true')
 await waitFor(()=>expect(supabase.rpc).toHaveBeenCalledWith('community_credit_profile',{p_resident_id:'second-resident'}))
 resolveOld({data:{configured:true,enrolled:true,current_score:42,maximum_score:100,policy_name:'Old response',ledger:[]},error:null})
 fireEvent.click(screen.getByRole('tab',{name:'Community Credit'}))
 await waitFor(()=>expect(screen.queryByText('Old response')).not.toBeInTheDocument())
 expect(screen.queryByRole('img',{name:/score 42/})).not.toBeInTheDocument()
})

test('Community Credit tab reuses the V1 server score, policy and immutable ledger display',async()=>{
 supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:{configured:true,enrolled:true,current_score:97,maximum_score:100,starting_score:100,policy_name:'Unit V1 policy',event_total:-3,positive_event_count:0,negative_event_count:1,repair_event_count:0,ledger:[{id:'unit-event',event:'Unit recorded adjustment',category:'negative',points:-3,source:'manual',verified_by:'Unit verifier'}]},error:null})
 render(<ResidentProfileDialog resident={resident} profile={profile} onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('tab',{name:'Community Credit'}))
 expect(await screen.findByRole('img',{name:/Current community credit score 97 out of 100/})).toBeVisible()
 expect(screen.getByText('Policy: Unit V1 policy')).toBeVisible()
 expect(screen.getByText('Unit recorded adjustment')).toBeVisible()
 expect(screen.queryByRole('button',{name:/approve|award|deduct/i})).not.toBeInTheDocument()
})

test('credit access errors remain visible without preventing information access',async()=>{
 supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:null,error:{code:'42501',message:'Denied'}})
 render(<ResidentProfileDialog resident={resident} onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('tab',{name:'Community Credit'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('unavailable')
 fireEvent.click(screen.getByRole('tab',{name:'Information'}))
 expect(screen.getByRole('region',{name:'Personal Information'})).toBeVisible()
})
