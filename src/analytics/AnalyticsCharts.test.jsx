import { fireEvent, render, screen, within } from '@testing-library/react'
import { BarChart, TrendChart } from './AnalyticsCharts'

test('charts expose the supplied values in a keyboard-scrollable data table',()=>{
 render(<BarChart title="Unit categories" rows={[{key:'a',label:'Unit A',total:2},{key:'b',label:'Unit B',total:1}]} />)
 fireEvent.click(screen.getByText('Show data table'))
 const scroll=screen.getByLabelText('Unit categories data table')
 expect(scroll).toHaveAttribute('tabindex','0')
 expect(within(scroll).getByRole('table')).toBeInTheDocument()
 expect(within(scroll).getByRole('row',{name:'Unit A 2'})).toBeInTheDocument()
 expect(within(scroll).getByRole('row',{name:'Unit B 1'})).toBeInTheDocument()
})
test('time-series text and tables retain real zeros instead of inventing visible events',()=>{
 const {container}=render(<TrendChart title="Unit timeline" granularityLabel="Daily counts" series={[{key:'1',label:'Nov 1',total:0},{key:'2',label:'Nov 2',total:2}]} />)
 expect(screen.getByText(/2 incidents from Nov 1 to Nov 2/)).toBeInTheDocument()
 expect(container.querySelector('.ai-column-bar')).toHaveStyle({height:'0%'})
 fireEvent.click(screen.getByText('Show data table'))
 expect(screen.getByRole('row',{name:'Nov 1 0'})).toBeInTheDocument()
})

test('distribution presentation retains zero rows and long labels in its accessible table',()=>{
 const {DistributionChart}=require('./AnalyticsCharts')
 const long='A very long recorded label '.repeat(6)
 const {container}=render(<DistributionChart title="Unit distribution" columns rows={[{key:'a',label:long,total:4},{key:'b',label:'Zero',total:0}]} />)
 expect(container.querySelectorAll('.ai-distribution-track>span')[1]).toHaveStyle({height:'0%'})
 fireEvent.click(screen.getByText('Show data table'))
 expect(screen.getByRole('row',{name:'Zero 0'})).toBeInTheDocument()
 expect(screen.getByRole('row',{name:`${long.trim()} 4`})).toBeInTheDocument()
})
test('empty distributions expose an empty state and a data table without invented values',()=>{
 const {DistributionChart}=require('./AnalyticsCharts')
 render(<DistributionChart title="Empty distribution" rows={[{key:'a',label:'Zero',total:0}]} />)
 expect(screen.getByText('No incidents in this selection.')).toBeInTheDocument()
 fireEvent.click(screen.getByText('Show data table'))
 expect(screen.getByRole('row',{name:'Zero 0'})).toBeInTheDocument()
})
