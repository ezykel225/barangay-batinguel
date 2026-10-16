// P3-A. Source-reading guards over the complaint intake foundation.
//
// ⚠️ P3-A SHIPS NO FRONTEND, so there is no component behaviour to render.
// What these guard is the SECURITY SHAPE of migrations 040 and 041 — the
// same pattern the project already uses where only SQL can prove the
// property: officialAvailability.test.js reads migration 026 to check the
// four statuses the form offers are the four the CHECK accepts,
// reservationWindow.test.js mirrors migration 020's own cases, and
// officialDirectoryForm.test.js cross-checks migration 033's header.
//
// ⚠️ THEY DO NOT PROVE THE AUTHORIZATION. Only SQL can prove a policy or a
// SECURITY DEFINER function, and the role-impersonation matrix lives in the
// migration headers and the PR body. What these pin is the half Jest can
// see: that the vocabulary, the returned column lists, the grants and the
// absences stay as written, so a later edit has to change a test to change
// a security property.

const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', '..', 'supabase-migrations')
const RAW_040 = fs.readFileSync(path.join(DIR, '040_complaint_intake_foundation.sql'), 'utf8')
const RAW_041 = fs.readFileSync(path.join(DIR, '041_complaint_evidence_storage.sql'), 'utf8')

// ⚠️ COMMENTS STRIPPED BEFORE ANY "IS NOT USED" SCAN. Both files discuss
// `committee` and `full_name` at length precisely to record that neither is
// read for authorization — so a scan over the raw text would fail on the
// prose that documents the rule it is checking. A5 hit this exact trap: an
// assertion that the dashboard contains no `.eq('full_name', …)` failed on
// the comment quoting the expression it documented removing.
const code = (raw) => raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

const CODE_040 = code(RAW_040)
const CODE_041 = code(RAW_041)
const CODE_BOTH = `${CODE_040}\n${CODE_041}`

