import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Footer from './components/Footer'
import EServices from './pages/EServices'
import Officials from './pages/Officials'
import { supabase } from './supabase/supabaseClient'
import { activityEntityLabel } from './utils/displayLabels'
import { categoryHeading } from './utils/notificationLabels'

jest.mock('./context/AuthContext',()=>({useAuth:()=>({user:null,role:null})}))
jest.mock('./supabase/supabaseClient',()=>({supabase:{from:jest.fn()}}))
beforeEach(()=>{
  supabase.from.mockReset()
  supabase.from.mockImplementation(table=>{
    const data=table==='kapitan_status'?{status:'available'}:[]
    const b={};for(const k of ['select','eq','is','order','limit'])b[k]=()=>b
    b.single=b.maybeSingle=()=>Promise.resolve({data,error:null})
    b.then=(resolve,reject)=>Promise.resolve({data,error:null}).then(resolve,reject)
    return b
  })
})
test.each(['Privacy Policy','Terms of Service'])('Footer %s describes retained services without obsolete reservation/payment promises',title=>{
  render(<MemoryRouter><Footer/></MemoryRouter>)
  fireEvent.click(screen.getByRole('button',{name:title}))
  const dialog=screen.getByRole('dialog',{name:title})
  expect(dialog).not.toHaveTextContent(/reservation|payment/i)
  expect(dialog).toHaveTextContent(/service request/i)
  fireEvent.click(screen.getByRole('button',{name:'Back'}))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('E-Services advertises retained document and complaint services without retired help text or links',()=>{
  render(<MemoryRouter><EServices/></MemoryRouter>)
  expect(screen.getByRole('link',{name:'Request Document'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Track a Complaint'})).toBeInTheDocument()
  expect(screen.getByRole('heading',{name:'Need help?'}).parentElement).not.toHaveTextContent(/reservation|Treasurer/)
  for(const link of document.querySelectorAll('a'))expect(['/reservation','/track-reservation','/health-center','/nurse']).not.toContain(link.getAttribute('href'))
})
test('Officials keeps real directory/schedule readers but no Nurse availability reader or health promotion',async()=>{
  render(<MemoryRouter><Officials/></MemoryRouter>)
  await waitFor(()=>expect(supabase.from).toHaveBeenCalledWith('official_availability'))
  const reads=supabase.from.mock.calls.map(([table])=>table)
  expect(reads).toContain('barangay_officials');expect(reads).toContain('kapitan_availability')
  expect(reads).not.toContain('nurse_availability')
  expect(screen.queryByRole('heading',{name:'Health Department'})).not.toBeInTheDocument()
  expect(screen.queryByText('Public Health Nurse')).not.toBeInTheDocument()
})
test('historical reservation audit and notification labels remain meaningful',()=>{
  expect(activityEntityLabel('reservation')).toMatch(/reservation/i)
  expect(categoryHeading('reservation')).toMatch(/reservation/i)
})
