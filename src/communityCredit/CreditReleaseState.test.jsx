import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import CreditManagement from './CreditManagement'
import * as api from './communityCreditApi'
jest.mock('./communityCreditApi')
const v1={id:'v1',name:'Configured legacy policy',status:'active',base_score:100,minimum_score:0,maximum_score:100}
const v2={id:'v2',name:'Participation policy',status:'draft',policy_model:'participation_v2',base_score:100,minimum_score:0,maximum_score:100}
const rule=(id,policy,extra={})=>({id,policy_id:policy.id,rule_code:id,title:id,source_domain:'community_activity',category:'positive',points_delta:5,active:false,...extra})
const row=id=>screen.getByText(id,{selector:'td[data-label="Code"]'}).closest('tr')
beforeEach(()=>{jest.resetAllMocks();api.getCreditDirectory.mockResolvedValue([]);api.getCreditActivities.mockResolvedValue([]);api.getAdminCorrections.mockResolvedValue([]);api.getCreditAdminState.mockResolvedValue({policies:[v1],rules:[]})})

test('configured V1 remains configured when V2 RPC is missing',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v1,v2],rules:[]});api.getCreditActivities.mockRejectedValue({code:'PGRST202'})
 render(<CreditManagement canManage/>);
 expect(await screen.findByText('Active V1: Configured legacy policy')).toBeInTheDocument()
 expect(await screen.findByText(/V2 functions are missing/)).toBeInTheDocument()
 expect(screen.queryByText('Community credit policy is not configured.')).not.toBeInTheDocument()
})
test('authorization denial is distinct from missing functions while preserving known V1',async()=>{
 api.getAdminCorrections.mockRejectedValue({code:'42501'});render(<CreditManagement canManage/>);
 expect(await screen.findByText(/Your account is not authorized for V2 workflows/)).toBeInTheDocument()
 expect(screen.getByText('Active V1: Configured legacy policy')).toBeInTheDocument()
 expect(screen.queryByText(/V2 functions are missing/)).not.toBeInTheDocument()
})
test('transport failure is unavailable, not a claim that V2 is missing or V1 unconfigured',async()=>{
 api.getCreditActivities.mockRejectedValue(new Error('offline'));render(<CreditManagement canManage/>);
 expect(await screen.findByText(/V2 workflows are unavailable/)).toBeInTheDocument()
 expect(screen.getByText('Active V1: Configured legacy policy')).toBeInTheDocument()
 expect(screen.queryByText(/V2 functions are missing/)).not.toBeInTheDocument()
})
test('active V2 is reported accurately even when its optional workflows are unavailable',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[{...v1,status:'retired'},{...v2,status:'active'}],rules:[]});api.getCreditActivities.mockRejectedValue({code:'PGRST202'});
 render(<CreditManagement canManage/>);expect(await screen.findByText('Active V2: Participation policy')).toBeInTheDocument();expect(screen.queryByText('Community credit policy is not configured.')).not.toBeInTheDocument()
})
test('only truly absent policy uses unconfigured empty state',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[],rules:[]});render(<CreditManagement canManage/>);expect(await screen.findByText('Community credit policy is not configured.')).toBeInTheDocument()
})
test('draft-only policy has no active policy without claiming no configuration',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v2],rules:[]});render(<CreditManagement canManage/>);expect(await screen.findByText(/No active community credit policy/)).toBeInTheDocument();expect(screen.queryByText('Community credit policy is not configured.')).not.toBeInTheDocument()
})
test('failed policy lookup is an error and never the unconfigured empty state',async()=>{
 api.getCreditAdminState.mockRejectedValue({code:'42501'});render(<CreditManagement canManage/>);expect(await screen.findByRole('alert')).toHaveTextContent('Community credit policy information is unavailable');expect(screen.queryByText('Community credit policy is not configured.')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Create policy'})).not.toBeInTheDocument()
})
test('inactive V1 rules open and save only through the V1 form/RPC',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v1],rules:[rule('V1_RULE',v1)]});api.saveCreditRule.mockResolvedValue('saved');render(<CreditManagement canManage/>);
 await screen.findByText('Active V1: Configured legacy policy');fireEvent.click(within(row('V1_RULE')).getByRole('button',{name:'Edit'}));expect(screen.getByRole('dialog',{name:'Edit rule'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Save inactive rule'}));await waitFor(()=>expect(api.saveCreditRule).toHaveBeenCalledWith(expect.objectContaining({id:'V1_RULE',policy_id:'v1'})));expect(api.creditWorkflow).not.toHaveBeenCalled()
})
test.each(['draft','active'])('unapproved V2 rule on %s policy cannot open V1 editor or be enabled',async status=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v1,{...v2,status}],rules:[rule('V2_RULE',v2)]});render(<CreditManagement canManage/>);await screen.findByLabelText('Workflow');const actions=within(row('V2_RULE'));expect(actions.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument();expect(actions.getByRole('button',{name:'Enable'})).toBeDisabled();expect(actions.getByText(/independent approval/)).toBeInTheDocument();expect(api.saveCreditRule).not.toHaveBeenCalled()
})
test.each([false,true])('approved V2 rule active=%s remains immutable but may use guarded enable/disable',async active=>{
 api.getCreditAdminState.mockResolvedValue({policies:[{...v2,status:'active'}],rules:[rule('APPROVED',v2,{active,approved_by:'other-admin'})]});api.setCreditRuleActive.mockResolvedValue(null);render(<CreditManagement canManage/>);await screen.findByText('Active V2: Participation policy');const actions=within(row('APPROVED'));expect(actions.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument();expect(actions.getByText(/Approved V2 rules are immutable/)).toBeInTheDocument();fireEvent.click(actions.getByRole('button',{name:active?'Disable':'Enable'}));await waitFor(()=>expect(api.setCreditRuleActive).toHaveBeenCalledWith('APPROVED',!active));expect(api.saveCreditRule).not.toHaveBeenCalled()
})
test('retired and unknown-policy rules are read-only, not silently routed to legacy actions',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[{...v2,status:'retired'}],rules:[rule('RETIRED',v2,{approved_by:'other-admin'}),rule('UNKNOWN',{id:'unknown'})]});render(<CreditManagement canManage/>);await screen.findByText(/No active community credit policy/);for(const id of ['RETIRED','UNKNOWN']){const actions=within(row(id));expect(actions.queryByRole('button',{name:'Edit'})).not.toBeInTheDocument();expect(actions.getByRole('button',{name:'Enable'})).toBeDisabled()}
})
test('unapproved V2 approval is routed to its exact RPC, never the legacy editor',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v1,v2],rules:[rule('V2_APPROVAL',v2)]});api.creditWorkflow.mockResolvedValue({approved:true});render(<CreditManagement canManage/>);fireEvent.change(await screen.findByLabelText('Workflow'),{target:{value:'approve_community_credit_v2_rule'}});fireEvent.change(screen.getByLabelText('Unapproved participation rule'),{target:{value:'V2_APPROVAL'}});fireEvent.click(screen.getByRole('button',{name:'Submit workflow'}));await waitFor(()=>expect(api.creditWorkflow).toHaveBeenCalledWith('approve_community_credit_v2_rule',{p_id:'V2_APPROVAL'}));expect(api.saveCreditRule).not.toHaveBeenCalled();expect(api.activateCreditPolicy).not.toHaveBeenCalled()
})
test('manager role gating still prevents all administration loads and mutation controls',()=>{
 render(<CreditManagement canManage={false}/>);expect(api.getCreditAdminState).not.toHaveBeenCalled();expect(api.getCreditActivities).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Create rule'})).not.toBeInTheDocument()
})

test('a server refusal of self-approval is surfaced without a legacy fallback or optimistic approval',async()=>{
 api.getCreditAdminState.mockResolvedValue({policies:[v1,v2],rules:[rule('SELF_APPROVAL',v2)]});api.creditWorkflow.mockRejectedValue({code:'P0001',message:'A different administrator must approve'});render(<CreditManagement canManage/>);
 fireEvent.change(await screen.findByLabelText('Workflow'),{target:{value:'approve_community_credit_v2_rule'}});fireEvent.change(screen.getByLabelText('Unapproved participation rule'),{target:{value:'SELF_APPROVAL'}});fireEvent.click(screen.getByRole('button',{name:'Submit workflow'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('The server did not confirm this operation');expect(within(row('SELF_APPROVAL')).getByRole('button',{name:'Enable'})).toBeDisabled();expect(api.saveCreditRule).not.toHaveBeenCalled();expect(api.setCreditRuleActive).not.toHaveBeenCalled()
})
