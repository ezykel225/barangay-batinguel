import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const sql = fs.readFileSync(path.join(__dirname, '../../supabase-migrations/049_public_zone_type_counts.sql'), 'utf8')
const code = sql.replace(/--[^\r\n]*/g, '').replace(/\s+/g, ' ').toLowerCase()

test('public reader exposes only safe grouped fields and retains hardened public grants', () => {
  expect(code).toContain('returns table (zone_key text, incident_type text, total integer)')
  expect(code).toContain("stable security definer set search_path to ''")
  expect(code).toContain('select z.zone_key from public.public_safety_zones(p_from, p_to) z')
  expect(code).toContain('case when t.type_total >= 2 then t.incident_type else null end')
  expect(code).toContain('revoke execute on function public.public_safety_zone_type_counts(date, date) from public;')
  expect(code).toContain('grant execute on function public.public_safety_zone_type_counts(date, date) to anon, authenticated;')
  expect(code).toContain("(i.occurred_at at time zone 'asia/manila')::date >= p_from")
  expect(code).toContain("(i.occurred_at at time zone 'asia/manila')::date <= p_to")
  expect(code).toContain('public.public_safety_coarsen(i.latitude)')
  expect(code).toContain('public.public_safety_coarsen(i.longitude)')
  expect(code).not.toMatch(/\b(insert|update|delete|alter|drop)\b|grant (all|select)|create table|create policy/)
  expect(code).not.toMatch(/reference|narrative|evidence|full_name|location_text/)
  expect(code.match(/create or replace function/g)).toHaveLength(1)
})

test('SQL aggregation suppresses singleton names and reconciles all four example cells', () => {
  // Run the actual grouping/projection SQL on isolated in-memory data. Only
  // PostgreSQL casts/collation and the input CTEs are adapted for Node SQLite.
  const body = sql.split('), type_counts AS (')[1].split('$function$;')[0]
  const query = (`WITH published AS (SELECT zone_key FROM fixture GROUP BY zone_key HAVING count(*) >= 2), source AS (SELECT * FROM fixture), type_counts AS (${body}`)
    .replace(/::int\b/g, '').replace(/COLLATE "C"/g, 'COLLATE BINARY')
  const script = `
    const {DatabaseSync} = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE fixture(zone_key TEXT, incident_type TEXT)');
    const add = db.prepare('INSERT INTO fixture VALUES (?, ?)');
    for (const [zone, counts] of Object.entries({ a:[3,3,2], b:[2,2,1], c:[1,1,0], d:[0,2,0], hidden:[1,0,0] })) {
      counts.forEach((n,i) => { for(let j=0;j<n;j++) add.run(zone,['disturbance','traffic_accident','public_safety_hazard'][i]); });
    }
    process.stdout.write(JSON.stringify(db.prepare(JSON.parse(process.argv[1])).all()));
    db.close();
  `
  const rows = JSON.parse(execFileSync(process.execPath, ['--no-warnings', '-e', script, JSON.stringify(query)], { encoding: 'utf8' }))
  const forZone = (key) => rows.filter((r) => r.zone_key === key).map((r) => [r.incident_type, r.total])
  expect(forZone('a')).toEqual([['disturbance',3], ['public_safety_hazard',2], ['traffic_accident',3]])
  expect(forZone('b')).toEqual([['disturbance',2], ['traffic_accident',2], [null,1]])
  expect(forZone('c')).toEqual([[null,2]])
  expect(forZone('d')).toEqual([['traffic_accident',2]])
  expect(forZone('hidden')).toEqual([])
  for (const [key, total] of Object.entries({a:8,b:5,c:2,d:2})) {
    expect(forZone(key).reduce((sum, r) => sum+r[1],0)).toBe(total)
  }
  expect(JSON.stringify(forZone('b'))).not.toContain('public_safety_hazard')
  expect(JSON.stringify(forZone('c'))).not.toMatch(/disturbance|traffic_accident/)
})
