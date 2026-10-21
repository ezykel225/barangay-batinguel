import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import ResidentDirectory from './ResidentDirectory'
import { supabase } from '../supabase/supabaseClient'
import fs from 'fs'
import path from 'path'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))
const row={id:'directory-private-id',profile_id:'profile-private-id',first_name:'Ana',last_name:'Cruz',birth_date:'1960-02-29',mobile_number:'09171234567',purok:'Purok 1',resident_status:'active'}
beforeEach(()=>{supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:[row],error:null})})
test('name opens photo profile with no UUIDs; menu stays independent; no View button',async()=>{
 render(<ResidentDirectory profiles={[{id:row.profile_id,photo_url:'https://example.test/photo.jpg',verification_status:'verified'}]}/> )
 const name=await screen.findByRole('button',{name:'Ana Cruz'});name.focus();fireEvent.click(name)
 const dialog=screen.getByRole('dialog',{name:'Resident Profile'})
 expect(within(dialog).getByRole('img',{name:'Ana Cruz profile'})).toHaveAttribute('src','https://example.test/photo.jpg')
 expect(dialog).not.toHaveTextContent('private-id');expect(within(dialog).getByText('Linked',{selector:'dd'})).toBeVisible()
 fireEvent.keyDown(document,{key:'Escape'});expect(name).toHaveFocus();expect(screen.queryByRole('button',{name:/^View/})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('menuitem',{name:/Edit resident/}));expect(screen.getByRole('dialog',{name:'Edit Resident'})).toBeVisible()
})
test('initials fallback and profile Edit retain existing form; no edit-status bypass',async()=>{
 render(<ResidentDirectory/>);fireEvent.click(await screen.findByRole('button',{name:'Ana Cruz'}))
 expect(screen.getByLabelText('Ana Cruz initials')).toHaveTextContent('AC')
 fireEvent.click(screen.getByRole('button',{name:'Edit Resident'}));await screen.findByRole('dialog',{name:'Edit Resident'})
 expect(screen.getByLabelText('Mobile number (optional)')).toHaveValue(row.mobile_number)
 expect(document.querySelector('select[name=resident_status]')).toBeNull()
})
test('active action requires confirmation and sends exactly one atomic RPC; inactive action reactivates',async()=>{
 render(<ResidentDirectory/>);await screen.findByRole('button',{name:'Ana Cruz'})
 fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));fireEvent.click(screen.getByRole('menuitem',{name:/Mark as Not Resident/}))
 const dialog=await screen.findByRole('dialog');expect(dialog).toHaveTextContent('Historical records are preserved')
 expect(supabase.rpc).toHaveBeenCalledTimes(1)
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());expect(supabase.rpc).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));fireEvent.click(screen.getByRole('menuitem',{name:/Mark as Not Resident/}))
 supabase.rpc.mockResolvedValueOnce({data:null,error:null});fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'Mark as Not Resident'}))
 await screen.findByText('Resident marked inactive.');expect(supabase.rpc).toHaveBeenLastCalledWith('set_barangay_resident_eligibility',{p_resident_id:row.id,p_active:false})
 fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));fireEvent.click(screen.getByRole('menuitem',{name:/Reactivate resident/}))
 supabase.rpc.mockResolvedValueOnce({data:null,error:null});fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'Reactivate resident'}))
 await screen.findByText('Resident reactivated.');expect(supabase.rpc).toHaveBeenLastCalledWith('set_barangay_resident_eligibility',{p_resident_id:row.id,p_active:true})
})
test('failed RPC does not optimistically change status; totals remain unfiltered and Clear filters resets',async()=>{
 render(<ResidentDirectory/>);await screen.findByRole('button',{name:'Ana Cruz'})
 expect(screen.queryByRole('button',{name:'Clear filters'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Search residents'),{target:{value:'missing'}});expect(screen.getByText('Showing 0 of 1 residents')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));expect(screen.getByRole('button',{name:'Ana Cruz'})).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));fireEvent.click(screen.getByRole('menuitem',{name:/Mark as Not Resident/}))
 supabase.rpc.mockResolvedValueOnce({error:{message:'Denied'}});fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button',{name:'Mark as Not Resident'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Could not change eligibility'))
 expect(screen.getByText('Active',{selector:'span.badge'})).toBeVisible()
})
test('new migration grants only guarded RPC; sidebar has no standalone voter item',()=>{
 const sql=fs.readFileSync(path.join(process.cwd(),'supabase-migrations/056_resident_eligibility.sql'),'utf8').replace(/--[^\n]*/g,'')
 expect(sql).toMatch(/auth.uid\(\) is null or not coalesce\(public.current_official_may_administer_records\(\),false\)/)
 expect(sql).toMatch(/security definer set search_path = ''/)
 expect(sql).toMatch(/revoke all on function public.set_barangay_resident_eligibility\(uuid,boolean\) from public,anon,authenticated/)
 expect(sql).not.toMatch(/delete from|grant (select|update|insert)|exception when/i)
 expect(sql).toMatch(/if v_resident.resident_status=v_directory_status/)
 expect(fs.readFileSync(path.join(process.cwd(),'src/components/Sidebar.jsx'),'utf8')).not.toMatch(/id: 'registry'/)
})
