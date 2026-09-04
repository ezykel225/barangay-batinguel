import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, role, loading } = useAuth()

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

  // If role does not match redirect to correct dashboard
  if (allowedRole && role !== allowedRole) {
    if (role === 'official') {
      return <Navigate to="/official" replace />
    } else if (role === 'nurse') {
      return <Navigate to="/nurse" replace />
    } else if (role === 'resident') {
      return <Navigate to="/resident" replace />
    } else {
      return <Navigate to="/login" replace />
    }
  }

  return children
}

export default ProtectedRoute