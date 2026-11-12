import { documentReportMonths, reportCount, reportingMonthKey, reportingDateTime } from './reportingPresentation'
test('Manila month boundaries include the local current month across a UTC year boundary',()=>{
 const series=documentReportMonths([{created_at:'2026-12-31T15:59:59Z'},{created_at:'2026-12-31T16:00:00Z'},{created_at:'2026-07-31T16:00:00Z'},{created_at:'2026-07-31T15:59:59Z'},{created_at:'invalid'},{created_at:null}],new Date('2026-12-31T16:00:00Z'))
 expect(series.map(x=>x.key)).toEqual(['2026-08','2026-09','2026-10','2026-11','2026-12','2027-01']);expect(series[0].documents).toBe(1);expect(series[4].documents).toBe(1);expect(series[5]).toMatchObject({label:'Jan 27',documents:1})
 expect(reportingMonthKey('2026-10-31T16:00:00Z')).toBe('2026-11');expect(reportingMonthKey('invalid')).toBeNull()
})
test.each(['loading','error','denied','incomplete'])('non-ready %s sources never expose zero or stale partial totals',status=>{
 expect(reportCount({status},0)).not.toBe(0);expect(reportCount({status},999)).not.toBe(999)
})
test('only a complete successful read can show a legitimate zero',()=>{expect(reportCount({status:'ready'},0)).toBe(0);expect(reportCount({status:'ready'},12)).toBe(12);expect(reportCount({status:'denied'},0)).toBe('Restricted')})
test('audit timestamps use Manila time and invalid values are explicit',()=>{expect(reportingDateTime('2026-10-31T16:00:00Z')).toMatch(/Nov 1, 2026.*12:00 AM/);expect(reportingDateTime(null)).toBe('Not recorded');expect(reportingDateTime('bad')).toBe('Not recorded')})
