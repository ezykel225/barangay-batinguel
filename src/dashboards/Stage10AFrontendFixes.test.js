import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.join(__dirname, 'OfficialDashboard.jsx'), 'utf8')

const functionBody = (start, end) => source.slice(source.indexOf(start), source.indexOf(end))

test.each([
  ['verify', 'const handleVerifyResident', 'const handleOpenReject'],
  ['reject', 'const handleConfirmReject', 'const handleOpenIneligible'],
])('%s requires exactly one returned target row before reporting success', (_label, start, end) => {
  const body = functionBody(start, end)
  expect(body).toContain(".select('id')")
  expect(body).toMatch(/!data\s*\|\|\s*data\.length\s*===\s*0/)
  expect(body).toMatch(/data\.length\s*!==\s*1/)
  expect(body).toMatch(/data\[0\]\?\.id\s*!==/)
  expect(body.indexOf(".select('id')")).toBeLessThan(body.lastIndexOf('toast.success'))
})

test('resident registry query requests only fields consumed by voter-reference matching', () => {
  const body = functionBody('const fetchRegistryEntries', 'const fetchActivityLog')
  expect(body).toContain(".select('full_name, purok, household_number')")
  expect(body).not.toContain(".select('*')")
  const matching = functionBody('const findRegistryMatch', 'const handleViewId')
  const display = source.slice(source.indexOf('const registryMatch = findRegistryMatch'), source.indexOf('const registryMatch = findRegistryMatch') + 2600)
  expect(matching).toContain('entry.full_name')
  expect(display).toContain('registryMatch.entry.purok')
  expect(display).toContain('registryMatch.entry.household_number')
})
