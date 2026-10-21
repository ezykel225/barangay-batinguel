import { supabase } from '../supabase/supabaseClient'
import { avatarProblem, compactTanodName, loadTanodProfile, saveTanodDetails, saveTanodPhoto } from './tanodProfile'

jest.mock('../supabase/supabaseClient', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }))
const profile = { id: 'account-id', role: 'tanod', first_name: 'Carlo', middle_name: 'M.', last_name: 'Abellanosa', full_name: 'Carlo M. Abellanosa' }
let query, bucket
beforeEach(() => {
  jest.clearAllMocks()
  query = { select: jest.fn(), update: jest.fn(), eq: jest.fn(), single: jest.fn().mockResolvedValue({ data: profile, error: null }), then: resolve => Promise.resolve({ data: [profile], error: null }).then(resolve) }
  for (const key of ['select','update','eq']) query[key].mockReturnValue(query)
  supabase.from.mockReturnValue(query)
  bucket = { upload: jest.fn().mockResolvedValue({ error: null }), getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.test/storage/v1/object/public/resident-photos/account-id/new.png' } }), remove: jest.fn().mockResolvedValue({ error: null }) }
  supabase.storage.from.mockReturnValue(bucket)
})
test.each([
  [profile, '', 'Carlo A.'],
  [{ first_name: 'Renato', middle_name: 'P.', last_name: 'Villanueva' }, '', 'Renato V.'],
  [{ first_name: 'Joel', last_name: 'Mercado' }, '', 'Joel M.'],
  [{ first_name: 'Maria Clara', last_name: 'de la Cruz' }, '', 'Maria Clara D.'],
  [null, 'Carlo M. Abellanosa', 'Carlo A.'],
  [null, 'Carlo M. Abellanosa Jr.', 'Carlo A.'],
  [{ first_name: 'Carlo' }, 'Unrelated Roster', 'Carlo'],
  [{ last_name: 'Abellanosa' }, '', 'Barangay Tanod'],
  [null, 'Carlo', 'Carlo'], [null, '', 'Barangay Tanod'],
])('compact name %j uses structured parts or safe legacy fallback', (person, roster, expected) => {
  expect(compactTanodName(person,roster)).toBe(expected)
})
test('loads the signed-in Tanod profile by stable UUID and role', async () => {
  expect(await loadTanodProfile('account-id')).toEqual(profile)
  expect(query.eq.mock.calls).toEqual([['id','account-id'],['role','tanod']])
  query.single.mockResolvedValue({ data: { ...profile, role: 'resident' }, error: null })
  await expect(loadTanodProfile('account-id')).rejects.toThrow('could not be loaded')
})
test('profile update allowlists editable fields; never changes roster, link, UUID or authorization', async () => {
  await saveTanodDetails('account-id', { ...profile, first_name: '  Carlo  ', role: 'official', tanod_id: 'forged', verification_status: 'verified', contact_number: ' 09123456789 ' })
  expect(supabase.from).toHaveBeenCalledWith('profiles')
  expect(query.update).toHaveBeenCalledWith({ first_name: 'Carlo', middle_name: 'M.', last_name: 'Abellanosa', suffix: null, contact_number: '09123456789' })
  expect(query.eq.mock.calls).toEqual([['id','account-id'],['role','tanod']])
  expect(query.update.mock.calls[0][0]).not.toHaveProperty('full_name')
})
test('incomplete names and missing signed-in identity cannot be saved', async () => {
  await expect(saveTanodDetails('account-id',{first_name:'',last_name:'A'})).rejects.toThrow('first name')
  await expect(saveTanodDetails(null,profile)).rejects.toThrow('Sign in')
  expect(query.update).not.toHaveBeenCalled()
})
test('zero-row/denied profile update does not report success', async () => {
  query.then = resolve => Promise.resolve({ data: [], error: null }).then(resolve)
  await expect(saveTanodDetails('account-id',profile)).rejects.toThrow('could not be confirmed')
})
test('uses the shared avatar bucket and own folder, updates profile before removing replaced photo', async () => {
  await saveTanodPhoto('account-id',new File(['photo'],'photo.png',{type:'image/png'}),'https://example.test/storage/v1/object/public/resident-photos/account-id/old.png')
  expect(supabase.storage.from).toHaveBeenCalledWith('resident-photos')
  expect(bucket.upload).toHaveBeenCalledWith(expect.stringMatching(/^account-id\/\d+\.png$/),expect.any(File),{upsert:true})
  expect(query.update).toHaveBeenCalledWith({photo_url:expect.any(String)})
  expect(bucket.remove).toHaveBeenCalledWith(['account-id/old.png'])
  expect(query.update.mock.invocationCallOrder[0]).toBeLessThan(bucket.remove.mock.invocationCallOrder[0])
})
test('invalid MIME and oversized images never upload; failed saves preserve the old photo', async () => {
  expect(avatarProblem({type:'image/png',size:5*1024*1024})).toBe('')
  expect(avatarProblem({type:'constructor',size:10})).toMatch('JPG')
  expect(avatarProblem({type:'image/png',size:5*1024*1024+1})).toMatch('5 MB')
  await expect(saveTanodPhoto('account-id',new File(['pdf'],'id.pdf',{type:'application/pdf'}))).rejects.toThrow('JPG')
  expect(bucket.upload).not.toHaveBeenCalled()
  query.then = resolve => Promise.resolve({data:[],error:null}).then(resolve)
  await expect(saveTanodPhoto('account-id',new File(['png'],'p.png',{type:'image/png'}),'https://example.test/storage/v1/object/public/resident-photos/account-id/old.png')).rejects.toThrow('confirmed')
  expect(bucket.remove).not.toHaveBeenCalledWith(['account-id/old.png'])
})
test('a foreign/legacy prior URL never triggers deletion of another profile photo', async () => {
  await saveTanodPhoto('account-id',new File(['p'],'p.jpg',{type:'image/jpeg'}),'https://example.test/storage/v1/object/public/resident-photos/other-id/old.jpg')
  expect(bucket.remove).not.toHaveBeenCalled()
})
