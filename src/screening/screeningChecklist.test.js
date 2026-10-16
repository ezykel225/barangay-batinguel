// P4-A. The PROVISIONAL KP review checklist as a pure module, and the
// cross-check that its keys are the keys the database will store.
//
// ─── ⚠️ WHAT THESE TESTS CANNOT PROVE ────────────────────────────────
//
// Who may prepare and who may confirm are a database position gate and a
// private table, and only SQL can prove those -- the role-impersonation
// matrix lives in this phase's report. What is pinned here is the half
// Jest can see: that the checklist asks rather than concludes, that
// nothing in this module turns answers into a decision, and that the two
// vocabularies match the ones migration 042 accepts.
//
// ⚠️ No Supabase mock is needed. This module has no Supabase import,
// which is the reason the rules live here rather than inside the panel.

import fs from 'fs'
import path from 'path'
import {
  ANSWER_OPTIONS,
  ANSWER_VALUES,
  CHECKLIST_DISCLAIMER,
  CHECKLIST_KEYS,
  CHECKLIST_PROVISIONAL_NOTE,
  CHECKLIST_V1,
  CHECKLIST_VERSION,
  CHECKLIST_VERSIONS,
  RECOMMENDATION_OPTIONS,
  SCREENING_ERRORS,
  SCREENING_OUTCOMES,
  SCREENING_OUTCOME_VALUES,
  answerLabel,
  checklistFor,
  needsFurtherReview,
  screeningOutcomeLabel,
} from './screeningChecklist'

const MIGRATION = path.join(
  __dirname, '..', '..', 'supabase-migrations', '042_kp_screening_foundation.sql',
)
const sql = () => fs.readFileSync(MIGRATION, 'utf8')
// ⚠️ Comment-stripped, because this migration discusses every forbidden
// word at length precisely to record that none of them is encoded. A
// scan that trusts its own hit count reports a rule where there is a
// paragraph explaining its absence -- the trap that produced two false
// findings in MASTER-A.
const code = () => sql().split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')

// ── A. The questions ask; they do not conclude ───────────────────────

describe('A. the checklist asks rather than finds', () => {
  it('has six items, each with a key, a question and an attention answer', () => {
    expect(CHECKLIST_V1).toHaveLength(6)
    CHECKLIST_V1.forEach((item) => {
      expect(typeof item.key).toBe('string')
      expect(item.key).toMatch(/^[a-z][a-z0-9_]*$/)
      expect(item.question.length).toBeGreaterThan(20)
      expect(ANSWER_VALUES).toContain(item.attentionWhen)
    })
  })

  // ⚠️ THE LOAD-BEARING ONE. The brief's §8 is that the wording must ask
  // -- "Does this complaint indicate..." -- and must never state
  // "This case is outside KP jurisdiction". So every question is a
  // question, and no question asserts.
  it('phrases every item as a question, never as a finding', () => {
    CHECKLIST_V1.forEach((item) => {
      expect(item.question.trim().endsWith('?')).toBe(true)
      expect(item.question).toMatch(/^(Does|Do|Is|Are|Was|Were|Has|Have)\b/)
    })
  })

  it('states no legal conclusion in any question', () => {
    const words = CHECKLIST_V1.map((i) => i.question).join(' ').toLowerCase()
    ;['is outside', 'is within', 'not eligible', 'ineligible', 'eligible',
      'must be', 'shall be', 'is required', 'is barred', 'is prohibited',
      'jurisdiction', 'katarungang', 'lupon', 'pangkat',
      'certificate to file', 'repudiat']
      .forEach((term) => expect(words).not.toContain(term))
  })

  // ⚠️ §9: P4-A may not hardcode penalty thresholds, statutory day
  // limits, repudiation periods or CFA requirements. A number in a
  // question would be exactly that -- and "serious offense" with no
  // threshold attached is the whole reason the wording is vague.
  it('names no penalty threshold, day limit or statutory period', () => {
    const words = CHECKLIST_V1.map((i) => `${i.question}`).join(' ').toLowerCase()
    expect(words).not.toMatch(/\b\d+\b/)
    ;['imprisonment', 'fine of', 'peso', 'php', '₱', 'days', 'months',
      'years', 'penalty', 'article', 'section', 'republic act', 'r.a.']
      .forEach((term) => expect(words).not.toContain(term))
  })

  it('carries a disclaimer that denies deciding anything, in one place', () => {
    expect(CHECKLIST_DISCLAIMER).toMatch(/does not automatically/i)
    expect(CHECKLIST_DISCLAIMER).toMatch(/determine legal jurisdiction/i)
    expect(CHECKLIST_DISCLAIMER).toMatch(/not a complete list/i)
    expect(CHECKLIST_PROVISIONAL_NOTE).toMatch(/provisional/i)
    expect(CHECKLIST_PROVISIONAL_NOTE).toMatch(/barangay confirmation/i)
  })

  it('marks the two sensitive items and no others', () => {
    const sensitive = CHECKLIST_V1.filter((i) => i.sensitive).map((i) => i.key)
    expect(sensitive).toEqual([
      'possible_vawc_or_sensitive_family_matter', 'minor_involved',
    ])
  })
})

