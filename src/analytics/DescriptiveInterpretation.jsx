import { useId } from 'react'
import { describeCounts } from './descriptiveStatistics'
import './DescriptiveInterpretation.css'

const number = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value)
const names = leaders => leaders.length <= 3 ? leaders.join('; ') : `${leaders.slice(0, 3).join('; ')}; and ${leaders.length - 3} other ${leaders.length === 4 ? 'group' : 'groups'}`

export default function DescriptiveInterpretation({ title, rows, mode = 'distribution', unit = 'records', note, state = 'ready', headingLevel = 4 }) {
  const id = useId()
  const stats = describeCounts(rows)
  const time = mode === 'time'
  const groups = `${time ? 'time bucket' : 'group'}${stats.buckets === 1 ? '' : 's'}`
  const countUnit = stats.total === 1 ? unit.replace(/s$/, '') : unit
  const Heading = `h${headingLevel}`
  return <section className="descriptive-interpretation" aria-labelledby={id}>
    <Heading id={id}>{title}: descriptive interpretation</Heading>
    {state === 'loading' ? <p role="status">Interpretation is loading.</p>
      : state !== 'ready' || stats.status === 'unavailable' ? <p>Interpretation unavailable: complete, valid count data is required. Missing values are not treated as zero.</p>
        : <>
          <p><strong>Description: </strong>{time ? 'Counts are shown in the displayed time buckets, in chart order.' : 'Counts are compared across the groups displayed in this chart.'} {note}</p>
          {stats.status === 'empty' ? <>
            <p><strong>Statistics: </strong>{stats.total} {countUnit} across {stats.buckets} displayed {groups}.</p>
            <p><strong>Conclusion: </strong>No positive counts are displayed. No leading share or change can be established; this does not prove that no events occurred outside these records.</p>
          </> : <>
            <p><strong>Statistics: </strong>{number(stats.total)} {countUnit} across {stats.buckets} displayed {groups}.
              {time ? ` Mean per displayed bucket: ${number(stats.mean)}; median: ${number(stats.median)}; range: ${number(stats.minimum)} to ${number(stats.maximum)}.`
                : ` Largest group count: ${number(stats.maximum)} (${number(stats.share)}% of this chart's total${stats.leaders.length > 1 ? ' for each tied group' : ''}).`}</p>
            <p><strong>Conclusion: </strong>{stats.leaders.length > 1 ? `Tied highest: ${names(stats.leaders)}.` : `Highest displayed count: ${names(stats.leaders)}.`}
              {time && stats.buckets > 1 ? ` First displayed bucket: ${stats.first}; last: ${stats.last}. This endpoint comparison does not establish a sustained trend.` : ''}
              {' '}These descriptive counts do not establish causes, responsibility or future outcomes.</p>
          </>}
        </>}
  </section>
}
