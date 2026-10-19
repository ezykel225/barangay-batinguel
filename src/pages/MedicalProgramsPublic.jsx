import { useEffect, useState } from 'react'
import { FaHeartbeat, FaRegClock } from 'react-icons/fa'
import { supabase } from '../supabase/supabaseClient'

export default function MedicalProgramsPublic() {
  const [programs, setPrograms] = useState(null)
  useEffect(() => {
    let live = true
    const load = async () => {
      try {
        const { data, error } = await supabase.from('medical_programs').select('title,schedule_label,time_label,display_order').order('display_order', { ascending: true })
        if (live) setPrograms(error ? [] : data || [])
      } catch { if (live) setPrograms([]) }
    }
    load()
    return () => { live = false }
  }, [])
  return <section className="health-programs-card" aria-labelledby="public-programs-heading"><h3 id="public-programs-heading">Ongoing Medical Programs</h3>
    <p>Programs listed by the Health Center. Confirm availability with clinic staff.</p>
    {programs === null ? <p role="status">Loading programs...</p> : programs.length ? <ul>{programs.map((program,index) => <li key={index}><FaHeartbeat className="health-program-icon" aria-hidden="true" /><div><h4>{program.title}</h4>
      {/\bwalk[- ]?in\b/i.test(program.schedule_label || '') ? <span className="health-program-badge">Walk-in</span> : /\b(every|daily|weekly|monthly)\b/i.test(program.schedule_label || '') ? <span className="health-program-badge">Recurring</span> : null}
      <p>{program.schedule_label}</p>{program.time_label && <p><FaRegClock aria-hidden="true" /> {program.time_label}</p>}</div></li>)}</ul> : <p>No program information is currently published.</p>}
  </section>
}
