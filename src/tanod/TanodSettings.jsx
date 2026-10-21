import { useEffect, useRef, useState } from 'react'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'
import { saveTanodDetails, saveTanodPhoto } from './tanodProfile'

export default function TanodSettings({ userId, profile, rosterName, onProfileChange }) {
  const [details, setDetails] = useState({})
  const [busy, setBusy] = useState('')
  const pending = useRef(false)
  const [problem, setProblem] = useState('')
  const [success, setSuccess] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState({})
  const { id, first_name, middle_name, last_name, suffix, contact_number } = profile || {}
  useEffect(() => { setDetails({ first_name, middle_name, last_name, suffix, contact_number }) }, [id, first_name, middle_name, last_name, suffix, contact_number])
  if (!profile || profile.id !== userId || profile.role !== 'tanod') return <p role="status">Your Tanod profile is unavailable. Refresh your information to try again.</p>
  const run = async (key, work) => {
    if (pending.current) return
    pending.current = true; setBusy(key); setProblem(''); setSuccess('')
    try { await work() } catch (error) { setProblem(error.message || 'The change could not be saved.') }
    finally { pending.current = false; setBusy('') }
  }
  const initials = [profile.first_name, profile.last_name].filter(Boolean).map(n => Array.from(n.trim())[0]).join('') || 'T'
  return <div className="td-settings">
    {problem && <p className="td-error" role="alert">{problem}</p>}
    {success && <p className="td-success" role="status">{success}</p>}
    <div className="td-settings-grid">
      <div className="td-settings-main">
      <section className="dashboard-card td-card td-settings-details" aria-labelledby="td-details-title">
        <h2 id="td-details-title">My Details</h2>
        <p className="td-help">These are your account profile details. Your official roster name, account link, assignments and historical records stay unchanged.</p>
        {profile.verification_status === 'verified' && <p className="td-help">Changing your name returns your profile to pending review under the existing verification rules.</p>}
        <form onSubmit={e => { e.preventDefault(); run('details', async () => { onProfileChange(await saveTanodDetails(userId, details)); setSuccess('Profile details updated.') }) }}>
          <fieldset className="td-details-fields" disabled={!!busy}><legend className="sr-only">Editable profile details</legend>
            {[['first_name','First Name',true],['middle_name','Middle Name (optional)'],['last_name','Last Name',true],['suffix','Suffix (optional)'],['contact_number','Contact Number (optional)']].map(([key,label,required]) => <label key={key}>{label}<input type={key === 'contact_number' ? 'tel' : 'text'} required={!!required} value={details[key] || ''} onChange={e => setDetails({ ...details, [key]: e.target.value })} /></label>)}
            <button type="submit" className="btn-add">{busy === 'details' ? 'Saving...' : 'Save Details'}</button>
          </fieldset>
        </form>
      </section>
        <section className="dashboard-card td-card" aria-labelledby="td-photo-title"><h2 id="td-photo-title">Profile Photo</h2><div className="td-photo-controls">{profile.photo_url ? <img src={profile.photo_url} alt={profile.full_name || 'Your profile'} /> : <span className="td-profile-initials" aria-label="Profile initials">{initials}</span>}<div><label htmlFor="td-avatar">{profile.photo_url ? 'Change Photo' : 'Add Photo'}</label><input id="td-avatar" type="file" accept="image/jpeg,image/png,image/webp" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) run('photo', async () => { onProfileChange(await saveTanodPhoto(userId,file,profile.photo_url)); setSuccess('Profile photo updated.') }) }} /><p className="td-help">JPG, PNG or WebP. Up to 5 MB.</p></div></div></section>
      </div>
      <div className="td-settings-side">
        <section className="dashboard-card td-card" aria-labelledby="td-account-title"><h2 id="td-account-title">Account / Tanod Status</h2><dl className="td-settings-status"><div><dt>Role</dt><dd>Barangay Tanod</dd></div><div><dt>Roster identity</dt><dd>{rosterName}</dd></div><div><dt>Account link</dt><dd>Active linked roster account</dd></div></dl><p className="td-help">Roster and account-link changes are managed by authorized barangay staff.</p></section>
        <section className="dashboard-card td-card" aria-labelledby="td-password-title"><h2 id="td-password-title">Change Password</h2><p className="td-help">Choose a password at least 6 characters long.</p>
          <form onSubmit={e => { e.preventDefault(); run('password', async () => {
            if (!password || !confirmation) throw new Error('Please fill in both password fields.')
            if (password !== confirmation) throw new Error('Passwords do not match.')
            if (password.length < 6) throw new Error('Password must be at least 6 characters.')
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw new Error('The password could not be updated. Please try again.')
            setPassword(''); setConfirmation(''); setSuccess('Password updated successfully.')
          }) }} noValidate><fieldset disabled={!!busy}><legend className="sr-only">Password update</legend>
            {[['new','New Password',password,setPassword],['confirm','Confirm New Password',confirmation,setConfirmation]].map(([key,label,value,setValue]) => <label key={key} htmlFor={`td-password-${key}`}>{label}<span className="td-password-field"><input id={`td-password-${key}`} type={visible[key] ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={e => setValue(e.target.value)} /><button type="button" aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={!!visible[key]} onClick={() => setVisible({ ...visible, [key]: !visible[key] })}>{visible[key] ? <FaEyeSlash aria-hidden="true" /> : <FaEye aria-hidden="true" />}</button></span></label>)}
            <button type="submit" className="btn-add">{busy === 'password' ? 'Saving...' : 'Save Password'}</button>
          </fieldset></form>
        </section>

      </div>
    </div>
  </div>
}
