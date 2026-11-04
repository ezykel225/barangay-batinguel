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
 render(<ResidentDirectory profiles={[profile]}/>);fireEvent.click(await screen.findByRole('button',{name:'Ana Cruz'}));fireEvent.click(screen.getByRole('button',{name:'Edit Resident'}))
 await screen.findByRole('dialog',{name:'Edit Resident'})
 expect(screen.getByLabelText('Birth date (optional)')).toHaveValue('1965-03-22');expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue('09982971260')
 expect(supabase.rpc).toHaveBeenCalledTimes(4)
 expect(supabase.rpc).toHaveBeenCalledWith('community_credit_profile',{p_resident_id:resident.id})
 expect(supabase.rpc).toHaveBeenCalledWith('person_history',{p_person_kind:'resident',p_person_id:resident.id})
 expect(supabase.rpc).toHaveBeenCalledWith('person_analytics',{p_person_kind:'resident',p_person_id:resident.id,p_from:null,p_to:null,p_window:'all'})
})
test('Escape, close label, scroll lock and focus return survive presentation wrapper',async()=>{
 function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>Open profile</button>{open&&<ResidentProfileDialog resident={resident} onClose={()=>setOpen(false)} onEdit={()=>{}}/>}</>}
 render(<Harness/>);const opener=screen.getByRole('button',{name:'Open profile'});opener.focus();fireEvent.click(opener)
 expect(screen.getByRole('button',{name:'Close resident profile'})).toHaveFocus();expect(document.body.style.overflow).toBe('hidden')
 fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(opener).toHaveFocus();expect(document.body.style.overflow).not.toBe('hidden')
})
test.each([['09982971260','0998 297 1260'],['0998-297-1260','0998 297 1260'],['+639982971260','+63 998 297 1260'],['639982971260','63 998 297 1260'],['035 226 2931','035 226 2931'],['unrecognized','unrecognized'],[null,'Not recorded']])('mobile formatting is display-only: %s',(raw,label)=>expect(residentMobileLabel(raw)).toBe(label))
test.each([['1965-03-22','March 22, 1965'],['2000-02-29','February 29, 2000'],['2026-02-30','2026-02-30'],[null,'Not recorded']])('birth-date formatting is calendar-safe: %s',(raw,label)=>expect(residentBirthDateLabel(raw)).toBe(label))
