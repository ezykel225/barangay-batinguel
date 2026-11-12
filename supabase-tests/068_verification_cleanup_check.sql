-- Run in the same psql session immediately AFTER harness ROLLBACK.
begin read only;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.profiles r)=:'baseline_profiles' then 1 else 0 end as profiles_rollback_verified;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.barangay_residents r)=:'baseline_directory' then 1 else 0 end as directory_rollback_verified;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.notifications r)=:'baseline_notifications' then 1 else 0 end as notifications_rollback_verified;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.activity_log r)=:'baseline_audit' then 1 else 0 end as audit_rollback_verified;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.community_credit_events r)=:'baseline_credit_events' then 1 else 0 end as credit_events_rollback_verified;
select 1 / case when (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.community_credit_enrollments r)=:'baseline_enrollments' then 1 else 0 end as enrollments_rollback_verified;
rollback;
