import fs from 'fs'
import path from 'path'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App from './App'
import Home from './pages/Home'
import Navbar from './components/Navbar'
import { MemoryRouter } from 'react-router-dom'
import { supabase } from './supabase/supabaseClient'
import { E_SERVICES } from './constants/eServices'

jest.mock('./context/AuthContext',()=>({AuthProvider:({children})=>children,useAuth:()=>({user:null,role:null,loading:false})}))
jest.mock('./supabase/supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn(),auth:{}}}))
jest.mock('./components/Footer',()=>()=>null)
jest.mock('./pages/About',()=>()=> <main>Retained About</main>)
jest.mock('./pages/Officials',()=>()=> <main>Retained Officials</main>)
jest.mock('./pages/CommunitySafety',()=>()=> <main>Retained Community Safety</main>)
jest.mock('./pages/Announcements',()=>()=> <main>Retained Announcements</main>)
jest.mock('./pages/AnnouncementDetails',()=>()=> <main>Retained Announcement detail</main>)
jest.mock('./pages/Events',()=>()=> <main>Retained Events</main>)
jest.mock('./pages/EventDetails',()=>()=> <main>Retained Event detail</main>)
jest.mock('./pages/TrackComplaint',()=>()=> <main>Retained Complaint tracking</main>)
jest.mock('./pages/Login',()=>()=> <main>Retained Login</main>)
jest.mock('./pages/ResidentSignup',()=>()=> <main>Retained Signup</main>)
jest.mock('./pages/ResetPassword',()=>()=> <main>Retained Reset</main>)

beforeEach(()=>{
  supabase.from.mockReset()
  supabase.rpc.mockResolvedValue({data:[],error:null})
  supabase.from.mockImplementation(()=>{const b={};['select','order','limit','eq','is'].forEach(k=>b[k]=()=>b);b.then=(resolve,reject)=>Promise.resolve({data:[],error:null}).then(resolve,reject);return b})
})

test.each(['/reservation','/track-reservation','/health-center','/nurse'])('retired URL %s has intentional handling without database reads',route=>{
  window.history.replaceState({},'',route);render(<App/>);
  expect(screen.getByRole('heading',{name:'Service unavailable on this website'})).toBeInTheDocument()
  expect(window.location.pathname).toBe(route)
  expect(screen.getByRole('link',{name:'View available E-Services'})).toHaveAttribute('href','/e-services')
  expect(supabase.from).not.toHaveBeenCalled()
})

test.each([
  ['/about','Retained About'],['/officials','Retained Officials'],['/community-safety','Retained Community Safety'],
  ['/announcements','Retained Announcements'],['/announcements/example','Retained Announcement detail'],
  ['/events','Retained Events'],['/events/example','Retained Event detail'],['/track-complaint','Retained Complaint tracking'],
  ['/login','Retained Login'],['/signup','Retained Signup'],['/reset-password','Retained Reset'],
])('retained URL %s still resolves its component', (route,text)=>{
  window.history.replaceState({},'',route);render(<App/>);expect(screen.getByText(text)).toBeInTheDocument()
})

test('Home keeps announcements/events and stops waste reads and retired promotion',async()=>{
  render(<MemoryRouter><Home/></MemoryRouter>)
  await waitFor(()=>expect(supabase.from).toHaveBeenCalledWith('events'))
  expect(supabase.from.mock.calls.map(([table])=>table)).toEqual(['announcements','events'])
  expect(screen.getByRole('heading',{name:'Popular E-Services'})).toBeInTheDocument()
  for(const link of document.querySelectorAll('a'))expect(['/reservation','/track-reservation','/health-center']).not.toContain(link.getAttribute('href'))
  expect(document.querySelector('.waste-schedule-section')).toBeNull()
})

test.each([['/','Popular E-Services'],['/e-services','E-Services']])('retained public landing %s renders',async(route,heading)=>{
  window.history.replaceState({},'',route);render(<App/>);
  expect(screen.getByRole('heading',{name:heading,exact:true})).toBeInTheDocument()
  await waitFor(()=>expect(screen.queryByText('Loading announcements...')).not.toBeInTheDocument())
})

test('desktop/mobile navigation and catalogue contain retained services only',()=>{
  render(<MemoryRouter><Navbar/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:'Open navigation menu'}))
  expect(screen.queryByRole('link',{name:'Health Center'})).not.toBeInTheDocument()
  expect(screen.getAllByRole('link',{name:'Officials'}).length).toBeGreaterThan(0)
  expect(screen.getAllByRole('link',{name:'Community Safety'}).length).toBeGreaterThan(0)
  expect(E_SERVICES.map(s=>s.key)).toEqual(expect.arrayContaining(['request-document','file-complaint','track-complaint']))
  expect(E_SERVICES.some(s=>/reservation/.test(s.key))).toBe(false)
})

test('retained protected routes and shared helpers remain present',()=>{
  const source=fs.readFileSync(path.join(__dirname,'App.js'),'utf8')
  for(const role of ['official','resident','tanod'])expect(source).toContain(`allowedRole="${role}"`)
  for(const file of ['clinicHours.js','reservationTracking.js','homeSections.js'])expect(fs.existsSync(path.join(__dirname,'utils',file))).toBe(true)
})
