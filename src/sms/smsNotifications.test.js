import {createRef} from 'react'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SmsComposer from './SmsComposer'
import SmsHistory from './SmsHistory'
import {supabase} from '../supabase/supabaseClient'
import {submitIprog,processBatch,estimateSegments} from '../../supabase/functions/_shared/smsProvider'
jest.mock('../supabase/supabaseClient',()=>({supabase:{rpc:jest.fn(),functions:{invoke:jest.fn()}}}))
const snap={audience:{type:'all_residents'},eligible:30,recipients:0,skipped:30,missing_dob:0,message:'Public notice. Please check the barangay website for details.',preview_token:'confirmed-token'}
beforeEach(()=>{
 Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:jest.fn(()=> 'request-key')}})
 Object.defineProperty(AbortSignal,'timeout',{configurable:true,value:jest.fn(()=>undefined)})
 supabase.rpc.mockImplementation(async name=>({data:name==='sms_audience_options'?['Purok 1']:name==='sms_preview'?snap:name==='sms_source_history'?{audience:null,broadcasts:[]}:name==='sms_prepare_broadcast'?'broadcast-id':name==='sms_broadcast_state'?{counts:{dry_run:0,skipped:30,pending:0}}:null,error:null}))
 supabase.functions.invoke.mockResolvedValue({data:{counts:{pending:0,accepted:0}},error:null})
})
test.each(['announcement','event','health_event','medical_program'])('%s: no-SMS publishing never invokes provider or creates a broadcast',async sourceType=>{
 const ref=createRef();render(<SmsComposer ref={ref} sourceType={sourceType} draft={{title:'Public notice'}}/>);expect(ref.current.beforeSave()).toBe(true);await ref.current.afterSave('source-id');expect(supabase.functions.invoke).not.toHaveBeenCalled();expect(supabase.rpc.mock.calls.some(([n])=>n==='sms_prepare_broadcast')).toBe(false)
})
test('preview is counts/message only; explicit checkbox confirmation is required and changes invalidate it',async()=>{
 const ref=createRef(),draft={title:'Public notice'};const{rerender}=render(<SmsComposer ref={ref} sourceType="announcement" draft={draft}/> )
 fireEvent.click(screen.getByLabelText('Send SMS when this content is published'));act(()=>expect(ref.current.beforeSave()).toBe(false))
 await userEvent.click(screen.getByRole('button',{name:'Preview SMS'}));await screen.findByText(/30 eligible residents/)
 expect(screen.getByText(/0 unique usable numbers/)).toBeVisible();expect(supabase.functions.invoke).not.toHaveBeenCalled()
 fireEvent.click(screen.getByLabelText('I confirm this message and 0 unique SMS destinations.'));expect(ref.current.beforeSave()).toBe(true)
 rerender(<SmsComposer ref={ref} sourceType="announcement" draft={{title:'Changed'}}/>);act(()=>expect(ref.current.beforeSave()).toBe(false));expect(screen.queryByLabelText(/I confirm/)).not.toBeInTheDocument()
})
test('Senior label, recorded Puroks and generic inclusive age range controls are available',async()=>{
 render(<SmsComposer sourceType="health_event"/>);expect(screen.getByRole('option',{name:'Senior Citizens (60+)'})).toBeVisible()
 await userEvent.selectOptions(screen.getByLabelText('SMS target audience'),'purok');await screen.findByRole('option',{name:'Purok 1'})
 await userEvent.selectOptions(screen.getByLabelText('SMS target audience'),'age_range');expect(screen.getByLabelText('Minimum age')).toHaveValue(18);expect(screen.getByLabelText('Maximum age')).toHaveValue(59)
})
test('confirmed zero-recipient notification reuses its idempotency key and never invokes Edge',async()=>{
 const ref=createRef();render(<SmsComposer ref={ref} sourceType="event" draft={{title:'Event'}}/>);fireEvent.click(screen.getByLabelText('Send SMS when this content is published'));await userEvent.click(screen.getByRole('button',{name:'Preview SMS'}));await screen.findByText(/30 eligible residents/);fireEvent.click(screen.getByLabelText(/I confirm/))
 await act(async()=>{await ref.current.afterSave('existing-source');await ref.current.afterSave('existing-source')})
 const calls=supabase.rpc.mock.calls.filter(([n])=>n==='sms_prepare_broadcast');expect(calls).toHaveLength(2);expect(calls[0][1].p_request_key).toBe(calls[1][1].p_request_key)
 expect(supabase.functions.invoke).not.toHaveBeenCalled()
})
test('saved-source dry run snapshots without invoking the Edge sender',async()=>{
 render(<SmsComposer sourceType="medical_program" sourceId="program-id" editing previewDraft={false}/>);await userEvent.click(screen.getByRole('button',{name:'Preview SMS'}));await screen.findByText(/30 eligible residents/);await userEvent.click(screen.getByRole('button',{name:'Dry run - no SMS sent'}));await screen.findByText(/0 unique usable numbers; 30 skipped/)
 expect(supabase.rpc).toHaveBeenCalledWith('sms_prepare_broadcast',expect.objectContaining({p_dry_run:true,p_kind:'schedule_update'}));expect(supabase.functions.invoke).not.toHaveBeenCalled()
})
test('history dialog has focus trap, Escape, scroll lock and focus return; no numbers exposed',async()=>{
 render(<SmsHistory sourceType="announcement" sourceId="id"/>);const opener=screen.getByRole('button',{name:'SMS notification history'});opener.focus();await userEvent.click(opener)
 const dialog=screen.getByRole('dialog',{name:'SMS Notification'});expect(dialog).toHaveAttribute('aria-modal','true');expect(screen.getByRole('button',{name:'Close SMS notification'})).toHaveFocus();expect(document.body.style.overflow).toBe('hidden');await userEvent.tab({shift:true});expect(dialog).toContainElement(document.activeElement);await userEvent.keyboard('{Escape}');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(opener).toHaveFocus()
})
const response=(status,data)=>({ok:status>=200&&status<300,status,json:async()=>data})
test('iProg uses body-only credential and strict 639 destination, reporting acceptance not delivery',async()=>{
 const fetchImpl=jest.fn(async()=>response(200,{status:200,message_id:'iSms-test',message_status_link:'ignored-secret-url'}))
 expect(await submitIprog({phone:'639171234567',message:'Notice',token:'mock-token',fetchImpl})).toEqual({status:'accepted',reason:null,providerId:'iSms-test'})
 expect(fetchImpl.mock.calls[0][0]).toBe('https://iprogsms.com/api/v1/sms_messages');expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({api_token:'mock-token',phone_number:'639171234567',message:'Notice'})
})
test.each([[200,{status:200},'unknown'],[200,{status:null},'unknown'],[500,{status:500},'unknown'],[422,{status:422},'failed'],[200,{status:422},'failed']])('provider outcome HTTP %s %j is %s',async(status,data,expected)=>expect((await submitIprog({phone:'639171234567',message:'Notice',token:'mock',fetchImpl:async()=>response(status,data)})).status).toBe(expected))
test('transport failure is unknown and never automatically retried',async()=>{
 const fetchImpl=jest.fn(async()=>{throw new Error('timeout')});expect(await submitIprog({phone:'639171234567',message:'Notice',token:'mock',fetchImpl})).toEqual({status:'unknown',reason:'transport_unknown',providerId:null});expect(fetchImpl).toHaveBeenCalledTimes(1)
})
test('durable claim precedes send; persistence failure does not retry provider',async()=>{
 const calls=[],fetchImpl=jest.fn(async()=>{calls.push('provider');return response(200,{status:200,message_id:'accepted'})})
 const caller={rpc:jest.fn(async()=>({error:null}))},worker={rpc:jest.fn(async(name)=>{calls.push(name);return name==='sms_claim_batch'?{data:[{recipient_id:'r',phone:'639171234567',message:'Notice'}],error:null}:{error:{message:'database unavailable'}}})}
 await expect(processBatch({caller,worker,broadcastId:'b',actorId:'a',token:'mock',fetchImpl})).rejects.toThrow('needs review');expect(calls).toEqual(['sms_claim_batch','provider','sms_finish_attempt']);expect(fetchImpl).toHaveBeenCalledTimes(1)
})
test('unauthorized batch cannot reach worker or provider',async()=>{
 const caller={rpc:async()=>({error:{message:'denied'}})},worker={rpc:jest.fn()},fetchImpl=jest.fn();await expect(processBatch({caller,worker,broadcastId:'b',actorId:'a',token:'mock',fetchImpl})).rejects.toThrow('Not authorized');expect(worker.rpc).not.toHaveBeenCalled();expect(fetchImpl).not.toHaveBeenCalled()
})
test('encoding estimate distinguishes Unicode costs',()=>{expect(estimateSegments('a'.repeat(161)).segments).toBe(2);expect(estimateSegments('🙂'.repeat(36)).segments).toBe(2)})