// Collapses hard-wrapped SQL comment prose into one string, so an assertion
// is about the sentence rather than about where a line happens to break.
const prose = (raw) => raw
  .split('\n')
  .filter((line) => line.trim().startsWith('--'))
  .map((line) => line.replace(/^\s*--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ')

const PROSE_BOTH = `${prose(RAW_040)} ${prose(RAW_041)}`

describe('the complaint reference', () => {
  it('uses the CMP- prefix, which does not collide with the court reservation BCR-', () => {
    expect(CODE_040).toMatch(/RETURN 'CMP-' \|\| p_year::text \|\| '-' \|\| v_body/)
    expect(CODE_040).not.toMatch(/'BCR-'/)
  })

  it('draws six characters from the Crockford alphabet with I, L, O and U removed', () => {
    const alphabet = /k_alphabet CONSTANT text := '([0-9A-Z]+)'/.exec(CODE_040)
    expect(alphabet).not.toBeNull()
    expect(alphabet[1]).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ')
    expect(alphabet[1]).toHaveLength(32)
    // The four look-alikes a reader confuses, each asserted absent rather
    // than the set asserted as a whole: a single missing character would
    // otherwise pass a length check.
    ;['I', 'L', 'O', 'U'].forEach((c) => expect(alphabet[1]).not.toContain(c))
    expect(CODE_040).toMatch(/FOR i IN 0\.\.5 LOOP/)
  })

  it('is random, with NO sequence, counter or max()+1 anywhere', () => {
    expect(CODE_040).toMatch(/extensions\.gen_random_bytes\(6\)/)
    // ⚠️ The direction that fails open: a sequential reference tells anybody
    // holding one that the neighbouring records exist.
    expect(CODE_040).not.toMatch(/nextval|CREATE SEQUENCE|serial|bigserial/i)
    expect(CODE_040).not.toMatch(/max\s*\(\s*reference/i)
    expect(CODE_040).not.toMatch(/count\s*\(\s*\*\s*\)\s*\+\s*1/i)
    expect(CODE_040).not.toMatch(/lpad\s*\(/i)
  })

  it('retries on collision and raises rather than storing a duplicate', () => {
    expect(CODE_040).toMatch(/EXIT WHEN NOT EXISTS/)
    expect(CODE_040).toMatch(/IF v_attempt >= 10 THEN/)
    expect(CODE_040).toMatch(/constraint complaints_reference_unique unique \(reference\)/)
  })

  it('is stamped by a BEFORE INSERT trigger, so a client value is discarded', () => {
    expect(CODE_040).toMatch(/before insert on public\.complaints/)
    expect(CODE_040).toMatch(/NEW\.reference := v_candidate/)
  })
})

describe('the closed vocabularies', () => {
  it('offers exactly the professor’s eight categories', () => {
    const m = /constraint complaints_category_check[\s\S]*?\]\)\)/.exec(CODE_040)
    expect(m).not.toBeNull()
    const found = (m[0].match(/'([a-z_]+)'/g) || []).map((s) => s.replace(/'/g, ''))
    expect(found).toEqual([
      'noise', 'unpaid_debt', 'boundary_dispute', 'physical_altercation',
      'theft', 'threats', 'family_dispute', 'other',
    ])
  })

  it('offers exactly two intake channels', () => {
    expect(CODE_040).toMatch(/intake_channel = any \(array\['online','walk_in'\]\)/)
  })

  it('carries ONE intake status, so nothing claims a workflow P3-A has not built', () => {
    expect(CODE_040).toMatch(/status = any \(array\['received'\]\)/)
    // ⚠️ Screening, referral and KP stages are P4. A vocabulary written
    // ahead of its consumers is the displayLabels mistake.
    ;['screening', 'referred', 'kp_case', 'mediation', 'settled', 'dismissed']
      .forEach((v) => expect(CODE_040).not.toContain(`'${v}'`))
  })

  it('records the initial transition as NULL -> received', () => {
    expect(CODE_040).toMatch(/from_status\s+text,/)
    expect(CODE_040).toMatch(/VALUES \(\s*v_complaint_id, NULL, 'received', v_uid/)
  })
})

describe('identity cannot be forged', () => {
  it('takes no identity, status, reference or timestamp parameter on either creation RPC', () => {
    const resident = /create or replace function public\.file_complaint_as_resident\(([\s\S]*?)\)\s*returns/.exec(CODE_040)
    const walkIn = /create or replace function public\.encode_walk_in_complaint\(([\s\S]*?)\)\s*returns/.exec(CODE_040)
    expect(resident).not.toBeNull()
    expect(walkIn).not.toBeNull()
    ;[resident[1], walkIn[1]].forEach((args) => {
      ;['filed_by', 'encoded_by', 'status', 'reference', 'created_at', 'actor']
        .forEach((forbidden) => expect(args).not.toContain(forbidden))
    })
  })

  it('takes the resident’s identity from auth.uid() and refuses a non-resident', () => {
    expect(CODE_040).toMatch(/v_uid uuid := auth\.uid\(\)/)
    expect(CODE_040).toMatch(/IF v_profile\.role <> 'resident' THEN/)
    expect(CODE_040).toMatch(/Only a resident account can file an online complaint/)
  })

  it('snapshots the complainant from the account, not from caller input', () => {
    expect(CODE_040).toMatch(/'complainant', v_uid,\s*\n?\s*COALESCE\(NULLIF\(btrim\(COALESCE\(v_profile\.full_name/)
  })
})

describe('walk-in encoding is Secretary-only, in the database', () => {
  it('gates on current_official_holds_position(‘Barangay Secretary’)', () => {
    expect(CODE_040).toMatch(
      /IF NOT public\.current_official_holds_position\('Barangay Secretary'\) THEN/
    )
    expect(CODE_040).toMatch(/Only the Barangay Secretary can encode a walk-in complaint/)
  })

  it('stamps encoded_by from auth.uid() and sets the channel itself', () => {
    expect(CODE_040).toMatch(/'walk_in', p_category/)
    expect(CODE_040).toMatch(/\)\), ''\), NULL, v_uid\s*\n\s*\)/)
  })
})

describe('the safe official queue', () => {
  // The returned column list IS the privacy boundary, so it is asserted as
  // a whole rather than field by field.
  const queue = /create or replace function public\.complaint_queue\(\)\s*returns table \(([\s\S]*?)\)\s*language/.exec(CODE_040)

  it('returns exactly six metadata columns', () => {
    expect(queue).not.toBeNull()
    const cols = queue[1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean)
    expect(cols).toEqual(['id', 'reference', 'intake_channel', 'status', 'created_at', 'updated_at'])
  })

  it('returns NO narrative, NO contact, NO party and NO evidence', () => {
    ;['narrative', 'contact', 'full_name', 'object_path', 'location_note',
      'respondent', 'complainant', 'witness', 'note']
      .forEach((leak) => expect(queue[1]).not.toContain(leak))
  })

  it('omits CATEGORY, which is the accusation itself', () => {
    // ⚠️ Deliberate and documented: `family_dispute` or `threats` beside a
    // date, visible to all eleven officials, is an accusation about an
    // identifiable household. Category is on the full-detail path only.
    expect(queue[1]).not.toContain('category')
    expect(PROSE_BOTH).toMatch(/CATEGORY IS DELIBERATELY OMITTED/)
  })

  it('is open to any ACTIVE official and to nobody else', () => {
    const body = /create or replace function public\.complaint_queue\(\)[\s\S]*?\$\$;/.exec(CODE_040)[0]
    expect(body).toMatch(/public\.is_official\(auth\.uid\(\)\)/)
    expect(body).toMatch(/public\.official_is_active\(public\.official_id_for_current_user\(\)\)/)
  })
})

describe('the tracking RPC', () => {
  const track = /create or replace function public\.track_complaint\(([\s\S]*?)\)\s*returns table \(([\s\S]*?)\)\s*language/.exec(CODE_040)
  const body = /create or replace function public\.track_complaint\([\s\S]*?\$\$;/.exec(CODE_040)[0]

  it('returns exactly four columns', () => {
    expect(track).not.toBeNull()
    const cols = track[2].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean)
    expect(cols).toEqual(['reference', 'status', 'received_on', 'last_updated'])
  })

  it('returns none of the sensitive fields, and no masked name either', () => {
    // ⚠️ Narrower than track_court_reservation, which returns a masked
    // requester and a masked contact. A masked name in a barangay of
    // neighbours is still a strong hint.
    ;['narrative', 'category', 'respondent', 'witness', 'evidence',
      'object_path', 'contact', 'requester', 'masked', 'note', 'screening']
      .forEach((leak) => expect(track[2]).not.toContain(leak))
  })

  it('requires BOTH the reference and the contact, ANDed with no branch', () => {
    expect(body).toMatch(/normalize_reservation_reference\(c\.reference\)\s*\n?\s*= public\.normalize_reservation_reference\(p_reference\)/)
    expect(body).toMatch(/AND regexp_replace\(COALESCE\(cp\.contact_number_snapshot/)
    // ⚠️ No CASE, no IF and no second query: a branch is what could report
    // which half of the pair was wrong.
    expect(body).not.toMatch(/\bCASE\b/i)
    expect(body).not.toMatch(/\bIF\b/)
    expect(body).toMatch(/LIMIT 1/)
  })

  it('cannot say which half was wrong, and says nothing about not-found', () => {
    ;['not found', 'no such', 'invalid reference', 'incorrect contact', 'does not exist']
      .forEach((oracle) => expect(body.toLowerCase()).not.toContain(oracle))
    expect(body).not.toMatch(/RAISE/)
  })

  it('refuses empty input rather than matching a complaint with no contact on file', () => {
    expect(body).toMatch(/COALESCE\(btrim\(p_reference\), ''\) <> ''/)
    expect(body).toMatch(/regexp_replace\(COALESCE\(p_contact, ''\), '\[\^0-9\]', '', 'g'\) <> ''/)
  })
})

describe('status history is append-only at both layers', () => {
  it('has no INSERT, UPDATE or DELETE policy', () => {
    expect(CODE_040).not.toMatch(/on public\.complaint_status_history\s*\n?\s*for (insert|update|delete)/i)
    const policies = CODE_040.match(/create policy/g) || []
    // Exactly one policy in 040, and it is the complaints SELECT policy.
    expect(policies).toHaveLength(1)
    expect(CODE_040).toMatch(/on public\.complaints\s*\n\s*for select/)
  })

  it('revokes every client privilege on it, so a rewrite is 42501 not a silent filter', () => {
    expect(CODE_040).toMatch(
      /revoke all on table public\.complaint_status_history\s*from anon, authenticated;/
    )
  })

  it('grants SELECT only on complaints, and only to authenticated', () => {
    const grants = CODE_040.match(/grant [a-z]+ on table [^;]+;/g) || []
    expect(grants).toEqual(['grant select on table public.complaints to authenticated;'])
  })
})

describe('every new SECURITY DEFINER function is locked down', () => {
  const NEW_FNS = [
    'generate_complaint_reference(int)',
    'stamp_complaint_reference()',
    'complaint_is_visible_to_caller(uuid)',
    'file_complaint_as_resident(text,text,text,jsonb)',
    'encode_walk_in_complaint(text,text,text,text,text,jsonb)',
    'complaint_queue()',
    'complaint_parties_for(uuid)',
    'complaint_attachments_for(uuid)',
    'complaint_history_for(uuid)',
    'track_complaint(text,text)',
    'complaint_evidence_is_visible(text)',
    'record_complaint_attachment(uuid,text,text,text,bigint)',
  ]

  it.each(NEW_FNS)('revokes PUBLIC EXECUTE on %s', (sig) => {
    // ⚠️ The load-bearing half. A new function is executable by every role
    // in the cluster until PUBLIC is revoked — which is exactly what
    // MASTER-B B5 (migration 038) spent a phase removing from nine existing
    // functions. Repeating it here would undo that.
    const escaped = sig.replace(/[().,]/g, (c) => `\\${c}`)
    expect(CODE_BOTH).toMatch(new RegExp(`revoke all on function public\\.${escaped} from public`))
  })

  it('sets an explicit empty search_path on all twelve', () => {
    const defs = CODE_BOTH.match(/security definer\s*\n?\s*set search_path = ''/g) || []
    expect(defs).toHaveLength(NEW_FNS.length)
  })

  it('gives anon EXECUTE on the public tracking RPC and on nothing else', () => {
    const anonGrants = (CODE_BOTH.match(/grant execute on function public\.[^;]*to anon[^;]*;/g) || [])
    expect(anonGrants).toHaveLength(1)
    expect(anonGrants[0]).toContain('track_complaint')
  })

  it('gives the two internal functions no client grant at all', () => {
    expect(CODE_040).toMatch(/grant execute on function public\.generate_complaint_reference\(int\) to service_role;/)
    expect(CODE_040).toMatch(/grant execute on function public\.stamp_complaint_reference\(\) to service_role;/)
    expect(CODE_040).not.toMatch(/generate_complaint_reference\(int\) to authenticated/)
    expect(CODE_040).not.toMatch(/stamp_complaint_reference\(\) to authenticated/)
  })

  it('revokes anon as well as PUBLIC on the predicate whose policy is TO authenticated', () => {
    // ⚠️ The default ACL names anon, so revoking PUBLIC alone leaves a
    // surplus named grant — the one B5 reported and migration 039 removed.
    expect(CODE_040).toMatch(
      /revoke all on function public\.complaint_is_visible_to_caller\(uuid\) from public, anon;/
    )
  })
})

describe('authorization reads neither committee nor full_name', () => {
  it('never reads barangay_officials.committee', () => {
    // ⚠️ COMMITTEE IS DESCRIPTIVE DATA, NOT AUTHORIZATION DATA. P2.5
    // measured that it is free text, is sent by the Edit Official form for
    // any row, is permitted by the directory UPDATE policy for ANY
    // official, and is NOT guarded by protect_official_record(). A real
    // "Peace and Order and Appropriation" value exists; authorizing on it
    // would reproduce migration 028's escalation on an unprotected column.
    expect(CODE_BOTH).not.toMatch(/committee/i)
    // And the rule is written down where the next reader will find it.
    expect(PROSE_BOTH).toMatch(/COMMITTEE IS DESCRIPTIVE DATA, NOT AUTHORIZATION DATA/)
  })

  it('never compares a full_name as an identity key', () => {
    expect(CODE_BOTH).not.toMatch(/\.full_name\s*=/)
    expect(CODE_BOTH).not.toMatch(/full_name\s*=\s*\w*\.?full_name/)
    expect(CODE_BOTH).not.toMatch(/eq\('full_name'/)
  })

  it('resolves every official decision through the position helper', () => {
    const calls = CODE_BOTH.match(/current_official_holds_position\('[^']+'\)/g) || []
    expect(calls.length).toBeGreaterThan(0)
    const positions = [...new Set(calls)]
    expect(positions.sort()).toEqual([
      "current_official_holds_position('Barangay Secretary')",
      "current_official_holds_position('Punong Barangay')",
    ])
    // ⚠️ The Treasurer is an ORDINARY official on complaints. No proven
    // existing requirement gives her anything here.
    expect(CODE_BOTH).not.toMatch(/current_official_holds_position\('Barangay Treasurer'\)/)
  })

  it('keeps ONE visibility predicate rather than four copies of the rule', () => {
    const defs = CODE_BOTH.match(/create or replace function public\.complaint_is_visible_to_caller/g) || []
    expect(defs).toHaveLength(1)
    // Used by the policy, the three detail reads, the attachment recorder
    // and the storage predicate.
    const uses = CODE_BOTH.match(/complaint_is_visible_to_caller\(/g) || []
    expect(uses.length).toBeGreaterThanOrEqual(7)
  })
})

describe('no purok work happened', () => {
  it('creates no puroks table, no purok column and no purok FK', () => {
    expect(CODE_BOTH).not.toMatch(/create table[^;]*puroks/i)
    expect(CODE_BOTH).not.toMatch(/purok_id/i)
    expect(CODE_BOTH).not.toMatch(/references[^;]*puroks/i)
    // ⚠️ The location column is deliberately NOT called `purok`, so nobody
    // later mistakes it for a canonical reference. P2 established that no
    // entry in the current purok constant has a documentary source.
    expect(CODE_040).toMatch(/location_note\s+text,/)
  })

  it('normalises no stored purok value', () => {
    expect(CODE_BOTH).not.toMatch(/update\s+public\.(profiles|reservations|document_requests|residents_registry|waste_schedule)/i)
  })

  it('leaves the PUROKS constant untouched at seven values', () => {
    const constants = fs.readFileSync(
      path.join(__dirname, '..', 'constants', 'barangay.js'), 'utf8'
    )
    const list = /export const PUROKS = \[([\s\S]*?)\]/.exec(constants)
    expect(list).not.toBeNull()
    expect((list[1].match(/'Purok \d'/g) || [])).toHaveLength(7)
    // ⚠️ Purok 7 is NOT removed. P2 found its only evidence post-dates the
    // commit that added it to the dropdown, which makes it unconfirmed —
    // not invalid.
    expect(list[1]).toContain("'Purok 7'")
  })
})

describe('the evidence storage surface', () => {
  it('creates a PRIVATE bucket', () => {
    expect(CODE_041).toMatch(/insert into storage\.buckets[\s\S]*?'complaint-evidence',\s*\n?\s*false,/)
    // ⚠️ getPublicUrl() 404s on a private bucket even with a permissive
    // policy; access is createSignedUrl() only.
    expect(CODE_041).not.toMatch(/true,\s*\n?\s*5242880/)
  })

  it('allows four explicit MIME types and never a wildcard', () => {
    expect(CODE_041).toMatch(
      /array\['image\/jpeg','image\/png','image\/webp','application\/pdf'\]/
    )
    expect(CODE_041).not.toMatch(/\*\/\*/)
    expect(CODE_041).not.toMatch(/allowed_mime_types\s*=\s*null/i)
  })

  it('caps the bucket at the project’s established 5 MB', () => {
    expect(CODE_041).toMatch(/5242880/)
    expect(CODE_040).toMatch(/byte_size > 0 and byte_size <= 5242880/)
  })

  it('supports no video, and records that as an explicit deferral', () => {
    expect(CODE_041).not.toMatch(/video\//)
    expect(CODE_040).toMatch(/media_kind = any \(array\['photo','document'\]\)/)
    expect(PROSE_BOTH).toMatch(/VIDEO IS DEFERRED TO P3-B\/P3-C/)
  })

  it('has SELECT and INSERT policies and deliberately no UPDATE or DELETE', () => {
    const policies = CODE_041.match(/for (select|insert|update|delete)/g) || []
    expect(policies.sort()).toEqual(['for insert', 'for select'])
    // ⚠️ Evidence is not a profile photo. With no DELETE policy
    // storage.remove() matches zero rows — known from migration 009, and
    // right here because no flow promises deletion.
  })

  it('shares ONE rule with full-detail access rather than restating it', () => {
    expect(CODE_041).toMatch(/RETURN public\.complaint_is_visible_to_caller\(v_folder::uuid\)/)
  })

  it('shape-checks the path instead of casting, so a malformed path is false not an error', () => {
    expect(CODE_041).toMatch(/\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}/)
    expect(CODE_041).toMatch(/THEN RETURN false; END IF;|RETURN false;/)
  })

  it('derives media_kind server-side and refuses an unlisted type', () => {
    expect(CODE_041).toMatch(/WHEN p_mime_type LIKE 'image\/%'\s*\n?\s*THEN 'photo'/)
    expect(CODE_041).toMatch(/IF v_kind IS NULL THEN/)
    expect(CODE_041).toMatch(/not accepted as complaint evidence/)
  })

  it('refuses an object path outside its own complaint folder', () => {
    expect(CODE_041).toMatch(/split_part\(COALESCE\(p_object_path, ''\), '\/', 1\) <> p_complaint_id::text/)
  })
})

describe('activity_log and notifications are untouched', () => {
  it('widens no activity_log CHECK and edits no stamp_activity_actor', () => {
    // ⚠️ Asserted about STATEMENTS, not about the word. `activity_log`
    // survives comment-stripping inside a `comment on table` string
    // literal -- the prose recording the deferral -- so a scan for the
    // word fails on the very sentence that documents the absence. Third
    // time this project has hit that: A5 had a grep match its own
    // explanatory comment, and A6 had one match the Add branch it was not
    // hunting. The property is that no DDL touches it.
    expect(CODE_BOTH).not.toMatch(/alter table[^;]*activity_log/i)
    expect(CODE_BOTH).not.toMatch(/drop constraint[^;]*activity_log/i)
    expect(CODE_BOTH).not.toMatch(/activity_log_(action|entity_type)_check/i)
    expect(CODE_BOTH).not.toMatch(/insert into[^;]*activity_log/i)
    expect(CODE_BOTH).not.toMatch(/create or replace function public\.stamp_activity_actor/i)
    expect(CODE_BOTH).not.toMatch(/logActivity/)
  })

  it('creates no notification, no SMS and no email path', () => {
    expect(CODE_BOTH).not.toMatch(/notifications/i)
    expect(CODE_BOTH).not.toMatch(/\bsms\b/i)
  })

  it('records why activity_log was deferred rather than leaving it unexplained', () => {
    expect(PROSE_BOTH).toMatch(/A DECISION, NOT AN OVERSIGHT/)
  })
})

describe('nothing from a later phase leaked in', () => {
  it.each([
    'kp_cases', 'complaint_screenings', 'kp_hearings', 'kp_summons',
    'kp_settlements', 'kp_outcomes', 'incidents', 'blotter_entries',
    'tanod_members', 'tanod_account_links', 'complaint_categories',
    'patrol_zones', 'safety_advisories',
  ])('creates no %s table', (table) => {
    expect(CODE_BOTH).not.toMatch(new RegExp(`create table[^;]*\\b${table}\\b`, 'i'))
  })

  it('creates exactly the four P3-A tables', () => {
    const tables = (CODE_BOTH.match(/create table if not exists public\.(\w+)/g) || [])
      .map((s) => s.replace(/.*public\./, ''))
    expect(tables.sort()).toEqual([
      'complaint_attachments', 'complaint_parties',
      'complaint_status_history', 'complaints',
    ])
  })

  it('adds no map, no analytics and no capability table', () => {
    expect(CODE_BOTH).not.toMatch(/postgis|geometry|geography\(|leaflet/i)
    expect(CODE_BOTH).not.toMatch(/capabilit/i)
  })
})