// ── B. Nothing here derives a decision ───────────────────────────────

describe('B. the module decides nothing', () => {
  // ⚠️ THE CORE RULE OF THE PHASE, asserted as an absence: there is no
  // exported function that maps the answer set to a recommendation or an
  // outcome. A human picks both and sends them as parameters.
  it('exports no function that turns answers into a recommendation or outcome', () => {
    const api = require('./screeningChecklist')
    const names = Object.keys(api)
    ;['recommendFor', 'recommendationFor', 'deriveRecommendation',
      'deriveOutcome', 'outcomeFor', 'decide', 'decideOutcome',
      'evaluateChecklist', 'evaluate', 'assess', 'assessJurisdiction',
      'isKpEligible', 'kpEligible', 'eligibility', 'scoreChecklist',
      'score', 'classify', 'conclude']
      .forEach((n) => expect(names).not.toContain(n))
  })

  // ⚠️ `needsFurtherReview` is the one thing that looks like such a
  // function. Run both directions: it answers about ONE row and takes no
  // answer SET at all, so it cannot be a recommender however it is
  // called.
  it('marks one answer for attention and totals nothing', () => {
    const item = CHECKLIST_V1[0]
    expect(needsFurtherReview(item, 'yes')).toBe(true)
    expect(needsFurtherReview(item, 'no')).toBe(false)
    // One item, one answer -- its arity is the proof it is not a scorer.
    expect(needsFurtherReview.length).toBe(2)
  })

  // ⚠️ `unknown` IS NOT MARKED, and that is deliberate rather than an
  // omission. "We have not checked this" is an ordinary state of a
  // draft; flagging it would turn display emphasis into a completeness
  // score, which is a judgment about the screening.
  it('does not mark an unknown answer', () => {
    CHECKLIST_V1.forEach((item) => {
      expect(needsFurtherReview(item, 'unknown')).toBe(false)
    })
  })

  it('returns false rather than throwing for a missing item or answer', () => {
    expect(needsFurtherReview(null, 'yes')).toBe(false)
    expect(needsFurtherReview(undefined, 'yes')).toBe(false)
    expect(needsFurtherReview(CHECKLIST_V1[0], undefined)).toBe(false)
    expect(needsFurtherReview(CHECKLIST_V1[0], 'constructor')).toBe(false)
  })
})

// ── C. The three answers, and the third is the point ─────────────────

describe('C. the answer vocabulary', () => {
  it('offers exactly yes, no and unknown', () => {
    expect(ANSWER_VALUES).toEqual(['yes', 'no', 'unknown'])
    expect(ANSWER_OPTIONS.map((o) => o.label))
      .toEqual(['Yes', 'No', 'Unknown / needs verification'])
  })

  // ⚠️ THE THIRD OPTION IS WHY THIS IS NOT A BINARY. A reviewer forced to
  // choose would answer `no` to a question nobody checked, and `no` and
  // "not looked into" are different facts on a record the Punong
  // Barangay reads before confirming. The label says so in words, not
  // only by being third.
  it('says in words that unknown means not yet verified', () => {
    expect(answerLabel('unknown')).toMatch(/needs verification/i)
    expect(answerLabel('unknown')).not.toBe('Unknown')
  })

  it('returns an unrecognised answer exactly as stored', () => {
    expect(answerLabel('maybe')).toBe('maybe')
    expect(answerLabel('')).toBe('')
    expect(answerLabel(null)).toBe('')
    expect(answerLabel(undefined)).toBe('')
  })

  // The `officialPhotos` trap: a bare lookup resolves `constructor` to a
  // function and renders source code.
  it('does not resolve an inherited property name to a function', () => {
    expect(typeof answerLabel('constructor')).toBe('string')
    expect(answerLabel('constructor')).toBe('constructor')
    expect(typeof answerLabel('toString')).toBe('string')
  })
})

