import { fireEvent, render, screen, within } from '@testing-library/react'
import ResidentsWorkspace from './ResidentsWorkspace'
import { supabase } from '../supabase/supabaseClient'
import { directoryAccountState, directorySummary, residentPurokOptions, matchesResidentPurok } from './residentPresentation'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn()}}))
const rows=[{id:'a',first_name:'Ana',last_name:'Cruz',purok:'1',resident_status:'active',profile_id:'profile-a',mobile_number:'09171234567'}, {id:'b',first_name:'Ben',last_name:'Reyes',purok:'Purok 1',resident_status:'inactive'}, {id:'c',first_name:'Cleo',last_name:'Santos',purok:'Purok 10',resident_status:'active'}, {id:'d',first_name:'Dan',last_name:'Lee',purok:'Purok 2',resident_status:'active'}]
beforeEach(()=>{supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:rows,error:null})})

test('explicit linkage and eligibility disagreements do not invent account verification',()=>{
 expect(directoryAccountState({account_linked:true},[])).toMatchObject({linked:true,verification:'Verification unavailable',needsReview:false})
 expect(directoryAccountState({resident_status:'active',profile_id:'p'},[{id:'p',verification_status:'ineligible'}])).toMatchObject({needsReview:true,verification:'Not a resident'})
 expect(directoryAccountState({resident_status:'active'},[{id:'p',verification_status:'pending'}])).toMatchObject({linked:false,verification:'Verification unavailable'})
 expect(directorySummary([{account_linked:true}]).find(([label])=>label==='Linked Online Accounts')[1]).toBe(1)
})

test('defaults to active directory records and uses explicit account groups without inferring from linkage',async()=>{
 const selectGroup=jest.fn()
 render(<ResidentsWorkspace canManageDirectory onAccountGroupChange={selectGroup} accounts={<p>Account panel</p>} />)
 await screen.findByRole('button',{name:'Cleo Santos'})
 expect(screen.getByLabelText('Resident status')).toHaveValue('active')
 expect(screen.queryByRole('button',{name:'Ben Reyes'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'Dan Lee'})).toBeVisible() // Unlinked is not a request.
 fireEvent.click(screen.getByRole('button',{name:'Non-Residents'}));expect(selectGroup).toHaveBeenLastCalledWith('notResidents')
 fireEvent.click(screen.getByRole('button',{name:'Requests'}));expect(selectGroup).toHaveBeenLastCalledWith('requests')
 fireEvent.click(screen.getByRole('button',{name:'Batinguel Residents'}))
 fireEvent.change(screen.getByLabelText('Resident status'),{target:{value:'inactive'}})
 expect(screen.getByRole('button',{name:'Ben Reyes'})).toBeVisible() // Retained directory history, not inferred non-residency.
})

test('compact rows show purok number, explicit linkage and independent verification status',async()=>{
 render(<ResidentsWorkspace canManageDirectory profiles={[{id:'profile-a',verification_status:'pending'}]} />)
 const name=await screen.findByRole('button',{name:'Ana Cruz'}),row=within(name.closest('tr'))
 expect(row.getByText('1')).toHaveAttribute('title','1')
 expect(row.getByText('Explicitly linked')).toBeVisible()
 expect(row.getByText('Awaiting review')).toBeVisible()
 expect(row.getByRole('button',{name:'Actions for Ana Cruz'})).toBeVisible()
})
test('directory is default; tab changes preserve loaded records and search',async()=>{
 render(<ResidentsWorkspace canManageDirectory accounts={<input aria-label="Account search"/>} voterReference={<p>Reference only</p>}/> )
 await screen.findByRole('button',{name:'Ana Cruz'})
 expect(screen.getByRole('button',{name:'Batinguel Residents'})).toHaveAttribute('aria-pressed','true')
 expect(screen.queryByLabelText('Account search')).not.toBeVisible()
 fireEvent.change(screen.getByLabelText('Search residents'),{target:{value:'Ana'}})
 fireEvent.click(screen.getByRole('button',{name:'Requests'}));expect(screen.getByLabelText('Account search')).toBeVisible()
 fireEvent.change(screen.getByLabelText('Account search'),{target:{value:'saved query'}})
 expect(screen.queryByRole('button',{name:'Voter Reference List'})).not.toBeInTheDocument();expect(screen.queryByText('Reference only')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Batinguel Residents'}));expect(screen.getByLabelText('Search residents')).toHaveValue('Ana')
 expect(screen.queryByRole('button',{name:'Ben Reyes'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Requests'}));expect(screen.getByLabelText('Account search')).toHaveValue('saved query')
 expect(supabase.rpc).toHaveBeenCalledTimes(1)
})
test('summary uses full loaded data; normalized dynamic puroks filter both forms and reset',async()=>{
 render(<ResidentsWorkspace canManageDirectory accounts={null} voterReference={null}/>);await screen.findByRole('button',{name:'Ana Cruz'})
 expect(directorySummary(rows)).toEqual([['Directory Records',4],['Active Residents',3],['With Mobile Number',1],['Linked Online Accounts',1]])
 const select=screen.getByLabelText('Purok filter')
 expect([...select.options].map(o=>o.text)).toEqual(['All Puroks','Purok 1','Purok 2','Purok 10'])
 fireEvent.change(select,{target:{value:'purok 1'}})
 fireEvent.change(screen.getByLabelText('Resident status'),{target:{value:''}})
 expect(screen.getByRole('button',{name:'Ana Cruz'})).toBeVisible();expect(screen.getByRole('button',{name:'Ben Reyes'})).toBeVisible()
 expect(screen.queryByRole('button',{name:'Cleo Santos'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('Resident status'),{target:{value:'active'}})
 expect(screen.queryByRole('button',{name:'Ben Reyes'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Clear filters'}));expect(select).toHaveValue('');expect(screen.getByRole('button',{name:'Cleo Santos'})).toBeVisible()
})
test('empty directory has a separate empty state and no invented puroks',async()=>{
 supabase.rpc.mockResolvedValue({data:[],error:null});render(<ResidentsWorkspace canManageDirectory/> )
 await screen.findByText('No barangay resident records have been added yet.')
 expect(screen.getByLabelText('Purok filter').options).toHaveLength(1)
})
test('natural labels keep arbitrary recorded places and no fixed purok list',()=>{
 expect(residentPurokOptions([{purok:'01'},{purok:'Purok 1'},{purok:'Purok 10'},{purok:'2'},{purok:'Hill Road'},{purok:null}]).map(o=>o.label)).toEqual(['Hill Road','Purok 1','Purok 2','Purok 10'])
 expect(matchesResidentPurok('1','purok 1')).toBe(true)
 expect(matchesResidentPurok('Purok 10','purok 1')).toBe(false)
})
