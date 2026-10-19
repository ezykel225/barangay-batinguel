// Trusted profiles.role determines navigation. Login audience tabs grant nothing.
const dashboards = Object.freeze({ official: '/official', nurse: '/nurse', resident: '/resident', tanod: '/tanod' })
export const dashboardForRole = (role) => Object.prototype.hasOwnProperty.call(dashboards, role) ? dashboards[role] : '/login'
export const isSupportedRole = (role) => dashboardForRole(role) !== '/login'
