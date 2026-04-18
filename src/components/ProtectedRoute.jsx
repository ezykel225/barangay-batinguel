import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, role } = useAuth()

  // If not logged in redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If role does not match redirect to correct dashboard
  if (allowedRole && role !== allowedRole) {
    if (role === 'admin') {
      return <Navigate to="/admin" replace />
    } else if (role === 'official') {
      return <Navigate to="/official" replace />
    } else if (role === 'nurse') {
      return <Navigate to="/nurse" replace />
    } else {
      return <Navigate to="/login" replace />
    }
  }

  return children
}

export default ProtectedRoute