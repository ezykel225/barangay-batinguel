-- ============================================================
-- Barangay Batinguel E-System
-- 022 — in-app notifications
-- ============================================================
-- STATUS: APPLIED to the live project (mpcyqwasurhtdztzobwg) on
-- 2026-10-01 via the Supabase connector, in TWO steps:
--
--   `in_app_notifications`                 -- everything below, and
--   `notifications_transition_guard_only`  -- which DROPPED the unique
--                                             index the first step
--                                             created. See the
--                                             DUPLICATE PREVENTION
--                                             section; the index was
--                                             wrong, and this file
--                                             records the shape that is
--                                             actually live.
--
-- Verification results are at the foot of this file. Every probe ran
-- inside a transaction that was rolled back, against synthetic accounts
-- only (uuids 0000...0001 through 0005, emails at example.invalid). No
-- production resident data was read into a probe or modified.
--
-- ─── WHAT THIS ADDS ───────────────────────────────────────────────────
-- Two tables, five functions, four triggers. In-app only: there is no
-- browser push, no Web Push, no service worker, no VAPID, no email and
-- no new SMS. The existing SMS Edge Function is untouched.
--
--   notifications       -- what happened, and who it is addressed to
--   notification_reads  -- who has seen which one
--
-- ─── WHY TWO TABLES AND NOT A DERIVED FEED ────────────────────────────
-- A derived feed (scan document_requests + reservations + profiles and
-- synthesise a list) needs no migration, and was rejected because it
-- cannot answer "is this new to you". The only read-state the schema had
-- was `resident_viewed_at`, which exists on two tables, nothing like it
-- exists for officials, and it marks a ROW as seen rather than an EVENT.
-- A request that goes approved -> ready_for_pickup -> claimed is three
-- things a resident needs to be told, and one timestamp can only
-- remember the last of them.
--
-- ⚠️ AUDIENCE IS RESOLVED AT READ TIME, NOT FANNED OUT AT WRITE TIME.
-- A queue notification stores `audience = 'secretary'` and no recipient.
-- Who that is gets decided when somebody reads it, by
-- can_see_audience() against the live directory. The alternative --
-- inserting one row per official at write time -- would have to resolve
-- the position through the profiles.full_name = barangay_officials.full_name
-- string join AT THAT MOMENT and freeze the answer, so a newly appointed
-- Secretary would never see the backlog and an archived one would keep
-- receiving it. Resolving at read time means archiving an official
-- revokes their queue the same instant it revokes their position powers
-- (018), with no row rewritten. Verified below.
--
-- ─── ⚠️ DUPLICATE PREVENTION: THE TRANSITION GUARD, AND NOTHING ELSE ──
-- The design review proposed
--   UNIQUE (audience, recipient_id, entity_type, entity_id, event)
-- and that is WRONG. It asserts each entity can produce each event at
-- most once ever, which this system contradicts by design: `rejected`
-- is resubmittable, a resident may return their own account to
-- `pending`, and so an account can legitimately go
-- pending -> rejected -> pending -> rejected -> pending. Under that key
-- only the FIRST notification of each kind would ever exist, and -- the
-- part that makes it dangerous -- the trigger swallows its own
-- exceptions, so the suppression would be silent.
--
-- This migration first tried to rescue the idea with a key that looked
-- correct: the same columns plus `source_changed_at`
-- (= statement_timestamp()), NULLS NOT DISTINCT, on the theory that two
-- notifications collide only if they came from the same statement.
-- THAT WAS ALSO WRONG, and it failed on the first probe.
-- statement_timestamp() is per STATEMENT, not per row change, so five
-- genuine transitions sent as one multi-statement batch all shared it:
--
--   rejected -> pending -> rejected -> pending -> verified
--     expected  3 officials/submitted, 2 resident/rejected, 1 verified
--     measured  1                    , 1                  , 1
--
-- Four real notifications were dropped, and the only trace was three
-- `23505 ... notifications_one_per_transition` lines in the Postgres log
-- from the trigger's own RAISE WARNING. The index was dropped.
--
-- So duplicate prevention is the transition guard:
--
--   IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL;
--
-- It cannot suppress a genuine later cycle, because it only ever
-- compares one row change against itself. It covers every duplicate
-- that can actually occur at runtime:
--
--   * a no-op write, or an UPDATE touching other columns -> nothing
--   * a double-clicked Approve -> the second UPDATE has OLD.status
--     already 'approved' -> nothing
--   * two officials deciding concurrently -> the second waits on the
--     row lock and RE-READS the row, so its OLD already carries the new
--     status -> nothing
--
-- `source_changed_at` is kept as a diagnostic column only, and is
-- commented as such in the database.
--
-- ─── ⚠️ A NOTIFICATION MUST NEVER ROLL BACK THE DECISION IT ANNOUNCES ─
-- An exception raised in an AFTER trigger aborts the whole statement, so
-- each trigger body is wrapped in its own exception block that ends in
-- RAISE WARNING. The approve, decline or verification stands; the
-- failure is diagnosable in the Postgres log. Verified below in both
-- directions.
--
-- This is the same boundary the SMS Edge Function draws by answering 200
-- with { sent: false, reason } for every delivery problem: telling
-- somebody is not part of deciding. The read-mark trigger is the
-- deliberate exception -- it RAISES, because a read mark is not a
-- business operation to protect.
--
-- ─── ⚠️ NO PERSON'S NAME IS STORED IN A NOTIFICATION ──────────────────
-- A queue notification says a document request is waiting, not whose it
-- is. The name is already in document_requests, which the Secretary
-- reads anyway, and copying it here would duplicate resident PII into a
-- second table where it could also go stale. `subject` holds a RAW
-- STORED VALUE and never a sentence: document_requests.document_type,
-- or reservations.preferred_date as 'YYYY-MM-DD'. The client formats it.
--
-- No user-facing wording is stored either. The words live in
-- src/utils/notificationLabels.js, with every other label this project
-- shows, so the Resident and Official portals cannot be given different
-- words for the same event -- the rule displayLabels.js and
-- residentGroups.js already exist to hold.
--
-- ⚠️ `link_tab` IS A HINT, NOT AUTHORIZATION. It names the dashboard tab
-- that answers the notification. RLS still decides what that tab may
-- load, exactly as it does when the tab is reached from the sidebar.
--
-- ─── NOT IN THIS MIGRATION, DELIBERATELY ──────────────────────────────
--   * Realtime. supabase_realtime still publishes ZERO tables, and
--     nothing here enables it. The bell refetches with the data the
--     dashboard already loads; there is no polling loop.
--   * The nurse. No nurse audience and no nurse bell: her work has no
--     asynchronous decision waiting on anybody.
--   * Retention. History is kept indefinitely, as decided. There is no
--     pruning job, no cron and no archival. A production deployment
--     wants a retention policy; this is a capstone dataset.
--   * `cancelled` reservations are not announced. The only parties who
--     can reach that status are the resident themselves and a direct
--     database connection.
-- ============================================================

