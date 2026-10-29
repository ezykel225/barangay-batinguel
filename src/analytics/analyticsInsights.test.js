import fs from 'fs'
import path from 'path'

const root=path.resolve(__dirname,'../..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')

describe('Phase 4 analytics contract',()=>{
  const sql=read('supabase-migrations/062_analytics_insights.sql')
  test('uses guarded read-only RPCs and explicit matter keys',()=>{
    expect(sql).toContain("'incident:'||")
    expect(sql).toContain("'complaint:'||")
    expect(sql).toContain('perform public.person_history_require_view()')
    expect(sql).toContain("set search_path='' ")
    expect(sql).toContain('from public,anon,authenticated,service_role')
    expect(sql).not.toMatch(/insert\s+into\s+public\.community_credit_events/i)
    expect(sql).not.toMatch(/update\s+public\.community_credit_/i)
  })
  test('keeps qualifying roles and historical threshold factual',()=>{
    expect(sql).toContain("role in ('respondent','subject')")
    expect(sql).toContain("p.party_role='respondent'")
    expect(sql).toContain("'requires_review',(select count(*) from pre)>5")
    expect(sql).toContain("'contributing_matters'")
    expect(sql).toContain("These historical records do not affect the resident''s starting Community Credit score of 100.")
  })
  test('normalizes explicit dispute pairs without name matching',()=>{
    expect(sql).toContain('least(a.person_key,b.person_key)')
    expect(sql).toContain('greatest(a.person_key,b.person_key)')
    expect(sql).not.toMatch(/ilike/i)
  })
  test('wires person, reports and map analytics UI with neutral language',()=>{
    const person=read('src/analytics/PersonAnalytics.jsx')
    const reports=read('src/analytics/AnalyticsInsights.jsx')
    const map=read('src/safetymap/SafetyMapPanel.jsx')
    expect(person).toContain('Contributing records')
    expect(reports).toContain('Analytics &amp; Insights')
    expect(reports).toContain('do not predict behavior or determine wrongdoing')
    expect(map).toContain('loadBarangayAnalytics({ from, to, category: type })')
    expect(person).toContain('historical_review?.requires_review===true')
    expect(person).toContain('Last 30 days')
    expect(person).toContain('Last 90 days')
    expect(reports).toContain('View history')
    expect(reports).toContain('Review disputes')
    expect(reports).toContain('Uses incident filters')
    expect(sql).toContain("where p.status='active'")
    expect(sql).toContain("at time zone 'Asia/Manila'")
    expect(`${person}${reports}`).not.toMatch(/High Risk|Dangerous|Likely Offender|Suspicious/)
  })
})
