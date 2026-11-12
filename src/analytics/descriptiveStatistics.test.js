import { describeCounts } from './descriptiveStatistics'

test('calculates total, mean, median, range and all tied peaks without mutating input', () => {
  const rows = Object.freeze([Object.freeze({ label: 'A', total: 4 }), Object.freeze({ label: 'B', total: 0 }), Object.freeze({ label: 'C', total: '4' })])
  expect(describeCounts(rows)).toMatchObject({ status: 'ready', total: 8, mean: 8 / 3, median: 4, minimum: 0, maximum: 4, leaders: ['A', 'C'], share: 50, first: 4, last: 4 })
})
test('even median includes real zero buckets; endpoints preserve chart order', () => {
  expect(describeCounts([{ label: 'A', total: 0 }, { label: 'B', total: 2 }, { label: 'C', total: 8 }, { label: 'D', total: 6 }]))
    .toMatchObject({ total: 16, mean: 4, median: 4, first: 0, last: 6 })
})
test.each([{ rows: [] }, { rows: [{ label: 'A', total: 0 }] }])('empty and zero counts have no fabricated share or peak', ({ rows }) => {
  expect(describeCounts(rows)).toMatchObject({ status: 'empty', total: 0 })
  expect(describeCounts(rows).share).toBeUndefined()
})
test.each([null, undefined, '', ' ', false, -1, 1.5, NaN, Infinity, 'unavailable', '1e3'])('invalid/missing count %s is unavailable, not zero', value => {
  expect(describeCounts([{ label: 'A', total: 2 }, { label: 'B', total: value }])).toEqual({ status: 'unavailable' })
})
test('missing collection and unsafe total are rejected', () => {
  expect(describeCounts(null)).toEqual({ status: 'unavailable' })
  expect(describeCounts([{ total: Number.MAX_SAFE_INTEGER }, { total: 1 }])).toEqual({ status: 'unavailable' })
})