-- ── 1. The two tables ────────────────────────────────────────

create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- 'resident' is one person and carries recipient_id. The other three
  -- are groups, resolved at READ time -- see the header.
  audience          text not null
                      check (audience in ('resident','secretary','treasurer','officials')),
  recipient_id      uuid references auth.users(id) on delete cascade,

  category          text not null
                      check (category in ('document_request','reservation','verification')),
  event             text not null
                      check (event in ('submitted','approved','declined',
                                       'ready_for_pickup','claimed',
                                       'verified','rejected','ineligible')),
  entity_type       text not null
                      check (entity_type in ('document_request','reservation','resident_account')),
  entity_id         uuid not null,

  -- A raw stored value, never a sentence and never a name.
  subject           text,

  -- Which dashboard tab answers this. A HINT, never authorization.
  link_tab          text,

  -- Read only for a reservation notification: the booking asked for an
  -- office-hours exception. Flagged inside the one notification rather
  -- than sent as a second one.
  is_exception      boolean not null default false,

  -- DIAGNOSTIC ONLY. Not an idempotency key -- see the header.
  source_changed_at timestamptz not null,

  -- One person xor a group. A 'resident' row without a recipient would
  -- be unreachable; a group row with one would be a fan-out copy.
  constraint notifications_audience_matches_recipient
    check ((audience = 'resident') = (recipient_id is not null))
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

