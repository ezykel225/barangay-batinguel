import { useId } from 'react'

// Presentation only: the profile RPC supplies both values.
export default function CreditGauge({ value, maximum }) {
  const id = useId()
  const valid = typeof value === 'number' && Number.isFinite(value) &&
    typeof maximum === 'number' && Number.isFinite(maximum) && maximum > 0 &&
    value >= 0 && value <= maximum
  return <svg className="credit-gauge" viewBox="0 0 320 200" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{valid ? `Current community credit score ${value} out of ${maximum}` : 'Community credit score unavailable'}</title>
    <desc id={`${id}-desc`}>Current score supplied by the Community Credit profile. This display does not calculate or change your score.</desc>
    <path className="credit-gauge-track" d="M 30 160 A 130 130 0 0 1 290 160" pathLength="100" />
    {valid && <path className="credit-gauge-fill" d="M 30 160 A 130 130 0 0 1 290 160" pathLength="100" strokeDasharray={`${value / maximum * 100} 100`} />}
    <text x="160" y="132" textAnchor="middle" className="credit-gauge-number">{valid ? value : '—'}</text>
    <text x="160" y="158" textAnchor="middle" className="credit-gauge-caption">{valid ? `out of ${maximum}` : 'Not available'}</text>
    <text x="30" y="191" textAnchor="middle" className="credit-gauge-caption">{valid ? 0 : '—'}</text>
    <text x="290" y="191" textAnchor="middle" className="credit-gauge-caption">{valid ? maximum : '—'}</text>
  </svg>
}
