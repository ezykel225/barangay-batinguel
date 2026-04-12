import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children, allowedRole }) => {
  const { user, role } = useAuth()

  // If not logged in redirect to login
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // If role does not match redirect to login
  if (allowedRole && role !== allowedRole) {
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute