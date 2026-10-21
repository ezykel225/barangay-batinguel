import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import ResidentDirectory from './ResidentDirectory'
import { supabase } from '../supabase/supabaseClient'
jest.mock('../supabase/supabaseClient', () => ({supabase:{rpc:jest.fn()}}))
const row={id:'resident-1',first_name:'Ana',last_name:'Cruz',birth_date:'1960-02-29',mobile_number:'09171234567',purok:'Zone A',resident_status:'active',profile_id:null}
beforeEach(() => { supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:[row],error:null}) })
test('loads directory, views calendar date, Escape returns focus to opener', async () => {
  render(<ResidentDirectory />)
  const view=await screen.findByRole('button',{name:'Ana Cruz'});view.focus();fireEvent.click(view)
  const dialog=screen.getByRole('dialog',{name:'Resident Profile'})
  expect(within(dialog).getByText('February 29, 1960')).toBeInTheDocument()
  expect(within(dialog).getByText('Not linked',{selector:'dd'})).toBeInTheDocument()
  fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(view).toHaveFocus()
})
test('adds resident without account and preserves raw mobile/date payload', async () => {
  render(<ResidentDirectory />);await screen.findByRole('button',{name:'Ana Cruz'})
  fireEvent.click(screen.getByRole('button',{name:'Add Resident'}))
  fireEvent.change(screen.getByLabelText('First name'),{target:{value:'Ben'}})
  fireEvent.change(screen.getByLabelText('Last name'),{target:{value:'Reyes'}})
  fireEvent.change(screen.getByLabelText('Birth date (optional)'),{target:{value:'2000-02-29'}})
  fireEvent.change(screen.getByLabelText('Mobile number (optional)'),{target:{value:'+63917 123 4567'}})
  supabase.rpc.mockResolvedValueOnce({data:'resident-2',error:null})
  fireEvent.click(screen.getByRole('button',{name:'Save resident'}))
  await screen.findByText('Resident saved.')
  expect(supabase.rpc).toHaveBeenLastCalledWith('save_barangay_resident',expect.objectContaining({p_id:null,p_birth_date:'2000-02-29',p_mobile_number:'+63917 123 4567'}))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('invalid mobile stays open; failed save stays open; cancel closes', async () => {
  render(<ResidentDirectory />);await screen.findByRole('button',{name:'Ana Cruz'});fireEvent.click(screen.getByRole('button',{name:'Actions for Ana Cruz'}));fireEvent.click(screen.getByRole('menuitem',{name:/Edit resident/}))
  fireEvent.change(screen.getByLabelText('Mobile number (optional)'),{target:{value:'invalid'}})
  fireEvent.click(screen.getByRole('button',{name:'Save resident'}));expect(screen.getByRole('alert')).toHaveTextContent('Philippine mobile')
  expect(supabase.rpc).toHaveBeenCalledTimes(1)
  fireEvent.change(screen.getByLabelText('Mobile number (optional)'),{target:{value:''}})
  supabase.rpc.mockResolvedValueOnce({error:{message:'Not authorized'}})
  fireEvent.click(screen.getByRole('button',{name:'Save resident'}));await screen.findByText(/Could not save/)
  fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('search and filters use directory records only', async () => {
  render(<ResidentDirectory />);await screen.findByRole('button',{name:'Ana Cruz'})
  fireEvent.change(screen.getByLabelText('Resident status'),{target:{value:'inactive'}})
  expect(screen.queryByRole('button',{name:'Ana Cruz'})).not.toBeInTheDocument();expect(screen.getByText(/No residents match the current filters/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Resident status'),{target:{value:''}})
  fireEvent.change(screen.getByLabelText('Search residents'),{target:{value:'missing'}});expect(screen.queryByRole('button',{name:'Ana Cruz'})).not.toBeInTheDocument()
})
test('authorization/missing migration failure is explicit and add disabled', async () => {
  supabase.rpc.mockResolvedValue({data:null,error:{message:'permission denied'}})
  render(<ResidentDirectory />);await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Resident directory unavailable'))
  expect(screen.getByRole('button',{name:'Add Resident'})).toBeDisabled()
})
