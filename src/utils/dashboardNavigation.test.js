import { retiredDashboardTab, retiredWorkflowMessage } from './dashboardNavigation'
import { resolveResidentTab } from './residentTabs'
import { dashboardForRole, isSupportedRole } from './authRoles'
test.each(['reservations','waste','registry','voters','medicines','health-events'])('retired link %s is recognized without mutating history',tab=>{
 expect(retiredDashboardTab(tab)).toBe(true)
 expect(resolveResidentTab(tab)).toBe('dashboard')
 expect(retiredWorkflowMessage).toMatch(/Historical records are preserved/)
})
test.each(['documents','complaints','community-credit','settings','dashboard'])('retains resident destination %s',tab=>{
 expect(retiredDashboardTab(tab)).toBe(false);expect(resolveResidentTab(tab)).toBe(tab)
})
test('retired Nurse role fails closed to shared login; retained role paths stay unchanged',()=>{
 expect(isSupportedRole('nurse')).toBe(false);expect(dashboardForRole('nurse')).toBe('/login')
 for(const role of ['official','resident','tanod'])expect(dashboardForRole(role)).toBe('/'+role)
})