// ── D. The outcome vocabulary ────────────────────────────────────────

describe('D. the outcome vocabulary', () => {
  it('offers exactly the four the database accepts', () => {
    expect(SCREENING_OUTCOME_VALUES).toEqual([
      'proceed_to_kp_process', 'refer_for_further_action',
      'close_without_kp_process', 'needs_more_information',
    ])
  })

  // ⚠️ §13: `settled`, `conciliation` and `certificate_to_file_action`
  // are NOT created in this phase, and nor is any legal conclusion.
  // Asserted as an absence on both the values and the words on screen.
  it('names no P4-B stage and no legal conclusion', () => {
    const everything = SCREENING_OUTCOMES
      .map((o) => `${o.value} ${o.label} ${o.help}`).join(' ').toLowerCase()
    ;['settled', 'settlement', 'conciliation', 'mediation', 'pangkat',
      'certificate to file', 'certificate_to_file', 'cfa', 'summons',
      'hearing', 'eligible', 'ineligible', 'not eligible', 'dismissed',
      'jurisdiction', 'lupon', 'void', 'unlawful', 'guilty']
      .forEach((term) => expect(everything).not.toContain(term))
  })

  // ⚠️ EVERY LABEL SAYS WHAT THE BARANGAY WILL DO, not what is true. A
  // reader must not come away thinking the software ruled on anything,
  // which is the test each of these four words had to pass.
  it('phrases every outcome as an action the barangay takes', () => {
    SCREENING_OUTCOMES.forEach((o) => {
      expect(o.help).toMatch(/\bThe barangay will\b|\bNot decided\b/)
    })
  })

  it('reads an unrecognised outcome back exactly as stored', () => {
    expect(screeningOutcomeLabel('kp_eligible')).toBe('kp_eligible')
    expect(screeningOutcomeLabel(null)).toBe('')
    expect(screeningOutcomeLabel('constructor')).toBe('constructor')
  })

  // ⚠️ ONE VOCABULARY FOR TWO COLUMNS, so a reader never learns two sets
  // of words for one question and a recommendation can be compared with
  // the outcome that followed it. The database constrains both columns to
  // the same four, and this is the client half of that.
  it('uses the same four words for the recommendation', () => {
    expect(RECOMMENDATION_OPTIONS).toBe(SCREENING_OUTCOMES)
  })
})

// ── E. The version travels with the row ──────────────────────────────

describe('E. the checklist version', () => {
  it('is v1, and is the only version defined', () => {
    expect(CHECKLIST_VERSION).toBe('v1')
    expect(Object.keys(CHECKLIST_VERSIONS)).toEqual(['v1'])
  })

  it('resolves a known version and refuses an unknown one', () => {
    expect(checklistFor('v1')).toBe(CHECKLIST_V1)
    expect(checklistFor('v2')).toBeNull()
    expect(checklistFor('')).toBeNull()
    expect(checklistFor(undefined)).toBeNull()
  })

  it('does not resolve an inherited property name to a checklist', () => {
    expect(checklistFor('constructor')).toBeNull()
    expect(checklistFor('toString')).toBeNull()
  })
})

// ── F. SQL and JS agree on the keys ──────────────────────────────────
//
// ⚠️ THE CROSS-CHECK, and it is the same one `reservationWindow.test.js`
// makes against migration 020's SQL cases and `officialAvailability.test.js`
// against migration 026's CHECK: SQL owns which keys may be STORED, this
// module owns how they READ, and editing one without the other has to
// fail in Jest rather than at the counter.

