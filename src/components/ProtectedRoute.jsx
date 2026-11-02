import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { dashboardForRole } from '../utils/authRoles'

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, role, roleStatus, loading, retryRole } = useAuth()

  // While AuthContext is still checking the session, show a spinner
  // instead of redirecting — otherwise a logged-in user gets briefly
  // flashed to /login on every refresh before the session loads.
  if (loading) {
    return (
      <div className="protected-loading">
        <div className="protected-spinner" />
        <p>Checking your session...</p>
      </div>
    )
  }

  // If not logged in redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Signed in, but the role could not be confirmed (no connection, a server error)
  // and none was confirmed earlier. That is not a revocation, so this is not a
  // redirect to /login and not a sign-out: say so, and offer to try again.
  // Nothing in the portal renders, so no role is assumed.
  if (roleStatus === 'unavailable' && !role) {
    return (
      <div className="protected-loading" role="alert">
        <h1 className="protected-retry-title">We couldn't confirm your account</h1>
        <p>The connection to the barangay system was interrupted. You are still signed in.</p>
        <button type="button" className="btn-add" onClick={() => retryRole?.()}>
          Try again
        </button>
      </div>
    )
  }

  // If role does not match redirect to correct dashboard
  if (allowedRole && role !== allowedRole) {
    return <Navigate to={dashboardForRole(role)} replace />
  }

  return children
}

export default ProtectedRoute
