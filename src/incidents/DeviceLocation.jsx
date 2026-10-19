import { useEffect, useRef, useState } from 'react'

export default function DeviceLocation({ onLocation }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const locate = () => {
    if (pending.current) return
    if (!navigator.geolocation) { setMessage('Device location is unavailable. Enter coordinates manually.'); return }
    pending.current = true
    setBusy(true)
    setMessage('Waiting for your location permission…')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      pending.current = false
      if (!mounted.current) return
      setBusy(false)
      onLocation({ latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6) })
      setMessage('Device coordinates filled in. Check them before recording; manual entry remains available.')
    }, () => {
      pending.current = false
      if (!mounted.current) return
      setBusy(false)
      setMessage('Location was denied, unavailable or timed out. Enter coordinates manually.')
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
  }
  return <div><button type="button" className="btn-add" disabled={busy} onClick={locate}>
    {busy ? 'Getting location…' : 'Use current location'}
  </button><p className="field-note" role="status">{message || 'Optional. Requests device permission once; never tracks your movement.'}</p></div>
}
