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
  test('restricts named barangay-wide lists to records administrators (Remediation B)',()=>{
    const fn=name=>sql.slice(sql.indexOf(`create function public.${name}(`),sql.indexOf('end; $$;',sql.indexOf(`create function public.${name}(`)))
    // The database is the control; both gates reuse the existing helpers.
    expect(fn('repeated_dispute_analytics')).toContain('perform public.person_history_require_admin();')
    expect(fn('repeated_dispute_analytics')).not.toContain('person_history_require_view')
    expect(fn('barangay_safety_analytics')).toContain('v_admin:=coalesce(public.current_official_may_administer_records(),false);')
    expect(fn('barangay_safety_analytics')).toContain("'repeat_people',case when v_admin then")
    expect(fn('barangay_safety_analytics')).toContain("'repeat_people_restricted',not v_admin")
    expect(fn('person_analytics')).toContain("case when m.matter_kind='complaint' and not v_admin then 'Restricted' else m.area_label end area_label")
    // No committee-based or invented authorization.
    expect(sql.replace(/--[^\n]*/g,'')).not.toMatch(/\bcommittee\b/i)
    // The frontend flag mirrors current_official_may_administer_records().
    const dashboard=read('src/dashboards/OfficialDashboard.jsx')
    expect(dashboard).toContain("<AnalyticsInsights canAdminister={isSecretary || isKapitan} />")
    const reports=read('src/analytics/AnalyticsInsights.jsx')
    expect(reports).toContain("if(!canAdminister)setDisputes(RESTRICTED)")
    expect(reports).not.toMatch(/Promise\.all\(\[loadBarangayAnalytics/)
  })
  test('navigation names the page it opens, and the unreachable Reports code is gone (Remediation C)',()=>{
    const sidebar=read('src/components/Sidebar.jsx')
    const reports=read('src/analytics/AnalyticsInsights.jsx')
    const dashboard=read('src/dashboards/OfficialDashboard.jsx')
    // X1: a heading matches the nav item that leads to it.
    expect(sidebar).toContain("{ id: 'reports', label: 'Analytics & Insights'")
    expect(sidebar).not.toContain("label: 'Reports'")
    expect(reports).toContain('<h1>Analytics &amp; Insights</h1>')
    expect(dashboard).not.toMatch(/\{false\s*&&/)
    expect(dashboard).not.toMatch(/monthlyCounts|documentTypeCounts|<h1>Reports<\/h1>/)
  })
  test('history and analytics load together without one failure hiding the other (Remediation C)',()=>{
    for (const file of ['src/analytics/AnalyticsInsights.jsx','src/people/PeopleHistory.jsx','src/people/ResidentHistory.jsx']) {
      const text=read(file)
      expect(text).toContain('settlePersonRecord(')
      expect(text).not.toMatch(/Promise\.all\(/)
    }
    expect(read('src/analytics/PersonAnalytics.jsx')).toContain('catch{setWindowProblem(')
    expect(read('src/safetymap/SafetyMapPanel.jsx')).not.toMatch(/<button type="button" disabled>/)
  })
})
