import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
const db='validation067_race_1793769623851'
const sql=`begin;
create function pg_temp.call(actor uuid,statement text) returns jsonb language plpgsql as $$declare result jsonb;code text;begin
 perform set_config('request.jwt.claim.sub',actor::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);set local role authenticated;
 begin execute statement into result;exception when others then get stacked diagnostics code=returned_sqlstate;reset role;return jsonb_build_object('ok',false,'code',code);end;
 reset role;return jsonb_build_object('ok',true,'data',result);end;$$;
do $$declare sec uuid:='f0670000-0000-4000-8000-000000000001';pun uuid:='f0670000-0000-4000-8000-000000000002';res uuid:='f0670000-0000-4000-8000-000000000009';res2 uuid:='f0670000-0000-4000-8000-000000000010';event uuid;request uuid:=gen_random_uuid();id uuid;a jsonb;b jsonb;before_points bigint;checks int:=0;
begin
 if not exists(select 1 from public.community_credit_policies where status='active' and policy_model='participation_v2' and approved_by<>prepared_by and base_score=100) then raise exception 'Independent policy approval missing';end if;checks:=checks+1;
 if (select count(*) from public.community_credit_rules where active and approved_by<>prepared_by)<5 then raise exception 'Independent rule approvals missing';end if;checks:=checks+1;
 a:=pg_temp.call(res,'select public.my_community_credit_profile()');if a#>>'{data,profile,current_score}'<>'100' or a#>>'{data,profile,policy_model}'<>'participation_v2' then raise exception 'Wrong own profile';end if;checks:=checks+1;
 select x.active_award_event_id into event from public.community_credit_participations x join public.community_credit_events e on e.id=x.active_award_event_id where x.resident_id='f0670000-0000-4000-8000-000000000101' and e.verified_by=sec limit 1;if event is null then raise exception 'No verified active award';end if;
 select sum(points_delta_snapshot) into before_points from public.community_credit_events where resident_id='f0670000-0000-4000-8000-000000000101';
 a:=pg_temp.call(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''Please review synthetic attendance'')',request,event));if a->>'ok'<>'true' then raise exception 'Correction submission failed: %',a;end if;id:=(a#>>'{data,correction_request_id}')::uuid;checks:=checks+1;
 b:=pg_temp.call(res,format('select public.submit_community_credit_correction_request(%L,''award_correction'',%L,null,''Please review synthetic attendance'')',request,event));if b#>>'{data,correction_request_id}'<>id::text then raise exception 'Correction retry mismatch';end if;checks:=checks+1;
 a:=pg_temp.call(res2,'select public.my_community_credit_correction_requests()');if jsonb_path_exists(a->'data',format('$[*] ? (@.id == "%s")',id)::jsonpath) then raise exception 'Cross-resident correction leak';end if;checks:=checks+1;
 a:=pg_temp.call(sec,format('select public.resolve_community_credit_correction_request(%L,''approved'',''Synthetic review'')',id));if a->>'ok'<>'false' then raise exception 'Award recorder self-reviewed';end if;checks:=checks+1;
 a:=pg_temp.call(pun,format('select public.resolve_community_credit_correction_request(%L,''approved'',''Independent synthetic review'')',id));if a->>'ok'<>'true' or a#>>'{data,points_changed}'<>'false' then raise exception 'Independent review failed: %',a;end if;checks:=checks+1;
 if (select sum(points_delta_snapshot) from public.community_credit_events where resident_id='f0670000-0000-4000-8000-000000000101') is distinct from before_points then raise exception 'Review automatically changed points';end if;checks:=checks+1;
 a:=pg_temp.call(res,'select public.my_community_credit_correction_requests()');if not jsonb_path_exists(a->'data',format('$[*] ? (@.id == "%s" && @.status == "approved")',id)::jsonpath) then raise exception 'Own resolved status missing';end if;checks:=checks+1;
 a:=pg_temp.call(pun,format('select public.resolve_community_credit_correction_request(%L,''declined'',''Second decision'')',id));if a->>'ok'<>'false' then raise exception 'Resolved twice';end if;checks:=checks+1;
 raise notice 'PASS: % synthetic V2 approval/profile/award/correction/privacy checks; review did not mutate points; rollback follows',checks;
end;$$;rollback;`
const out=execFileSync('docker',['exec','-i','pg067test','psql','-X','-q','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',timeout:30000});fs.writeFileSync('supabase-tests/runners-out/rc2-correction-smoke.sql',sql);console.log(out)
