import { useId } from 'react'

export default function CreditGauge({ value, maximum = 100 }) {
  const id = useId()
  const valid = typeof value === 'number' && Number.isFinite(value) && Number.isFinite(maximum) && maximum > 0
  const fraction = valid ? Math.min(1, Math.max(0, value / maximum)) : 0
  return <svg className="credit-gauge" viewBox="0 0 320 200" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{valid ? `Current community credit score ${value} out of ${maximum}` : 'Community credit score unavailable'}</title>
    <desc id={`${id}-desc`}>Server-calculated current policy score. Participation history is recorded separately.</desc>
    <path className="credit-gauge-track" d="M 30 160 A 130 130 0 0 1 290 160" pathLength="100"/>
    <path className="credit-gauge-fill" d="M 30 160 A 130 130 0 0 1 290 160" pathLength="100" strokeDasharray={`${fraction * 100} 100`}/>
    <text x="160" y="132" textAnchor="middle" className="credit-gauge-number">{valid ? value : '—'}</text>
    <text x="160" y="158" textAnchor="middle" className="credit-gauge-caption">{valid ? `out of ${maximum}` : 'Not available'}</text>
    <text x="30" y="191" textAnchor="middle" className="credit-gauge-caption">0</text>
    <text x="290" y="191" textAnchor="middle" className="credit-gauge-caption">{maximum}</text>
  </svg>
}
