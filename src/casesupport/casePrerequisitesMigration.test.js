import fs from 'fs'
import path from 'path'

// Static installation contracts only: these tests never execute SQL or contact Supabase.
const read = (name) => fs.readFileSync(path.join(__dirname, '../../supabase-migrations', name), 'utf8')
  .replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '')
const evidence = read('050_case_evidence_support.sql')
const review = read('051_case_review_support.sql')
const guard = (sql) => sql.match(/do \$prerequisites\$([\s\S]*?)\$prerequisites\$;/)[1]

describe('050 installation prerequisites', () => {
  const preflight = guard(evidence)
  test('guards run inside the transaction before any application mutation', () => {
    expect(evidence).toMatch(/begin;\s*do \$prerequisites\$/)
    expect(evidence.indexOf('$prerequisites$;')).toBeLessThan(evidence.indexOf('alter table public.complaint_attachments'))
    expect(evidence.indexOf('$prerequisites$;')).toBeLessThan(evidence.indexOf('update storage.buckets'))
    expect(preflight).not.toMatch(/\b(?:insert into|update|delete from|create policy|alter policy)\b/i)
  })
  test('missing Storage tables and any bucket count other than exactly one raise exceptions', () => {
    expect(preflight).toMatch(/to_regclass\('storage.buckets'\) is null or v_objects is null then\s*raise exception '050 prerequisite missing/)
    expect(preflight).toMatch(/if \(select count\(\*\) from storage.buckets where id = 'complaint-evidence'\) <> 1 then\s*raise exception '050 prerequisite missing: exactly one/)
    expect(preflight).toContain("to_regclass('storage.objects')")
  })
  test('requires both 041 policies, including PostgreSQL-truncated identifiers', () => {
    expect(preflight).toContain("('Complaint evidence is readable by its filer, the Secretary and the Punong Barangay', 'r')")
    expect(preflight).toContain("('Complaint evidence is uploadable by its filer, the Secretary and the Punong Barangay', 'a')")
    expect(preflight).toContain('p.polname = v_policy.policy_name::name')
    expect(preflight).toContain('p.polcmd::text = v_policy.command')
    expect(preflight).toContain('p.polrelid = v_objects')
  })
  test('validates roles, RLS and actual bucket/predicate expressions; names alone cannot pass', () => {
    expect(preflight).toContain("rolname = 'authenticated'")
    expect(preflight).toContain('p.polroles = array[v_authenticated]')
    expect(preflight).toContain('and p.polpermissive')
    expect(preflight).toContain("p.polcmd = 'r' then p.polqual else p.polwithcheck")
    expect(preflight).toContain('and relrowsecurity')
    expect(preflight).toContain("to_regprocedure('public.complaint_evidence_is_visible(text)')")
    expect(preflight).toContain("d.refclassid = 'pg_catalog.pg_proc'::regclass")
    expect(preflight).toContain("v_expression is null or")
    expect(preflight).toMatch(/<> 'bucket_id=''complaint-evidence''ANDcomplaint_evidence_is_visiblename' then\s*raise exception '050 prerequisite missing or invalid/)
  })
  test('retains the private bucket limits and existing policies rather than recreating them', () => {
    expect(evidence).toContain('set public = false, file_size_limit = 26214400')
    expect(evidence).toContain("array['image/jpeg','image/png','image/webp','application/pdf','text/plain','video/mp4','video/webm']")
    expect(evidence).not.toMatch(/\b(?:create|alter|drop) policy\b/i)
  })
})

describe('051 dependency on the real 050 audit schema', () => {
  const preflight = guard(review)
  test('requires the audit table immediately, never creates a substitute', () => {
    expect(review).toMatch(/begin;\s*do \$prerequisites\$/)
    expect(preflight).toContain("to_regclass('public.case_support_events')")
    expect(preflight).toMatch(/if v_events is null then\s*raise exception '051 prerequisite missing: apply migration 050 first/)
    expect(review.indexOf('$prerequisites$;')).toBeLessThan(review.indexOf('create table public.kp_case_followups'))
    expect(review).not.toMatch(/create table (?:if not exists )?public.case_support_events/)
  })
  test('requires all six correctly typed NOT NULL columns and an RLS-enabled ordinary table', () => {
    expect(preflight).toContain("relkind = 'r' and relrowsecurity")
    expect(preflight).toMatch(/not attisdropped\) <> 6 then\s*raise exception/)
    for (const [column, type] of [['id','uuid'],['complaint_id','uuid'],['event_kind','text'],['detail','jsonb'],['actor_id','uuid'],['created_at','timestamp with time zone']]) {
      expect(preflight).toContain(`('${column}', '${type}')`)
    }
    expect(preflight).toContain('a.attnotnull and a.atttypid = pg_catalog.to_regtype(v_column.type_name)')
    expect(preflight).toMatch(/NOT NULL constraint\.'/)
  })
  test('requires the original primary key, validated foreign keys and defaults', () => {
    expect(preflight).toContain("c.contype = 'p' and c.conkey = array[a.attnum] and c.convalidated")
    expect(preflight).toContain("('complaint_id', 'public.complaints', 'r')")
    expect(preflight).toContain("('actor_id', 'public.profiles', 'a')")
    expect(preflight).toContain('c.conkey = array[a.attnum] and c.confkey = array[target.attnum]')
    expect(preflight).toContain('c.confdeltype::text = v_fk.delete_action')
    expect(preflight).toContain("('id', 'gen_random_uuid()')")
    expect(preflight).toContain("('detail', '''{}''::jsonb')")
    expect(preflight).toContain("('created_at', 'now()')")
    expect(preflight).toContain('= v_column.default_expression')
    expect(preflight).toMatch(/foreign key from migration 050 is required/)
    expect(preflight).toMatch(/default from migration 050 is required/)
  })
  test('rejects client table or column grants before installing new writers', () => {
    for (const role of ['anon','authenticated']) {
      expect(preflight).toContain(`has_table_privilege('${role}', v_events, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`)
      expect(preflight).toContain(`has_any_column_privilege('${role}', v_events, 'SELECT,INSERT,UPDATE,REFERENCES')`)
    }
    expect(preflight).toMatch(/then\s*raise exception '051 prerequisite invalid: case_support_events must retain migration 050 private client privileges/)
    expect(preflight).not.toMatch(/^\s*(?:insert|update|delete|create|alter|grant|revoke)\s/im)
  })
})