describe('F. the keys SQL will store are the keys this module asks', () => {
  const sqlKeys = () => {
    const fn = code().match(
      /create or replace function public\.complaint_screening_checklist_keys[\s\S]*?\$function\$;/,
    )
    expect(fn).not.toBeNull()
    const arr = fn[0].match(/WHEN 'v1' THEN ARRAY\[([\s\S]*?)\]/)
    expect(arr).not.toBeNull()
    return (arr[1].match(/'([a-z0-9_]+)'/g) || []).map((s) => s.slice(1, -1))
  }

  it('matches migration 042 exactly, in order', () => {
    expect(sqlKeys()).toEqual(CHECKLIST_KEYS)
  })

  it('matches as a set too, so a reorder cannot hide a rename', () => {
    expect([...sqlKeys()].sort()).toEqual([...CHECKLIST_KEYS].sort())
  })

  // ⚠️ Both directions. The equality above would also pass if I had
  // written the test against the same typo twice, so each list is
  // checked for the shape the other must have.
  it('has six keys on both sides and no key the other lacks', () => {
    const fromSql = sqlKeys()
    expect(fromSql).toHaveLength(6)
    expect(CHECKLIST_KEYS).toHaveLength(6)
    CHECKLIST_KEYS.forEach((k) => expect(fromSql).toContain(k))
    fromSql.forEach((k) => expect(CHECKLIST_KEYS).toContain(k))
  })

  it('offers no key naming a legal status', () => {
    CHECKLIST_KEYS.concat(sqlKeys()).forEach((k) => {
      expect(k).not.toMatch(/eligib|jurisdict|lawful|valid|qualif|verdict/)
    })
  })

  // ⚠️ The SQL answer vocabulary is the same three, and the migration is
  // what enforces it: `prepare_complaint_screening()` refuses anything
  // else. A client offering a fourth option would be refused `P0001`,
  // which is a sentence nobody can act on.
  it('offers only the three answers the writing RPC accepts', () => {
    const fn = code().match(
      /create or replace function public\.prepare_complaint_screening[\s\S]*?\$function\$;/,
    )
    expect(fn).not.toBeNull()
    expect(fn[0]).toContain("NOT IN ('yes', 'no', 'unknown')")
    ANSWER_VALUES.forEach((v) => expect(fn[0]).toContain(`'${v}'`))
  })

  // And the four outcomes, the same way.
  it('offers only the four outcomes the confirming RPC accepts', () => {
    const fn = code().match(
      /create or replace function public\.confirm_complaint_screening[\s\S]*?\$function\$;/,
    )
    expect(fn).not.toBeNull()
    SCREENING_OUTCOME_VALUES.forEach((v) => expect(fn[0]).toContain(`'${v}'`))
    ;['settled', 'conciliation', 'certificate_to_file_action',
      'eligible', 'dismissed']
      .forEach((v) => expect(fn[0]).not.toContain(`'${v}'`))
  })
})

// ── G. The refusal sentences ─────────────────────────────────────────

describe('G. the words a refusal is read in', () => {
  it('has a sentence for every failure the RPCs can raise', () => {
    expect(Object.keys(SCREENING_ERRORS).sort()).toEqual([
      'alreadyConfirmed', 'confirmFailed', 'incomplete', 'loadFailed',
      'notPermittedConfirm', 'notPermittedPrepare', 'outcomeRequired',
      'prepareFailed', 'selfConfirm',
    ])
  })

  // ⚠️ NO SQLSTATE, NO FUNCTION NAME, NO POLICY, NO TABLE. The RPCs raise
  // `P0001` with their own sentences and two of those name the position
  // gate; printing one would put an authorization model in a toast on a
  // screen somebody may be standing beside.
  it('leaks no SQLSTATE, function name, table or policy', () => {
    const words = Object.values(SCREENING_ERRORS).join(' ')
    ;['P0001', '42501', '23514', '23505', 'SQLSTATE', 'policy', 'RLS',
      'prepare_complaint_screening', 'confirm_complaint_screening',
      'complaint_screenings', 'official_account_links', 'auth.uid',
      'current_official_holds_position', 'trigger', 'constraint']
      .forEach((term) => expect(words).not.toContain(term))
  })

  it('reads as a sentence a person can act on', () => {
    Object.values(SCREENING_ERRORS).forEach((s) => {
      expect(s.length).toBeGreaterThan(25)
      expect(s.trim().endsWith('.')).toBe(true)
    })
  })
})