-- ⚠️ THERE IS NO UNIQUE INDEX HERE, AND ONE MUST NOT BE ADDED.
-- The header records the measurement: both keys that were tried
-- silently suppressed legitimate notifications.
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc)
  where recipient_id is not null;

create index if not exists notifications_audience_idx
  on public.notifications (audience, created_at desc)
  where recipient_id is null;

create index if not exists notifications_entity_idx
  on public.notifications (entity_type, entity_id, created_at desc);

create index if not exists notification_reads_user_idx
  on public.notification_reads (user_id);

comment on column public.notifications.source_changed_at is
  'statement_timestamp() of the statement that changed the source row. Diagnostic only -- it is NOT an idempotency key; see migration 022.';

-- ── 2. Who may see a group audience ──────────────────────────
--
-- SECURITY DEFINER for the reason term_is_confirmed() is (019A): an
-- inline EXISTS in the policy would inherit the caller's own view of
-- profiles and barangay_officials, so changing those policies later
-- would silently change which notifications are visible. That coupling
-- is what would have let an archived Treasurer keep approval rights in
-- 018.
--
-- `bo.archived_at IS NULL` mirrors the Secretary and Treasurer UPDATE
-- policies exactly. Archiving an official revokes their position
-- powers, so it has to revoke their sight of the queue too.
--
-- ⚠️ 'resident' returns FALSE for everybody. A resident notification is
-- reached by recipient_id, never by audience; if this returned true for
-- that value, every resident would see every other resident's
-- notifications.
create or replace function public.can_see_audience(p_audience text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case p_audience
    when 'officials' then public.is_official(auth.uid())
    when 'secretary' then exists (
      select 1 from public.profiles p
      join public.barangay_officials bo on bo.full_name = p.full_name
      where p.id = auth.uid()
        and bo.position = 'Barangay Secretary'
        and bo.archived_at is null)
    when 'treasurer' then exists (
      select 1 from public.profiles p
      join public.barangay_officials bo on bo.full_name = p.full_name
      where p.id = auth.uid()
        and bo.position = 'Barangay Treasurer'
        and bo.archived_at is null)
    else false
  end;
$fn$;

-- Is THIS notification visible to the caller? The single authority,
-- used by both the read-mark trigger and the read-mark policy, so
-- "I can read it" and "I may mark it read" cannot drift apart.
create or replace function public.notification_is_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.notifications n
    where n.id = p_id
      and ((n.recipient_id is not null and n.recipient_id = auth.uid())
           or (n.recipient_id is null and public.can_see_audience(n.audience)))
  );
$fn$;

-- ── 3. RLS ───────────────────────────────────────────────────

alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists "Users can read notifications addressed to them" on public.notifications;
create policy "Users can read notifications addressed to them"
  on public.notifications for select
  using (
    (recipient_id is not null and recipient_id = auth.uid())
    or (recipient_id is null and public.can_see_audience(audience))
  );

-- NO insert, update or delete policy on notifications. A client never
-- writes one; the triggers do, server-side.

drop policy if exists "Users can read their own read marks" on public.notification_reads;
create policy "Users can read their own read marks"
  on public.notification_reads for select
  using (user_id = auth.uid());

-- ⚠️ BOTH HALVES MATTER. `user_id = auth.uid()` alone would let a
-- signed-in user mark ANY notification id as read -- a write against a
-- row they cannot see, which also confirms the id exists. The
-- visibility check is the real gate, and it is the requirement that
-- this must verify the target is visible rather than merely stamp the
-- caller's own id onto it.
drop policy if exists "Users can mark a notification they can see as read" on public.notification_reads;
create policy "Users can mark a notification they can see as read"
  on public.notification_reads for insert
  with check (user_id = auth.uid() and public.notification_is_visible(notification_id));

-- No UPDATE and no DELETE policy: a read mark is not un-made.

