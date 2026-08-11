import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Home from './pages/Home'
import Reservation from './pages/Reservation'
import HealthCenter from './pages/HealthCenter'
import Officials from './pages/Officials'
import Login from './pages/Login'
import Announcements from './pages/Announcements'
import AnnouncementDetails from './pages/AnnouncementDetails'
import Events from './pages/Events'
import EventDetails from './pages/EventDetails'

// Dashboards
import OfficialDashboard from './dashboards/OfficialDashboard'
import NurseDashboard from './dashboards/NurseDashboard'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/reservation" element={<Reservation />} />
          <Route path="/health-center" element={<HealthCenter />} />
          <Route path="/officials" element={<Officials />} />
          <Route path="/login" element={<Login />} />

          {/* Announcements Routes */}
          <Route path="/announcements" element={<Announcements />} />
          <Route
            path="/announcements/:id"
            element={<AnnouncementDetails />}
          />

          {/* Events Routes */}
          <Route path="/events" element={<Events />} />
          <Route path="/events/:id" element={<EventDetails />} />

          {/* Dashboard Routes (protected) */}
          <Route
            path="/official"
            element={
              <ProtectedRoute allowedRole="official">
                <OfficialDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/nurse"
            element={
              <ProtectedRoute allowedRole="nurse">
                <NurseDashboard />
              </ProtectedRoute>
            }
          />

          {/* 404 Route */}
          <Route path="*" element={<Home />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App