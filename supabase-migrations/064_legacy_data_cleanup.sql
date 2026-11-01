-- NOT APPLIED. LOCAL DRAFT ONLY. AS SHIPPED THIS MIGRATION REFUSES TO RUN.
--
-- Deletes the ROWS of the modules retired by the scope cleanup (PR #52) and closed to
-- clients by migration 063: Court Reservations, the Nurse Dashboard / Health Center
-- and Waste Management. Requires migrations 001-063 applied. Migration 063 is not
-- altered; this migration only checks that 063's result is in place.
--
-- ⚠️ IRREVERSIBLE INSIDE THE DATABASE. A deleted row can only be restored from the
-- private export taken beforehand, by a separately reviewed restore migration.
--
-- ===================================================================================
-- TARGETS (rows only; explicit id lists captured under lock; exact counts enforced)
-- ===================================================================================
--   order  table                 condition                                  planning ref*
--   1      notification_reads    notification_id in the reservation set     not yet counted
--   2      notifications         category = 'reservation'                   7
--   3      reservations          every row (guard: no future open booking)  27
--   4      medical_programs      every row (guard: no SMS dependency)       3
--   5      health_events         every row (guard: no SMS dependency)       13
--   6      medicine_stock        every row                                  14
--   7      nurse_availability    every row                                  6
--   8      waste_schedule        every row                                  2
--   * Production counts read on 2026-11-01. They are PLANNING REFERENCES, NOT
--     authorization and NOT the expected values: the expected values are entered in
--     the approval configuration below from a final read-only count.
--
-- NOT TOUCHED: residents_registry (active complaint person-linking and Voter List
-- Match), complaint_parties, activity_log, profiles, auth.users, every SMS table,
-- every non-reservation notification and read mark, and all retained-service data.
-- No CASCADE, no TRUNCATE, and no DROP of any table, column, function, trigger,
-- constraint, index, policy or privilege. Dropping the emptied objects is a separate,
-- optional migration 065.
--
-- ===================================================================================
-- WHAT THE DATABASE CAN PROVE, AND WHAT IT CANNOT
-- ===================================================================================
-- Proven here, fail-closed (any failure aborts the whole transaction):
--   * 063 is applied (retired functions not client-executable, no write policy and no
--     client privilege on reservations).
--   * No reservation is pending or approved with a date on or after today (Manila).
--   * No SMS broadcast or SMS source rule uses a health_event / medical_program source
--     (sms_source_content() raises when its source row is missing, and four SMS
--     functions call it).
--   * Every target's row count equals the approved expected count, under lock.
--   * After deleting: every target is empty, and the content fingerprint of every
--     other public table, the non-reservation notifications and read marks, and
--     auth.users is identical to before. No object was dropped.
--   * It is run from a direct connection (SQL Editor), not over the API.
--
-- NOT provable from SQL, therefore REQUIRED DEPLOYMENT GATES checked by people:
--   * the Barangay Secretary's written approval and the records-retention /
--     disposition authority for these records;
--   * that both future bookings (2027-01-27 approved, 2028-12-30 pending) were
--     resolved and their requesters informed outside the system;
--   * that the private export exists, matches its manifest checksum, and that a
--     restore from it was rehearsed on a disposable database.
--   The configuration below records the REFERENCES to that evidence and the
--   database checks only that they are filled in with well-formed values. A filled
--   value is an attestation by the person applying the migration, not a proof.
--
-- The future-booking gate: a resolved booking must carry a final status
-- ('declined' or 'cancelled', set by an authorized maintainer in the SQL Editor) or
-- have passed. A booking the barangay decides to HONOUR keeps this migration blocked
-- until its date has passed -- by design, so its only record is not deleted early.
--
-- ===================================================================================
-- PRIVATE EXPORT MANIFEST (process; no database table is created for it)
-- ===================================================================================
--   1. Final read-only count of every target (including reservation read marks).
--   2. Export every target table (data-only dump plus CSV per table) to a private,
--      user-only location outside the repository. Never commit or upload it.
--   3. Write MANIFEST.sha256 listing every export file with its SHA-256 and byte size;
--      take the SHA-256 of MANIFEST.sha256 itself -> export_manifest_sha256 below.
--   4. Restore the export into a disposable local database and verify the row counts
--      match step 1 -> restore_rehearsal below (date, database, result).
--   5. Owner sign-off naming the counts, the manifest checksum and the approvals.
--
-- ===================================================================================
-- APPLYING (only with separate explicit approval, in a maintenance window)
-- ===================================================================================
-- Replace EVERY value in the approval configuration, paste the whole file into the
-- SQL Editor and run it once. On any refusal nothing is deleted. Record the
-- application, date and evidence references in this header afterwards.
begin;

do $m064$
declare
  -- >>> 064 APPROVAL CONFIGURATION >>> (replace every value; see the header)
  c_cfg constant jsonb := jsonb_build_object(
    'approved_by',                    '<<REQUIRED: name and position of the approving owner>>',
    'retention_authorization',        '<<REQUIRED: reference to the Barangay Secretary approval and disposition authority>>',
    'booking_resolution',             '<<REQUIRED: reference confirming both future bookings resolved and requesters informed>>',
    'export_manifest_sha256',         '<<REQUIRED: 64 lowercase hex characters>>',
    'restore_rehearsal',              '<<REQUIRED: date, database and result of the restore rehearsal>>',
    'counts_taken_on',                '<<REQUIRED: YYYY-MM-DD of the final read-only count>>',
    'expected_reservation_notification_reads', '<<REQUIRED: final count>>',
    'expected_reservation_notifications',      '<<REQUIRED: final count>>',
    'expected_reservations',                   '<<REQUIRED: final count>>',
    'expected_medical_programs',               '<<REQUIRED: final count>>',
    'expected_health_events',                  '<<REQUIRED: final count>>',
    'expected_medicine_stock',                 '<<REQUIRED: final count>>',
    'expected_nurse_availability',             '<<REQUIRED: final count>>',
    'expected_waste_schedule',                 '<<REQUIRED: final count>>');
  -- <<< 064 APPROVAL CONFIGURATION <<<

  c_attestations constant text[] := array['approved_by','retention_authorization','booking_resolution','restore_rehearsal'];
  c_count_keys constant text[] := array['expected_reservation_notification_reads','expected_reservation_notifications',
    'expected_reservations','expected_medical_programs','expected_health_events','expected_medicine_stock',
    'expected_nurse_availability','expected_waste_schedule'];
  -- Whole tables emptied by this migration (excluded from the whole-table fingerprint).
  c_full_targets constant text[] := array['reservations','medical_programs','health_events','medicine_stock',
    'nurse_availability','waste_schedule'];
  c_partial_targets constant text[] := array['notifications','notification_reads'];

  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_key text; v_val text; v_bad text; v_n bigint; v_taken date;
  v_notif uuid[]; v_res uuid[]; v_prog uuid[]; v_hev uuid[]; v_med uuid[]; v_nurse uuid[]; v_waste uuid[];
  v_reads bigint;
  v_before jsonb := '{}'; v_after jsonb := '{}'; v_rel regclass; v_fp text;
begin
  -- 1. Run only from a direct connection, never over the API. ------------------------
  if auth.role() is not null then
    raise exception '064 refused: run from the SQL Editor (direct connection), not over the API (role %)', auth.role();
  end if;

  -- 2. Approval configuration: every key present and well-formed. ---------------------
  select string_agg(k, ', ') into v_bad
  from unnest(c_attestations || c_count_keys || array['export_manifest_sha256','counts_taken_on']) k
  where not (c_cfg ? k) or jsonb_typeof(c_cfg->k) <> 'string';
  if v_bad is not null then raise exception '064 refused: approval configuration missing: %', v_bad; end if;

  foreach v_key in array c_attestations loop
    v_val := btrim(c_cfg->>v_key);
    if length(v_val) < 12 or v_val like '%<<%' or v_val ilike '%required%' or v_val ilike '%todo%' then
      raise exception '064 refused: approval value "%" is a placeholder or too short', v_key;
    end if;
  end loop;

  v_val := c_cfg->>'export_manifest_sha256';
  if v_val !~ '^[0-9a-f]{64}$' or v_val ~ '^(.)\1{63}$' then
    raise exception '064 refused: export_manifest_sha256 is not a real SHA-256 (64 lowercase hex)';
  end if;

  v_val := c_cfg->>'counts_taken_on';
  if v_val !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '064 refused: counts_taken_on is not YYYY-MM-DD'; end if;
  v_taken := v_val::date;
  if v_taken > v_today or v_taken < v_today - 2 then
    raise exception '064 refused: counts_taken_on % is not within the last 2 days (today %); re-count first', v_taken, v_today;
  end if;

  foreach v_key in array c_count_keys loop
    if (c_cfg->>v_key) !~ '^\d{1,7}$' then
      raise exception '064 refused: % is not an approved whole-number count', v_key;
    end if;
  end loop;

  -- 3. Migration 063 is applied. ------------------------------------------------------
  select string_agg(f, ', ') into v_bad from unnest(array[
    'public.create_court_reservation(text,text,text,text,text,date,text,integer,text,text,text,text,text)',
    'public.track_court_reservation(text,text)','public.get_reservation_slots(date)',
    'public.get_reservation_slots_range(date,date)','public.generate_reservation_reference(integer)']) f
  where to_regprocedure(f) is null
     or has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE');
  if v_bad is not null then raise exception '064 refused: migration 063 is not applied (client EXECUTE on %)', v_bad; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = any(c_full_targets)
              and cmd in ('INSERT','UPDATE','DELETE','ALL'))
     or has_table_privilege('anon','public.reservations','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated','public.reservations','SELECT,INSERT,UPDATE,DELETE') then
    raise exception '064 refused: migration 063 is not applied (client write path on a retired table)';
  end if;

  -- 4. Lock the targets and their dependants for the rest of the transaction. --------
  -- EXCLUSIVE still allows reads; it blocks every concurrent write so the counts
  -- checked below are the counts deleted.
  lock table public.reservations, public.medical_programs, public.health_events, public.medicine_stock,
             public.nurse_availability, public.waste_schedule in exclusive mode;
  lock table public.notifications, public.notification_reads in share row exclusive mode;
  lock table public.sms_broadcasts, public.sms_source_rules in share mode;

  -- 5. No unresolved future booking. ---------------------------------------------------
  select count(*) into v_n from public.reservations
  where status in ('pending','approved') and preferred_date >= v_today;
  if v_n > 0 then
    raise exception '064 refused: % future pending/approved reservation(s) remain; resolve them and inform the requesters first', v_n;
  end if;

  -- 6. No SMS history or source rule depends on a health source. ----------------------
  select (select count(*) from public.sms_broadcasts where source_type in ('health_event','medical_program'))
       + (select count(*) from public.sms_source_rules where source_type in ('health_event','medical_program')) into v_n;
  if v_n > 0 then
    raise exception '064 refused: % SMS broadcast/source rule(s) use a health source; SMS history must not be broken', v_n;
  end if;

  -- 7. Notification data is consistent with its category. -----------------------------
  if exists (select 1 from public.notifications where (entity_type = 'reservation') <> (category = 'reservation')) then
    raise exception '064 refused: a notification mixes the reservation category and entity type';
  end if;

  -- 8. Capture the exact target ids and compare with the approved counts. -------------
  v_notif := array(select id from public.notifications where category = 'reservation' order by id);
  select count(*) into v_reads from public.notification_reads where notification_id = any(v_notif);
  v_res   := array(select id from public.reservations order by id);
  v_prog  := array(select id from public.medical_programs order by id);
  v_hev   := array(select id from public.health_events order by id);
  v_med   := array(select id from public.medicine_stock order by id);
  v_nurse := array(select id from public.nurse_availability order by id);
  v_waste := array(select id from public.waste_schedule order by id);

  select string_agg(format('%s expected %s found %s', k, e, f), '; ') into v_bad from (values
    ('reservation_notification_reads', (c_cfg->>'expected_reservation_notification_reads')::bigint, v_reads),
    ('reservation_notifications', (c_cfg->>'expected_reservation_notifications')::bigint, cardinality(v_notif)::bigint),
    ('reservations',       (c_cfg->>'expected_reservations')::bigint,       cardinality(v_res)::bigint),
    ('medical_programs',   (c_cfg->>'expected_medical_programs')::bigint,   cardinality(v_prog)::bigint),
    ('health_events',      (c_cfg->>'expected_health_events')::bigint,      cardinality(v_hev)::bigint),
    ('medicine_stock',     (c_cfg->>'expected_medicine_stock')::bigint,     cardinality(v_med)::bigint),
    ('nurse_availability', (c_cfg->>'expected_nurse_availability')::bigint, cardinality(v_nurse)::bigint),
    ('waste_schedule',     (c_cfg->>'expected_waste_schedule')::bigint,     cardinality(v_waste)::bigint)) x(k, e, f)
  where e <> f;
  if v_bad is not null then raise exception '064 refused: count mismatch: %', v_bad; end if;

  -- 9. Fingerprint everything that must survive. --------------------------------------
  for v_rel in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind in ('r','p')
                 and c.relname <> all(c_full_targets || c_partial_targets) order by 1 loop
    execute format('select count(*)||'':''||coalesce(md5(string_agg(md5(t::text), '''' order by md5(t::text))), ''-'') from %s t', v_rel) into v_fp;
    v_before := v_before || jsonb_build_object(v_rel::text, v_fp);
  end loop;
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp
    from public.notifications t where t.category <> 'reservation';
  v_before := v_before || jsonb_build_object('notifications(non-reservation)', v_fp);
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp
    from public.notification_reads t where t.notification_id <> all(v_notif);
  v_before := v_before || jsonb_build_object('notification_reads(non-reservation)', v_fp);
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp from auth.users t;
  v_before := v_before || jsonb_build_object('auth.users', v_fp);

  -- 10. Delete, in order, by captured id only; each statement must hit its count. -----
  delete from public.notification_reads where notification_id = any(v_notif);
  get diagnostics v_n = row_count;
  if v_n <> v_reads then raise exception '064 aborted: notification_reads deleted % of %', v_n, v_reads; end if;

  delete from public.notifications where id = any(v_notif) and category = 'reservation';
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_notif) then raise exception '064 aborted: notifications deleted % of %', v_n, cardinality(v_notif); end if;

  delete from public.reservations where id = any(v_res);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_res) then raise exception '064 aborted: reservations deleted % of %', v_n, cardinality(v_res); end if;

  delete from public.medical_programs where id = any(v_prog);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_prog) then raise exception '064 aborted: medical_programs deleted % of %', v_n, cardinality(v_prog); end if;

  delete from public.health_events where id = any(v_hev);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_hev) then raise exception '064 aborted: health_events deleted % of %', v_n, cardinality(v_hev); end if;

  delete from public.medicine_stock where id = any(v_med);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_med) then raise exception '064 aborted: medicine_stock deleted % of %', v_n, cardinality(v_med); end if;

  delete from public.nurse_availability where id = any(v_nurse);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_nurse) then raise exception '064 aborted: nurse_availability deleted % of %', v_n, cardinality(v_nurse); end if;

  delete from public.waste_schedule where id = any(v_waste);
  get diagnostics v_n = row_count;
  if v_n <> cardinality(v_waste) then raise exception '064 aborted: waste_schedule deleted % of %', v_n, cardinality(v_waste); end if;

  -- 11. Verify before commit. -----------------------------------------------------------
  foreach v_key in array c_full_targets loop
    execute format('select count(*) from public.%I', v_key) into v_n;
    if v_n <> 0 then raise exception '064 verify: target % not empty (% rows)', v_key, v_n; end if;
  end loop;
  if exists (select 1 from public.notifications where category = 'reservation')
     or exists (select 1 from public.notification_reads where notification_id = any(v_notif)) then
    raise exception '064 verify: reservation notifications or read marks remain';
  end if;

  for v_rel in select c.oid::regclass from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relkind in ('r','p')
                 and c.relname <> all(c_full_targets || c_partial_targets) order by 1 loop
    execute format('select count(*)||'':''||coalesce(md5(string_agg(md5(t::text), '''' order by md5(t::text))), ''-'') from %s t', v_rel) into v_fp;
    v_after := v_after || jsonb_build_object(v_rel::text, v_fp);
  end loop;
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp
    from public.notifications t where t.category <> 'reservation';
  v_after := v_after || jsonb_build_object('notifications(non-reservation)', v_fp);
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp
    from public.notification_reads t where t.notification_id <> all(v_notif);
  v_after := v_after || jsonb_build_object('notification_reads(non-reservation)', v_fp);
  select count(*)||':'||coalesce(md5(string_agg(md5(t::text), '' order by md5(t::text))), '-') into v_fp from auth.users t;
  v_after := v_after || jsonb_build_object('auth.users', v_fp);

  if v_after <> v_before then
    select string_agg(k, ', ') into v_bad from jsonb_each_text(v_before) b(k, v)
    where v_after->>k is distinct from v;
    raise exception '064 verify: data outside the targets changed: %', coalesce(v_bad, '(table set changed)');
  end if;

  -- Structure untouched: nothing was dropped and the kept functions remain.
  select string_agg(f, ', ') into v_bad from unnest(array[
    'public.normalize_reservation_reference(text)','public.track_complaint(text,text)',
    'public.sms_source_content(text,text)','public.search_case_residents(text)',
    'public.link_complaint_party(uuid,text,uuid)','public.reservation_slot_hour(text)']) f
  where to_regprocedure(f) is null;
  if v_bad is not null then raise exception '064 verify: a kept function is missing: %', v_bad; end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.reservations'::regclass and not tgisinternal) <> 4
     or not exists (select 1 from pg_constraint where conname = 'reservations_no_overlapping_slots') then
    raise exception '064 verify: reservation structure changed';
  end if;

  raise notice '064 complete: deleted % read mark(s), % notification(s), % reservation(s), % medical program(s), % health event(s), % medicine row(s), % nurse slot(s), % waste row(s). Approved by: %. Retention: %. Bookings: %. Export manifest SHA-256: %. Restore rehearsal: %. Counts taken on %.',
    v_reads, cardinality(v_notif), cardinality(v_res), cardinality(v_prog), cardinality(v_hev), cardinality(v_med),
    cardinality(v_nurse), cardinality(v_waste), c_cfg->>'approved_by', c_cfg->>'retention_authorization',
    c_cfg->>'booking_resolution', c_cfg->>'export_manifest_sha256', c_cfg->>'restore_rehearsal', c_cfg->>'counts_taken_on';
end
$m064$;

commit;
