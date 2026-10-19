import fs from 'fs'
import path from 'path'
const read = (file) => fs.readFileSync(path.join(__dirname,'../../supabase-migrations',file),'utf8').replace(/\r\n/g,'\n')
const sql = (text) => text.replace(/--[^\n]*/g,'').replace(/\s+/g,' ').toLowerCase()
const accounts = read('052_tanod_accounts_and_duty.sql')
const access = read('053_tanod_incident_access.sql')
const source = sql(accounts + access)

describe('Tanod installation prerequisites fail before migration changes (static contracts)', () => {
  const guard = (text) => text.split('do $prerequisites$')[1].split('$prerequisites$;')[0]
  const guard052 = sql(guard(accounts))
  const guard053 = sql(guard(access))

  test.each([[accounts, 'alter table public.profiles'], [access, 'create table public.tanod_incident_notes']])(
    'prerequisite exceptions precede the first schema mutation', (text, mutation) => {
      const end = text.indexOf('$prerequisites$;') + '$prerequisites$;'.length
      expect(end).toBeGreaterThan(0)
      expect(text.indexOf(mutation)).toBeGreaterThan(end)
      expect(text.slice(0, end)).not.toMatch(/(?:create|alter|drop)\s+(?:table|function|policy|index)/i)
      expect(guard(text)).toContain('raise exception')
    }
  )

  test.each([guard052, guard053])('requires the genuine 051 incident-case table contract', (text) => {
    expect(text).toContain("('public.incident_case_links', '4')")
    for (const column of ['incident_id', 'case_id', 'linked_by']) {
      expect(text).toContain(`('public.incident_case_links', '${column}', 'uuid', true)`)
    }
    expect(text).toContain("('public.incident_case_links', 'linked_at', 'timestamp with time zone', true)")
    expect(text).toContain("('public.incident_case_links', 'incident_id', 'p')")
    expect(text).toContain("('public.incident_case_links', 'incident_id', 'public.incidents', 'r')")
    expect(text).toContain("('public.incident_case_links', 'case_id', 'public.kp_cases', 'r')")
    expect(text).toContain("('public.incident_case_links', 'linked_by', 'public.profiles', 'a')")
    expect(text).toMatch(/if v_table is null then raise exception/)
    expect(text).toMatch(/relkind = 'r' and relrowsecurity\) then raise exception/)
    expect(text).toContain('a.atttypid = pg_catalog.to_regtype(v_required.type_name)')
    expect(text).toContain('a.attnotnull = v_required.not_null')
    expect(text).toContain('has incompatible columns')
    expect(text).toContain('has an incompatible type/nullability')
    expect(text).toContain('c.conkey = array[a.attnum] and c.confkey = array[target.attnum]')
    expect(text).toContain('c.confdeltype::text = v_required.delete_action')
    expect(text).toContain('requires its original foreign key')
  })

  test.each([guard052, guard053])('rejects effective table/column client grants and explicit PUBLIC grants', (text) => {
    for (const role of ['anon', 'authenticated']) {
      expect(text).toContain(`has_table_privilege('${role}', v_table`)
      expect(text).toContain(`has_any_column_privilege('${role}', v_table`)
    }
    expect(text).toContain('aclexplode(coalesce(c.relacl')
    expect(text).toContain('aclexplode(a.attacl)')
    expect(text).toContain('acl.grantee = 0')
    expect(text).toContain('must have no public/anon/authenticated direct privileges')
  })

  test('053 requires all three 052 private table schemas, nullability and defaults', () => {
    expect(guard053).toContain("('public.tanod_account_links', '4')")
    expect(guard053).toContain("('public.tanod_attendance', '6')")
    expect(guard053).toContain("('public.tanod_operation_events', '6')")
    for (const col of ['id','assignment_id','tanod_id','profile_id']) {
      expect(guard053).toContain(`('public.tanod_attendance', '${col}', 'uuid', true)`)
    }
    expect(guard053).toContain("('public.tanod_attendance', 'checked_out_at', 'timestamp with time zone', false)")
    expect(guard053).toContain("('public.tanod_attendance', 'checked_in_at', 'now()')")
    expect(guard053).toContain('requires its original server default')
    expect(guard053).toContain('attendance checkout chronology check from 052 is required')
  })

  test('053 requires exactly the validated four-role single-column CHECK, not just a tanod substring', () => {
    expect(guard053).toContain("c.conname = 'profiles_role_check' and c.contype = 'c'")
    expect(guard053).toContain('c.convalidated and c.conkey = array[a.attnum]')
    expect(guard053).toContain("v_roles is distinct from array['nurse','official','resident','tanod']::text[]")
    expect(guard053).toContain("'checkrole=anyarray[,,,]'")
    expect(guard053).toContain('profiles_role_check must allow exactly official/nurse/resident/tanod from 052')
  })

  test('053 requires valid immediate account/assignment keys and exact open-checkin uniqueness', () => {
    for (const key of [
      "('public.tanod_account_links', 'tanod_id', 'p')",
      "('public.tanod_account_links', 'profile_id', 'u')",
      "('public.tanod_attendance', 'assignment_id', 'u')"
    ]) expect(guard053).toContain(key)
    expect(guard053).toContain('c.convalidated and not c.condeferrable and i.indisunique and i.indisvalid and i.indisready')
    expect(guard053).toContain('i.indisunique and i.indisvalid and i.indisready and i.indimmediate')
    expect(guard053).toContain('i.indnkeyatts = 1 and i.indnatts = 1 and i.indkey[0] = a.attnum')
    expect(guard053).toContain("= 'checked_out_atisnull'")
    expect(guard053).toContain('the unique open-attendance index from 052 is required')
  })

  test('053 requires both private stable UUID identity resolvers with definer/empty-path hardening', () => {
    expect(guard053).toContain("('public.current_tanod_member_id()'), ('public.require_tanod_member_id()')")
    expect(guard053).toContain('p.oid = pg_catalog.to_regprocedure(v_required.signature)')
    expect(guard053).toContain("p.prokind = 'f' and p.prosecdef and p.provolatile = 's'")
    expect(guard053).toContain("not p.proretset and p.prorettype = pg_catalog.to_regtype('uuid')")
    expect(guard053).toContain(`'search_path=""' = any(p.proconfig)`)
    expect(guard053).toContain("not pg_catalog.has_function_privilege('anon', p.oid, 'execute')")
    expect(guard053).toContain("not pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')")
    expect(guard053).toContain("acl.grantee = 0 and acl.privilege_type = 'execute'")
    expect(guard053).toContain('must be the private stable uuid security definer resolver')
  })
  test('053 also rejects missing or incorrectly exposed dashboard/duty functions from a partial 052', () => {
    for (const signature of [
      'tanod_account_states()', 'set_tanod_account_link(uuid,uuid)',
      'tanod_shift_window(date,time,time)', 'tanod_my_identity()', 'tanod_my_duty()',
      'tanod_check_in(uuid)', 'tanod_check_out(uuid)', 'public_tanod_on_duty()'
    ]) expect(guard053).toContain("('public." + signature + "'")
    expect(guard053).toContain('p.prosecdef = v_required.definer')
    expect(guard053).toContain('p.proretset = v_required.returns_set')
    expect(guard053).toContain("has_function_privilege('anon', p.oid, 'execute') = v_required.anon_execute")
    expect(guard053).toContain("has_function_privilege('authenticated', p.oid, 'execute') = v_required.authenticated_execute")
    expect(guard053).toContain('must retain the 052 signature/security/execute contract')
  })
})
const body = (name) => {
  const text = accounts + access
  const match = text.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?as (\\$\\$|\\$function\\$)([\\s\\S]*?)\\1;`, 'i'))
  if (!match) throw new Error(`Missing function ${name}`)
  return sql(match[0])
}
describe('Tanod static authorization contracts (not live role impersonation)', () => {
  test('052/053 are next, ordered and explicitly depend on the existing model', () => {
    const files = fs.readdirSync(path.join(__dirname,'../../supabase-migrations')).filter((f) => /^\d{3}_/.test(f)).sort()
    expect(files.slice(-2)).toEqual(['052_tanod_accounts_and_duty.sql','053_tanod_incident_access.sql'])
    expect(accounts).toMatch(/begin;[\s\S]*?do \$prerequisites\$/)
    expect(access).toContain("to_regprocedure('public.require_tanod_member_id()')")
    expect(access).toContain('raise exception \'053 requires 052')
  })
  test('allows the new role without permitting self-signup or API role promotion', () => {
    expect(source).toContain("check (role in ('official','nurse','resident','tanod'))")
    expect(source).not.toMatch(/insert into public\.profiles|update public\.profiles|function public\.prevent_role_self_change|function public\.handle_new_resident_signup/)
    expect(read('002_close_privilege_escalation.sql')).toContain("auth.uid() = id AND role = 'resident'")
    expect(read('011_split_resident_names.sql')).toContain("NEW.raw_user_meta_data->>'role' = 'resident'")
    expect(read('007_ineligible_and_profile_edits.sql')).toContain('NEW.role IS DISTINCT FROM OLD.role AND is_api_caller')
  })
  test('all four new tables have RLS and revoked PUBLIC/anon/authenticated privileges', () => {
    for (const table of ['tanod_account_links','tanod_attendance','tanod_operation_events','tanod_incident_notes']) {
      expect(source).toContain(`alter table public.${table} enable row level security`)
      expect(source).toContain(`create table public.${table}`)
    }
    expect(sql(accounts)).toContain('revoke all on public.tanod_account_links,public.tanod_attendance,public.tanod_operation_events from public,anon,authenticated')
    expect(sql(access)).toContain('revoke all on public.tanod_incident_notes from public,anon,authenticated')
    expect(source).not.toMatch(/grant (select|insert|update|delete|all) on (table )?public\./)
  })
  test('all definers use an empty path; the only anonymous grant is the public duty reader', () => {
    const functions = [...source.matchAll(/create (?:or replace )?function public\.[\s\S]*?as (?:\$\$|\$function\$)/g)].map((m) => m[0])
    functions.filter((f) => f.includes('security definer')).forEach((f) => expect(f).toMatch(/set search_path (?:=|to) ''/))
    expect(source).toContain('from public,anon,authenticated')
    const anonGrants = source.match(/grant execute[\s\S]*?;/g).filter((g) => /to [^;]*\banon\b/.test(g))
    expect(anonGrants).toEqual(['grant execute on function public.public_tanod_on_duty() to anon,authenticated;'])
  })
  test('identity depends on auth UID, stored role, stable link and active roster, never a name', () => {
    const helper = body('current_tanod_member_id')
    expect(helper).toContain("l.profile_id = auth.uid() and p.role = 'tanod' and t.active")
    expect(helper).toContain('t.id = l.tanod_id')
    expect(helper).not.toMatch(/full_name|email/)
    expect(body('require_tanod_member_id')).toContain('auth.uid() is null or v_id is null')
    expect(source).toContain('tanod_id uuid primary key references public.tanod_members(id)')
    expect(source).toContain('profile_id uuid not null unique references public.profiles(id)')
  })
  test.each(['tanod_account_states','set_tanod_account_link','official_tanod_followups'])('%s refuses Tanods, nurses, residents and unlinked/non-admin officials', (name) => {
    expect(body(name)).toContain('public.current_official_may_administer_records()')
  })
  test('Tanods cannot link themselves or alter roster/area through the new RPCs', () => {
    expect(body('set_tanod_account_link')).toContain("role = 'tanod'")
    expect(body('set_tanod_account_link')).toContain("'previous_profile_id',v_old")
    expect(source).not.toMatch(/update public\.tanod_members|update public\.tanod_assignments/)
  })
  test('duty and reports take no caller-selected Tanod ID and derive the current identity', () => {
    for (const name of ['tanod_my_identity','tanod_my_duty','tanod_my_reports']) {
      expect(body(name)).toContain(`function public.${name}()`)
      expect(body(name)).toContain('public.require_tanod_member_id()')
    }
    expect(body('tanod_my_duty')).toContain('where a.tanod_id = v_id')
  })
  test('another Tanod assignment cannot be checked in, and duplicate active check-ins are constrained atomically', () => {
    expect(body('tanod_check_in')).toContain('a.id = p_assignment_id and a.tanod_id = v_id and a.active')
    expect(body('tanod_check_in')).toContain('for update of a')
    expect(body('tanod_check_in')).toContain('now() < v_start or now() >= v_end')
    expect(source).toContain('create unique index tanod_one_active_checkin on public.tanod_attendance(tanod_id) where checked_out_at is null')
    expect(source).toContain('assignment_id uuid not null unique references public.tanod_assignments(id)')
    expect(body('tanod_check_in')).toContain("'checked_in'")
  })
  test('another Tanod attendance cannot be checked out; timestamps and actor are server-owned', () => {
    expect(body('tanod_check_out')).toContain('set checked_out_at = now()')
    expect(body('tanod_check_out')).toContain('id = p_attendance_id and tanod_id = v_id and checked_out_at is null')
    expect(body('tanod_check_out')).toContain("v_id,auth.uid(),'checked_out'")
    expect(source).toContain('checked_in_at timestamptz not null default now()')
  })
  test('incident creation reuses atomic incident/blotter/history inserts and rejects spoofed identity', () => {
    const writer = body('record_incident')
    for (const table of ['incidents','blotter_entries','blotter_entry_history','incident_tanod']) expect(writer).toContain(`insert into public.${table}`)
    expect(writer).toContain('v_tanod := public.require_tanod_member_id()')
    expect(writer).toMatch(/p_tanod_id is not null and p_tanod_id is distinct from v_tanod then raise exception/)
    expect(writer).toMatch(/p_tanod_role is not null and p_tanod_role <> 'reported' then raise exception/)
    expect(writer).toContain("p_tanod_id := v_tanod; p_tanod_role := 'reported'; p_source := 'tanod_report'")
    expect(writer).toContain('v_uid uuid := auth.uid()')
    expect(writer).toContain('if not public.current_official_is_active() then')
  })
  test('reports intersect caller identity with own submitted or explicit response/attendance attribution', () => {
    const visible = body('tanod_incident_is_visible')
    expect(visible).toContain('public.current_tanod_member_id() is not null')
    expect(visible).toContain('i.recorded_by = auth.uid()')
    expect(visible).toContain("own_report.tanod_id = public.current_tanod_member_id() and own_report.role = 'reported'")
    expect(visible).toContain("it.tanod_id = public.current_tanod_member_id() and it.role in ('responded','attended')")
    const header = body('tanod_my_reports').split('language')[0]
    for (const field of ['narrative','latitude','longitude','profile_id','evidence','party_name']) expect(header).not.toContain(field)
    expect(header).toContain('kp_linked boolean')
    expect(header).not.toContain('kp_status')
  })
  test.each(['tanod_add_followup','tanod_my_followups'])('%s rejects unrelated incidents and inactive/unlinked/non-Tanod accounts', (name) => {
    expect(body(name)).toContain('public.require_tanod_member_id()')
    expect(body(name)).toMatch(/if not public.tanod_incident_is_visible\(p_incident_id\) then raise exception/)
  })
  test('follow-ups are append-only and cannot mutate incident, KP or clearance status', () => {
    expect(body('tanod_add_followup')).toContain('values(p_incident_id,v_id,auth.uid(),btrim(p_note))')
    expect(source).not.toMatch(/update public\.(incidents|kp_cases|document_requests)|delete from public\.(tanod_incident_notes|tanod_operation_events)/)
    expect(body('tanod_my_followups')).toContain('n.tanod_id = v_id and n.actor_id = auth.uid()')
  })
  test('public output contains only approved duty fields and an actual check-in is required for on-duty', () => {
    const reader = body('public_tanod_on_duty')
    expect(reader.split('language')[0]).toContain('returns table(display_name text,general_area text,shift_start timestamptz,shift_end timestamptz,duty_state text)')
    expect(reader).toContain('d.checked_in_at is not null and d.checked_out_at is null')
    expect(reader).toContain('w.shift_start <= now() and now() < w.shift_end')
    expect(reader).toContain("then 'currently_on_duty' else 'scheduled'")
    expect(reader).toContain('and t.active')
    expect(reader).not.toMatch(/narrative|latitude|longitude|contact_number|home_address|patrol_type|\.note/)
  })
  test('legal readers and evidence authorization are unchanged and document requests explicitly deny Tanods', () => {
    expect(source).not.toMatch(/(?:create|alter) policy[\s\S]*?on storage\.objects/)
    expect(source).not.toContain('function public.complaint_is_visible_to_caller')
    expect(source).not.toContain('function public.kp_case_is_visible_to_caller')
    expect(source).toContain('create policy tanod_no_document_requests on public.document_requests as restrictive for all to authenticated')
    expect(source).toContain("p.id = auth.uid() and p.role = 'tanod'")
    expect(sql(read('040_complaint_intake_foundation.sql'))).toContain("p.id = auth.uid() and p.role = 'resident'")
    const kp = sql(read('043_kp_case_hearings_summons.sql'))
    expect(kp).toContain("public.current_official_holds_position('barangay secretary')")
    expect(kp).toContain("public.current_official_holds_position('punong barangay')")
  })
})