-- ── 4. Privileges: the second barrier (019A's pattern) ───────
--
-- Supabase grants full DML on a new public table by default, so the
-- absent write policies would otherwise be the ONLY thing stopping a
-- forged notification. Revoking as well means the write is refused at
-- the privilege layer first -- 42501, not RLS's silent zero rows -- and
-- a permissive policy added later by mistake still cannot write.
--
-- anon gets nothing at all: a notification is never addressed to a
-- caller with no uid, so a grant would only make the refusal quieter.

revoke all on public.notifications      from anon, authenticated;
revoke all on public.notification_reads from anon, authenticated;

grant select on public.notifications to authenticated;
grant select, insert on public.notification_reads to authenticated;

-- ── 5. The writer ────────────────────────────────────────────
--
-- One place the insert happens. Not callable by a client: the
-- EXECUTE-to-PUBLIC grant that new functions get is revoked, so the
-- only callers are the three SECURITY DEFINER triggers below.
create or replace function public.record_notification(
  p_audience     text,
  p_recipient    uuid,
  p_category     text,
  p_event        text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_subject      text,
  p_link_tab     text,
  p_is_exception boolean
) returns void
language sql
set search_path = public
as $fn$
  insert into public.notifications
    (audience, recipient_id, category, event, entity_type, entity_id,
     subject, link_tab, is_exception, source_changed_at)
  values
    (p_audience, p_recipient, p_category, p_event, p_entity_type, p_entity_id,
     p_subject, p_link_tab, coalesce(p_is_exception, false), statement_timestamp());
$fn$;

revoke all on function public.record_notification(
  text, uuid, text, text, text, uuid, text, text, boolean
) from public, anon, authenticated;

-- ── 6. The read-mark guard ───────────────────────────────────
--
-- stamp_activity_actor's pattern (015): identity is TAKEN from the
-- caller's token, never accepted from the client. Verified below -- a
-- forged user_id is overwritten with the caller's, not merely rejected.
--
-- Unlike the notification triggers, this one RAISES. A read mark is not
-- a business operation, so there is nothing to protect by swallowing.
create or replace function public.stamp_notification_read()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- A direct database connection (SQL Editor, psql, a migration) is not
  -- an API caller. Same carve-out as the protect_* triggers, and for the
  -- same reason: without it the SQL Editor cannot fix anything.
  if auth.role() is null or auth.role() = 'service_role' then
    return new;
  end if;

  new.user_id := auth.uid();
  new.read_at := now();

  if new.user_id is null then
    raise exception 'A read mark needs a signed-in user.';
  end if;

  if not public.notification_is_visible(new.notification_id) then
    raise exception 'That notification is not yours to mark as read.';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_stamp_notification_read on public.notification_reads;
create trigger trg_stamp_notification_read
  before insert on public.notification_reads
  for each row execute function public.stamp_notification_read();

-- ── 7. The three sources ─────────────────────────────────────
--
-- Each body is wrapped in its own exception block -- see the header.
-- Each produces AT MOST ONE notification per call, which is why one
-- block per function is enough.

create or replace function public.notify_document_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  begin
    if tg_op = 'INSERT' then
      -- The Secretary's review queue. No requester name is stored.
      if new.status = 'pending' then
        perform public.record_notification(
          'secretary', null, 'document_request', 'submitted',
          'document_request', new.id, new.document_type, 'documents', false);
      end if;
      return null;
    end if;

    -- THE TRANSITION GUARD. See the header.
    if new.status is not distinct from old.status then return null; end if;

    -- A request filed with no account has nobody to tell.
    if new.resident_id is null then return null; end if;

    -- Don't announce to somebody what they just did themselves.
    if v_actor is not null and v_actor = new.resident_id then return null; end if;

    if new.status in ('approved','declined','ready_for_pickup','claimed') then
      perform public.record_notification(
        'resident', new.resident_id, 'document_request', new.status,
        'document_request', new.id, new.document_type, 'documents', false);
    end if;
    return null;
  exception when others then
    raise warning 'notify_document_request (%) left no notification for %: % [%]',
      tg_op, new.id, sqlerrm, sqlstate;
    return null;
  end;
end;
$fn$;

drop trigger if exists trg_notify_document_request on public.document_requests;
create trigger trg_notify_document_request
  after insert or update on public.document_requests
  for each row execute function public.notify_document_request();

create or replace function public.notify_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  begin
    if tg_op = 'INSERT' then
      -- The Treasurer's queue. An office-hours exception is FLAGGED on
      -- this one row, not sent as a second notification.
      if new.status = 'pending' then
        perform public.record_notification(
          'treasurer', null, 'reservation', 'submitted',
          'reservation', new.id, to_char(new.preferred_date, 'YYYY-MM-DD'),
          'reservations', new.exception_reason is not null);
      end if;
      return null;
    end if;

    if new.status is not distinct from old.status then return null; end if;

    -- ⚠️ A WALK-IN BOOKING HAS NO ACCOUNT, and that is by design -- see
    -- the anon INSERT policy (008). Nothing to notify, and nothing
    -- wrong.
    if new.resident_id is null then return null; end if;

    -- A resident cancelling their own booking tells them nothing new.
    if v_actor is not null and v_actor = new.resident_id then return null; end if;

    -- Decisions only. 'cancelled' is deliberately not announced.
    if new.status in ('approved','declined') then
      perform public.record_notification(
        'resident', new.resident_id, 'reservation', new.status,
        'reservation', new.id, to_char(new.preferred_date, 'YYYY-MM-DD'),
        'reservations', new.exception_reason is not null);
    end if;
    return null;
  exception when others then
    raise warning 'notify_reservation (%) left no notification for %: % [%]',
      tg_op, new.id, sqlerrm, sqlstate;
    return null;
  end;
end;
$fn$;

drop trigger if exists trg_notify_reservation on public.reservations;
create trigger trg_notify_reservation
  after insert or update on public.reservations
  for each row execute function public.notify_reservation();

create or replace function public.notify_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor uuid := auth.uid();
begin
  begin
    -- Officials and the nurse are created by hand and have no
    -- verification workflow.
    if coalesce(new.role, '') <> 'resident' then return null; end if;

    if tg_op = 'INSERT' then
      -- handle_new_resident_signup creates this row server-side, so a
      -- signup reaches the officials' queue without the client asking.
      if new.verification_status = 'pending' then
        perform public.record_notification(
          'officials', null, 'verification', 'submitted',
          'resident_account', new.id, null, 'residents', false);
      end if;
      return null;
    end if;

    if new.verification_status is not distinct from old.verification_status then
      return null;
    end if;

    -- ⚠️ ENTERING pending is a review request WHOEVER caused it: a
    -- resubmission after `rejected`, or the verified -> pending drop
    -- prevent_role_self_change applies when an owner renames themselves.
    -- The audience is a group, so there is no "self" to skip here.
    if new.verification_status = 'pending' then
      perform public.record_notification(
        'officials', null, 'verification', 'submitted',
        'resident_account', new.id, null, 'residents', false);
      return null;
    end if;

    -- A decision ABOUT the account, told to its owner.
    if v_actor is not null and v_actor = new.id then return null; end if;

    if new.verification_status in ('verified','rejected','ineligible') then
      perform public.record_notification(
        'resident', new.id, 'verification', new.verification_status,
        'resident_account', new.id, null,
        -- `rejected` means "fix and resubmit", so it points at the tab
        -- where a resident corrects their details.
        case when new.verification_status = 'rejected' then 'settings' else 'dashboard' end,
        false);
    end if;
    return null;
  exception when others then
    raise warning 'notify_verification (%) left no notification for %: % [%]',
      tg_op, new.id, sqlerrm, sqlstate;
    return null;
  end;
end;
$fn$;

drop trigger if exists trg_notify_verification on public.profiles;
create trigger trg_notify_verification
  after insert or update on public.profiles
  for each row execute function public.notify_verification();

-- ============================================================
-- VERIFICATION — run 2026-10-01, every probe inside a rolled-back
-- transaction, against synthetic accounts only.
-- ============================================================
--
-- WHAT GETS CREATED
--   [x] resident signup (profiles INSERT, pending)
--         -> 1 officials/submitted, link_tab 'residents'
--   [x] pending -> rejected -> pending -> rejected -> pending -> verified
--         -> 3 officials/submitted, 2 resident/rejected, 1 resident/verified
--         ⚠️ THIS IS THE PROBE THAT CAUGHT THE BAD UNIQUE INDEX, which
--            returned 1 / 1 / 1. See the header.
--   [x] a second no-op write of the same status      -> nothing
--   [x] an UPDATE of contact_number only             -> nothing
--   [x] walk-in booking (resident_id NULL) submitted -> 1 treasurer, and
--         its later approval -> 0 resident notifications
--   [x] account booking submitted + approved -> 1 treasurer + 1 resident
--   [x] exception booking (10:00 AM, reason) -> is_exception = TRUE on the
--         treasurer notification AND on the resident one, ONE row each,
--         not duplicated
--   [x] subject holds the raw value: '2026-12-02', 'Barangay Clearance'
--   [x] resident cancels their own booking -> 0 notifications
--
-- WHO CAN SEE WHAT (four synthetic notifications: one per audience)
--   [x] the addressed resident      1  (resident)
--   [x] a DIFFERENT resident        0  (none)
--   [x] a plain official            1  (officials)
--   [x] the Secretary               2  (officials, secretary)
--   [x] the Treasurer               2  (officials, treasurer)
--   [x] anon                        42501 -- refused at the PRIVILEGE
--         layer, before RLS is consulted
--   [x] the Treasurer AFTER archiving their directory row
--                                   1  (officials only -- the treasurer
--         queue is gone, their plain-official sight remains)
--
-- WRITES, as an authenticated resident
--   [x] forge a notification for yourself        -> 42501
--   [x] mark your own notification read          -> accepted
--   [x] mark a notification you CANNOT see read  -> P0001 "That
--         notification is not yours to mark as read."
--   [x] mark your own read AS ANOTHER USER       -> the forged user_id is
--         OVERWRITTEN with the caller's. Verified in isolation, because
--         the first run of this probe returned 23505 against the read
--         mark the previous probe had already made -- a refusal that
--         proved nothing about which step produced it.
--   [x] delete a read mark                       -> 42501 (no privilege,
--         and no DELETE policy)
--
-- A FAILURE MUST NOT ROLL BACK THE DECISION  (forced with a
-- `CHECK (false) NOT VALID` constraint on notifications)
--   [x] baseline first, so "0 written" means something:
--         decision with the constraint absent  -> 1 notification written
--   [x] decision with every notification insert failing
--         -> 0 notifications, and document_requests.status IS 'claimed'.
--            The business operation survived.
--   [x] the RAISE WARNING reaches the Postgres log and names the trigger,
--         the entity, SQLERRM and SQLSTATE. Confirmed by reading
--         postgres_logs:
--           "notify_document_request (UPDATE) left no notification for
--            ...d1: new row ... violates check constraint
--            "zz_force_failure" [23514]"
--         ⚠️ That log is also the ONLY reason the bad unique index was
--            diagnosable -- it is where the three swallowed
--            `23505 notifications_one_per_transition` lines were found.
--
-- INSTALLED SHAPE
--   [x] all 7 new functions carry `SET search_path = public`
--   [x] get_advisors (security) run immediately after: no new class of
--         finding. The SECURITY DEFINER-callable-by-anon warning now
--         lists 18 functions, 13 of which pre-date this migration; the
--         four new trigger functions raise 0A000 if called directly, and
--         can_see_audience / notification_is_visible must stay callable
--         because the policies evaluate them as the querying user.
--
-- NOT CHANGED BY THIS MIGRATION, all re-verified above
--   [x] the Treasurer-only reservation UPDATE policy
--   [x] the Secretary-only document request UPDATE policy
--   [x] protect_reservation_status's allowlist (see 023)
--   [x] protect_document_request_status
--   [x] get_reservation_slots / _range -- neither touched, and neither
--         gained a column. exception_reason is still not in either.
--   [x] activity_log and its vocabulary. A notification is NOT an audit
--         entry: no action and no entity_type was added, and nothing
--         here writes to activity_log.
--   [x] the SMS Edge Function and notifyResident()
-- ============================================================
