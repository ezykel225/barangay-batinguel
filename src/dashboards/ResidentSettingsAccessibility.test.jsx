import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ResidentDashboard from './ResidentDashboard'
import { supabase } from '../supabase/supabaseClient'
import { useAuth } from '../context/AuthContext'

jest.mock('../supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn(),auth:{updateUser:jest.fn()},storage:{from:jest.fn()}}}))
jest.mock('../context/AuthContext',()=>({useAuth:jest.fn()}))
jest.mock('../components/Sidebar',()=>({setActiveTab})=><button onClick={()=>setActiveTab('settings')}>Open settings</button>)
jest.mock('../components/NotificationBell',()=>()=>null)
jest.mock('../components/useNotifications',()=>({useNotifications:()=>({notifications:[],readIds:new Set(),badges:{},refresh:jest.fn(),markRead:jest.fn(),markAllRead:jest.fn()})}))

test('password controls have touch targets and keyboard toggling never saves a password',async()=>{
  useAuth.mockReturnValue({user:{id:'fictional-resident'},role:'resident'})
  supabase.rpc.mockResolvedValue({data:[],error:null})
  supabase.from.mockImplementation(()=>{
    const b={};['select','eq','order','limit','is','in'].forEach(k=>{b[k]=()=>b})
    b.single=b.maybeSingle=async()=>({data:{id:'fictional-resident',role:'resident',verification_status:'verified'},error:null})
    b.then=(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject)
    return b
  })
  render(<MemoryRouter><ResidentDashboard/></MemoryRouter>)
  await userEvent.click(screen.getByRole('button',{name:'Open settings'}))
  const input=screen.getByLabelText('New Password',{exact:true})
  const confirmation=screen.getByLabelText('Confirm New Password',{exact:true})
  const toggle=screen.getByRole('button',{name:'Show the new password'})
  expect(toggle).toHaveStyle({width:'44px',height:'44px'})
  expect(input).toHaveStyle({paddingRight:'64px'})
  toggle.focus();await userEvent.keyboard('{Enter}')
  expect(toggle).toHaveAttribute('aria-pressed','true')
  expect(input).toHaveAttribute('type','text')
  expect(confirmation).toHaveAttribute('type','password')
  await userEvent.keyboard(' ')
  expect(input).toHaveAttribute('type','password')
  expect(supabase.auth.updateUser).not.toHaveBeenCalled()
})
