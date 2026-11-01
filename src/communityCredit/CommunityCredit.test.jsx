import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import CreditProfile from './CreditProfile'
import CreditManagement from './CreditManagement'
import * as api from './communityCreditApi'

jest.mock('./communityCreditApi')

const profile={configured:true,resident:{full_name:'Test Resident',purok:'1',resident_status:'active',account_linked:true},policy_name:'Fixture policy',base_score:70,event_total:12,current_score:82,minimum_score:0,maximum_score:100,positive_event_count:2,negative_event_count:1,repair_event_count:1,last_credit_event_at:'2026-10-20T00:00:00Z',ledger:[]}

beforeEach(()=>jest.resetAllMocks())

test('renders a configured server-calculated score and empty ledger',async()=>{
 api.getResidentCreditProfile.mockResolvedValue(profile)
 render(<CreditProfile residentId="00000000-0000-0000-0000-000000000001" showResident/>)
 expect(await screen.findByLabelText('Current community credit score 82 out of 100')).toBeInTheDocument()
 expect(screen.getByText('No credit events recorded.')).toBeInTheDocument()
 expect(screen.getByText(/verified person-linking and outcome review/)).toBeInTheDocument()
})

test('renders enrollment start and the approved 100-point model',async()=>{
 api.getResidentCreditProfile.mockResolvedValue({...profile,enrolled:true,starting_score:100,base_score:100,event_total:0,current_score:100,credit_started_at:'2026-10-22T00:00:00Z'})
 render(<CreditProfile residentId="resident"/>)
 expect(await screen.findByLabelText('Current community credit score 100 out of 100')).toBeInTheDocument()
 expect(screen.getByText('Starting score').nextSibling).toHaveTextContent('100')
 expect(screen.getByText('Credit started').nextSibling).not.toHaveTextContent('None')
})

test('does not invent a score before controlled enrollment',async()=>{
 api.getResidentCreditProfile.mockResolvedValue({configured:true,enrolled:false,policy_name:'Fixture',minimum_score:0,maximum_score:100,resident:profile.resident,ledger:[]})
 render(<CreditProfile residentId="resident"/>)
 expect(await screen.findByText('Community credit enrollment has not started for this resident.')).toBeInTheDocument()
 expect(screen.queryByLabelText(/Current community credit score/)).not.toBeInTheDocument()
 expect(screen.queryByRole('heading',{name:'Credit Ledger'})).not.toBeInTheDocument()
 expect(screen.queryByText('No credit events recorded.')).not.toBeInTheDocument()
})

test('renders the safe no-policy state',async()=>{
 api.getResidentCreditProfile.mockResolvedValue({configured:false,resident:profile.resident,ledger:[]})
 render(<CreditProfile residentId="resident"/>)
 expect(await screen.findByText('Community credit policy is not configured.')).toBeInTheDocument()
})

test('renders the safe unlinked resident state',async()=>{
 api.getMyCreditProfile.mockResolvedValue({linked:false,message:'Your resident directory record is not yet linked to this account.'})
 render(<CreditProfile/>)
 expect(await screen.findByText('Your resident directory record is not yet linked to this account.')).toBeInTheDocument()
})

test('renders ledger rows without an add or deduct points control',async()=>{
 api.getResidentCreditProfile.mockResolvedValue({...profile,ledger:[{id:'e1',verified_at:'2026-10-20T00:00:00Z',event:'Verified activity',category:'positive',points:12,source:'community_activity',verified_by:'Secretary'}]})
 render(<CreditProfile residentId="resident"/>)
 expect(await screen.findByText('Verified activity')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:/add points|deduct points/i})).not.toBeInTheDocument()
})

test('permission-gates policy and rule management',()=>{
 render(<CreditManagement canManage={false}/>)
 expect(screen.getByText(/Secretary or Punong Barangay manages/)).toBeInTheDocument()
 expect(api.getCreditAdminState).not.toHaveBeenCalled()
})

const adminState={policies:[{id:'policy-1',name:'Draft fixture',description:'',base_score:50,minimum_score:0,maximum_score:100,status:'draft'}],rules:[]}

test('policy form uses DialogShell, focuses its first field, closes on Escape, and restores focus',async()=>{
 api.getCreditAdminState.mockResolvedValue(adminState)
 render(<CreditManagement canManage/>)
 const trigger=await screen.findByRole('button',{name:'Create policy'});trigger.focus();fireEvent.click(trigger)
 const dialog=screen.getByRole('dialog',{name:'Create policy'})
 expect(dialog).toBeInTheDocument();expect(screen.getByLabelText('Name')).toHaveFocus();expect(document.body).toHaveStyle({overflow:'hidden'})
 fireEvent.keyDown(document,{key:'Escape'})
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Create policy'})).not.toBeInTheDocument())
 expect(trigger).toHaveFocus()
})

test('rule form uses DialogShell and Cancel restores focus',async()=>{
 api.getCreditAdminState.mockResolvedValue(adminState)
 render(<CreditManagement canManage/>)
 const trigger=await screen.findByRole('button',{name:'Create rule'});trigger.focus();fireEvent.click(trigger)
 expect(screen.getByRole('dialog',{name:'Create rule'})).toBeInTheDocument();expect(screen.getByLabelText('Policy')).toHaveFocus()
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Create rule'})).not.toBeInTheDocument())
 expect(trigger).toHaveFocus()
})

test('policy dialog Save still submits the guarded policy RPC',async()=>{
 api.getCreditAdminState.mockResolvedValue(adminState);api.saveCreditPolicy.mockResolvedValue('new-policy')
 render(<CreditManagement canManage/>);fireEvent.click(await screen.findByRole('button',{name:'Create policy'}))
 fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Fixture'}})
 expect(screen.queryByRole('spinbutton',{name:/score/i})).not.toBeInTheDocument()
 expect(screen.getByLabelText('Fixed Community Credit v1 score configuration')).toHaveTextContent('Starting score100Minimum score0Maximum score100')
 fireEvent.click(screen.getByRole('button',{name:'Save draft policy'}))
 await waitFor(()=>expect(api.saveCreditPolicy).toHaveBeenCalledWith(expect.objectContaining({name:'Fixture',minimum_score:0,base_score:100,maximum_score:100})))
})

test('activation reports the actual server enrollment count',async()=>{
 api.getCreditAdminState.mockResolvedValue(adminState);api.activateCreditPolicy.mockResolvedValue({policy_id:'policy-1',added:43,enrolled:43})
 render(<CreditManagement canManage/>);fireEvent.click(await screen.findByRole('button',{name:'Activate'}))
 expect(await screen.findByText('Policy activated. 43 active residents enrolled.')).toBeInTheDocument()
})

