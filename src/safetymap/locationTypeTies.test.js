import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { rankHotspots } from './safetyAnalytics'
import { commonTypeLabel } from '../incidents/incidentLabels'

const sql = fs.readFileSync(path.join(__dirname, '../../supabase-migrations/048_location_type_ties.sql'), 'utf8')
const code = sql.replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ').toLowerCase()

// Execute the migration's aggregation against isolated in-memory fixtures.
// SQLite (Node 22+) supports these CTEs and ordered string_agg. Only the
// PostgreSQL casts/collation and the authorization/date-filtered source are
// adapted here; the PostgreSQL security/filter contract is checked below.
test('actual aggregation handles 3/3/2, 2/2/1 and 3/1 without losing location totals', () => {
  const aggregation = sql.split('), type_counts AS (')[1].split('$function$;')[0]
  const query = (`WITH source AS (SELECT * FROM fixture), type_counts AS (${aggregation}`)
    .replace(/::int\b/g, '').replace(/COLLATE "C"/g, 'COLLATE BINARY')
  const script = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE fixture(location_key TEXT, location_text TEXT, latitude REAL, longitude REAL, incident_type TEXT)');
    const insert = db.prepare('INSERT INTO fixture VALUES (?, ?, 9.3, 123.3, ?)');
    for (const [area, counts] of Object.entries({
      'Demo eight': [3, 3, 2], 'Demo five': [2, 2, 1], 'Clear winner': [1, 3, 0],
      'Three tied': [2, 2, 2], 'Single': [1, 0, 0]
    })) {
      counts.forEach((n, i) => {
        for (let j = 0; j < n; j++) insert.run(area.toLowerCase(), area,
          ['disturbance', 'traffic_accident', 'public_safety_hazard'][i]);
      });
    }
    process.stdout.write(JSON.stringify(db.prepare(JSON.parse(process.argv[1])).all()));
    db.close();
  `
  const rows = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '-e', script, JSON.stringify(query)], { encoding: 'utf8' }))
  expect(rows.map((r) => [r.location_label, r.total, commonTypeLabel(r.top_type)])).toEqual([
    ['Demo eight', 8, 'Disturbance / Traffic accident (tie)'],
    ['Three tied', 6, 'Multiple types (tie)'],
    ['Demo five', 5, 'Disturbance / Traffic accident (tie)'],
    ['Clear winner', 4, 'Traffic accident'],
    ['Single', 1, 'Disturbance'],
  ])
  expect(rankHotspots(rows).map((r) => r.total)).toEqual([8, 6, 5, 4])
  expect(rankHotspots(rows, { minimum: 6 }).map((r) => r.total)).toEqual([8, 6])
})

test('preserves reader signature, security gate, filters and execute privileges', () => {
  expect(code).toContain('public.incident_location_frequency( p_from date default null, p_to date default null)')
  expect(code).toContain('centroid_longitude numeric, top_type text)')
  expect(code).toContain("stable security definer set search_path to ''")
  expect(code).toContain('where public.current_official_is_active()')
  expect(code).toContain("(i.occurred_at at time zone 'asia/manila')::date >= p_from")
  expect(code).toContain("(i.occurred_at at time zone 'asia/manila')::date <= p_to")
  expect(code).toContain('revoke execute on function public.incident_location_frequency(date, date) from public, anon;')
  expect(code).toContain('grant execute on function public.incident_location_frequency(date, date) to authenticated;')
  expect(code).not.toMatch(/\b(insert|update|delete|alter|drop)\b/)
  expect(code).not.toMatch(/grant (select|all)|create table|create policy/)
})

test('selects every per-location maximum with deterministic ordering', () => {
  expect(code).toContain('group by location_key, incident_type')
  expect(code).toContain('where t.type_total = ( select max(c.type_total) from type_counts c where c.location_key = t.location_key )')
  expect(code).toContain(`string_agg(incident_type, ' / ' order by incident_type collate "c")`)
  expect(code).not.toContain('mode()')
  expect(code).toContain('order by count(*) desc, s.location_key asc')
})

test.each([
  ['disturbance', 'Disturbance'],
  ['traffic_accident', 'Traffic accident'],
  ['disturbance / traffic_accident', 'Disturbance / Traffic accident (tie)'],
  ['disturbance / public_safety_hazard / traffic_accident', 'Multiple types (tie)'],
])('formats %s for display', (value, expected) => {
  expect(commonTypeLabel(value)).toBe(expected)
})

test('tied type display does not change repeat filtering or location sorting', () => {
  const rows = [
    { location_label: 'Single', total: 1, top_type: 'disturbance' },
    { location_label: 'Zulu', total: 5, top_type: 'disturbance / traffic_accident' },
    { location_label: 'Alpha', total: 5, top_type: 'traffic_accident' },
    { location_label: 'Busiest', total: 8, top_type: 'disturbance / traffic_accident' },
  ]
  expect(rankHotspots(rows).map((r) => r.location_label)).toEqual(['Busiest', 'Alpha', 'Zulu'])
  expect(rankHotspots(rows, { minimum: 6 }).map((r) => r.location_label)).toEqual(['Busiest'])
})
