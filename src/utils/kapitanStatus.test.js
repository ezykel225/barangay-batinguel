import { readKapitanStatus } from './kapitanStatus'

test.each([
  ['unpublished', { data:null, error:null }],
  ['published', { data:{status:'available'}, error:null }],
  ['denied', { data:null, error:{code:'42501'} }],
  ['duplicate', { data:null, error:{code:'PGRST116'} }],
])('%s optional status preserves its result and errors', async (_, result) => {
  const maybeSingle=jest.fn().mockResolvedValue(result)
  const select=jest.fn().mockReturnValue({maybeSingle})
  const client={from:jest.fn().mockReturnValue({select})}
  expect(await readKapitanStatus(client)).toBe(result)
  expect(client.from).toHaveBeenCalledWith('kapitan_status')
  expect(select).toHaveBeenCalledWith('status')
  expect(maybeSingle).toHaveBeenCalledTimes(1)
})
