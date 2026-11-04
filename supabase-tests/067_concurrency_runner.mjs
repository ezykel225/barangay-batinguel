// LOCAL ONLY. Docker sessions use the container socket; no URL/password is accepted.
// Usage: node supabase-tests/067_concurrency_runner.mjs <empty post-067 template DB>
// Creates and preserves a disposable clone. Never runs against the template itself.
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const template = process.argv[2]
if (!/^validation067_[a-z0-9_]+$/.test(template || '')) throw Error('Expected local validation067_* template')
const container = 'pg067test', db = `validation067_race_${Date.now()}`
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 30000 })
const limits = JSON.parse(docker('inspect', container))[0].HostConfig
assert(limits.Memory > 0 && limits.Memory <= 1073741824 && limits.NanoCpus > 0 && limits.NanoCpus <= 1e9, 'Resource bounds required')
docker('exec', container, 'createdb', '-U', 'supabase_admin', '-T', template, db)
const base = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
function query(sql) { return execFileSync('docker', base, { input: sql, encoding: 'utf8', timeout: 30000 }).trim() }
function session(name) {
  const p = spawn('docker', base, { stdio: ['pipe', 'pipe', 'pipe'] }); let out = '', err = ''
  p.stdout.on('data', b => { out += b }); p.stderr.on('data', b => { err += b })
  const done = new Promise(resolve => p.on('close', code => resolve({ code, out: out.trim(), err })))
  p.stdin.write(`set application_name='${name}'; set statement_timeout='15s'; set lock_timeout='10s';\n`)
  return { write: s => p.stdin.write(s + '\n'), end: () => p.stdin.end(), done, output: () => out }
}
async function until(check, label) {
  const end = Date.now() + 12000
  while (!check()) { if (Date.now() > end) throw Error(`Synchronization timeout: ${label}`); await new Promise(r => setTimeout(r, 30)) }
}
const sec = 'f0670000-0000-4000-8000-000000000001', pun = 'f0670000-0000-4000-8000-000000000002'
const resident = 'f0670000-0000-4000-8000-000000000101'
const actor = id => `select set_config('request.jwt.claim.sub','${id}',true); set local role authenticated;`
const harness = readFileSync('supabase-tests/067_community_credit_v2_behavioral.sql', 'utf8').replace(/\r\n/g, '\n')
const cut = harness.search(/  -- .*TEST 12\./)
assert(cut > 0)
query(harness.slice(0, cut) + `
  for i in 0..9 loop
    a:=pg_temp.q(sec,format('select public.create_community_credit_activity(%L,%L,%L,now()-interval ''1 hour'',null,null,''race attendance'')',gen_random_uuid(),rules->>'CLEANUP_DRIVE','Race activity '||i));
    if not pg_temp.ok(a) then raise exception 'Fixture activity: %',a; end if;
    act1:=(a#>>'{data,activity_id}')::uuid;
    b:=pg_temp.q(sec,format('select public.verify_community_credit_participation(%L,%L,%L,''in_person'',null)',gen_random_uuid(),act1,r_self));
    if not pg_temp.ok(b) then raise exception 'Fixture verification: %',b; end if;
  end loop;
end; $tests$; commit;`)
const acts = query("select id from public.community_credit_activities where title like 'Race activity %' order by title").split('\n')
assert.equal(acts.length, 10)
const award = (n, req = randomUUID()) => `select public.award_community_credit_participation('${req}','${acts[n]}','${resident}');`
function call(sql, who = sec) { const out = query(`begin; ${actor(who)} ${sql} commit;`); return JSON.parse(out.split('\n').find(l => l.startsWith('{'))) }
let checks = 0
function pass(label) { checks++; console.log(`PASS ${checks}: ${label}`) }
async function race(label, lockSql, commands, expectedCodes = [0, 0]) {
  const blocker = session('067_blocker'); blocker.write(`begin; ${lockSql}; select 'BARRIER';`)
  await until(() => blocker.output().includes('BARRIER'), 'blocker acquired')
  const workers = commands.map((c, i) => { const w = session(`067_${label}_${i}`); w.write(`begin; ${actor(c.actor || sec)} ${c.sql} commit;`); w.end(); return w })
  await until(() => Number(query(`select count(*) from pg_stat_activity where datname=current_database() and application_name like '067_${label}_%' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0`)) === workers.length, label)
  blocker.write('commit;'); blocker.end(); assert.equal((await blocker.done).code, 0)
  const results = await Promise.all(workers.map(w => w.done))
  assert.deepEqual(results.map(r => r.code).sort(), [...expectedCodes].sort(), JSON.stringify(results))
  for (const r of results) assert(!r.err.includes('40P01') && !r.err.includes('57014'), JSON.stringify(r))
  return results
}
const partLock = n => `select activity_id from public.community_credit_participations where activity_id='${acts[n]}' and resident_id='${resident}' for update`
const request = randomUUID()
let result = await race('identical', partLock(0), [{ sql: award(0, request) }, { sql: award(0, request) }])
const payloads = result.map(r => JSON.parse(r.out.split('\n').find(l => l.startsWith('{'))))
assert.equal(payloads[0].event_id, payloads[1].event_id); assert.equal(payloads.filter(p => p.replayed).length, 1)
pass('identical simultaneous requests return one event and one replay')
result = await race('distinct', partLock(1), [{ sql: award(1) }, { sql: award(1) }], [0, 3])
assert(result.find(r => r.code !== 0).err.includes('Points have already been awarded'))
pass('distinct requests for one participation serialize and reject duplicate')
assert.equal(call(award(0, request)).event_id, payloads[0].event_id); pass('committed retry returns original event')
call(award(2)) // 15 of 20 annual points used.
result = await race('cap', `select * from public.community_credit_cap_locks where resident_id='${resident}' for update`, [{ sql: award(3) }, { sql: award(4) }])
assert.deepEqual(result.map(r => JSON.parse(r.out.split('\n').find(l => l.startsWith('{'))).state).sort(), ['awarded', 'capped'])
assert.equal(Number(query(`select sum(points_delta_snapshot) from public.community_credit_events where resident_id='${resident}' and participation_activity_id is not null`)), 20)
pass('concurrent distinct activities share atomic annual cap; one awarded and one capped')
result = await race('reversal', partLock(0), [
  { actor: pun, sql: `select public.reverse_community_credit_award('${randomUUID()}','${payloads[0].event_id}','race correction');` }, { sql: award(0) }
], [0, 3])
assert(result.find(r => r.code !== 0).err.match(/already been awarded|award was reversed/))
pass('reversal versus competing award safely serializes without unexpected deadlock')
const blocker = session('067_timeout_blocker'); blocker.write(`begin; ${partLock(6)}; select 'BARRIER';`)
await until(() => blocker.output().includes('BARRIER'), 'timeout lock')
const retryRequest = randomUUID()
const timed = session('067_timeout'); timed.write(`begin; set local lock_timeout='250ms'; ${actor(sec)} ${award(6, retryRequest)} commit;`); timed.end()
const timedResult = await timed.done; assert.equal(timedResult.code, 3); assert(timedResult.err.includes('55P03'))
blocker.write('commit;'); blocker.end(); await blocker.done
assert.equal(query(`select state from public.community_credit_participations where activity_id='${acts[6]}'`), 'verified')
pass('lock timeout is explicit 55P03 and leaves participation unchanged')
const retry = call(award(6, retryRequest)); assert.equal(call(award(6, retryRequest)).state, retry.state)
pass('retry after contention completes and its committed retry is idempotent')
const duplicate = session('067_unique'); duplicate.write(`begin; select public.community_credit_v2_writer(true); insert into public.community_credit_participations select * from public.community_credit_participations where activity_id='${acts[0]}'; commit;`); duplicate.end()
const uniqueResult = await duplicate.done; assert.equal(uniqueResult.code, 3); assert(uniqueResult.err.includes('23505'))
pass('database primary key rejects duplicate participation even for a trusted writer')
const eventFor = n => query(`select active_award_event_id from public.community_credit_participations where activity_id='${acts[n]}'`)
call(`select public.reverse_community_credit_award('${randomUUID()}','${eventFor(2)}','make cap room');`, pun)
await race('reverse_other', 'lock table public.community_credit_events in share mode', [
  { actor: pun, sql: `select public.reverse_community_credit_award('${randomUUID()}','${eventFor(1)}','competing reversal');` },
  { sql: award(7) }
])
pass('reversal and award for different participations overlap at ledger insertion and preserve cap safety')
query('create schema ci067; create table ci067.deadlock_probe(id int primary key); insert into ci067.deadlock_probe values(1),(2);')
const d1 = session('067_deadlock_1'), d2 = session('067_deadlock_2')
d1.write("begin; set local deadlock_timeout='100ms'; select * from ci067.deadlock_probe where id=1 for update; select 'READY';")
d2.write("begin; set local deadlock_timeout='100ms'; select * from ci067.deadlock_probe where id=2 for update; select 'READY';")
await until(() => d1.output().includes('READY') && d2.output().includes('READY'), 'deadlock initial locks')
d1.write('select * from ci067.deadlock_probe where id=2 for update; commit;'); d2.write('select * from ci067.deadlock_probe where id=1 for update; commit;'); d1.end(); d2.end()
const deadlocks = await Promise.all([d1.done, d2.done]); assert.deepEqual(deadlocks.map(r => r.code).sort(), [0, 3]); assert.equal(deadlocks.filter(r => r.err.includes('40P01')).length, 1)
pass('deliberately injected lock cycle reports 40P01, aborts one session and releases locks')
assert.equal(query(`select count(*) from public.community_credit_participations p left join public.community_credit_events e on e.id=p.active_award_event_id where (p.state='awarded' and (e.id is null or e.participation_activity_id<>p.activity_id or e.resident_id<>p.resident_id or exists(select 1 from public.community_credit_events r where r.reverses_event_id=e.id))) or (p.state<>'awarded' and p.active_award_event_id is not null)`), '0')
assert.equal(query(`select count(*) from (select e.resident_id,e.rule_id,a.cap_year from public.community_credit_events e join public.community_credit_activities a on a.id=e.participation_activity_id group by e.resident_id,e.rule_id,a.cap_year having sum(e.points_delta_snapshot)>20) x`), '0')
assert.equal(query(`select count(*) from (select participation_activity_id,participation_resident_id from public.community_credit_events e where participation_activity_id is not null and event_kind='positive' and not exists(select 1 from public.community_credit_events r where r.reverses_event_id=e.id) group by 1,2 having count(*)>1) x`), '0')
pass('ledger, active-award uniqueness, participation states and annual totals remain consistent')
console.log(`PASS: ${checks} concurrency checks; disposable database preserved: ${db}`)
