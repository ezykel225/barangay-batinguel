import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Home from './pages/Home'
import Reservation from './pages/Reservation'
import EServices from './pages/EServices'
import TrackReservation from './pages/TrackReservation'
import TrackComplaint from './pages/TrackComplaint'
import CommunitySafety from './pages/CommunitySafety'
import About from './pages/About'
import HealthCenter from './pages/HealthCenter'
import Officials from './pages/Officials'
import Login from './pages/Login'
import ResidentSignup from './pages/ResidentSignup'
import ResetPassword from './pages/ResetPassword'
import Announcements from './pages/Announcements'
import AnnouncementDetails from './pages/AnnouncementDetails'
import Events from './pages/Events'
import EventDetails from './pages/EventDetails'

// Dashboards
import OfficialDashboard from './dashboards/OfficialDashboard'
import NurseDashboard from './dashboards/NurseDashboard'
import ResidentDashboard from './dashboards/ResidentDashboard'
import TanodDashboard from './dashboards/TanodDashboard'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" />

        {/* First thing in the tab order on every page, so a keyboard or
            screen-reader user can jump straight past the navigation
            instead of tabbing through it again on each page. Invisible
            until focused. Every page and dashboard now renders a
            <main id="main-content"> for it to target. Placed here rather
            than in Navbar because the three auth pages and the three
            dashboards do not all share one header. */}
        <a className="skip-link" href="#main-content">Skip to main content</a>

        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/e-services" element={<EServices />} />
          <Route path="/reservation" element={<Reservation />} />
          <Route path="/track-reservation" element={<TrackReservation />} />
          {/* ⚠️ Public on purpose: a walk-in complainant has no account.
              The lookup itself is two-factor inside track_complaint(). */}
          <Route path="/track-complaint" element={<TrackComplaint />} />
          {/* ⚠️ The PUBLIC Community Safety Map, and it is a different
              data surface from the Official one -- aggregated cells and
              counts only, never `incident_map_points()`. Public on
              purpose: a resident reads it from ordinary navigation, so
              there is no resident-only copy to drift from this one.
              The route and every link to it landed in one commit,
              because `path="*"` renders Home -- a navigation entry whose
              route does not exist yet does not 404, it silently shows
              the homepage and reads as broken. */}
          <Route path="/community-safety" element={<CommunitySafety />} />
          <Route path="/about" element={<About />} />
          <Route path="/health-center" element={<HealthCenter />} />
          <Route path="/officials" element={<Officials />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<ResidentSignup />} />
          <Route path="/reset-password" element={<ResetPassword />} />

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
          <Route
            path="/resident"
            element={
              <ProtectedRoute allowedRole="resident">
                <ResidentDashboard />
              </ProtectedRoute>
            }
          />

          <Route path="/tanod" element={<ProtectedRoute allowedRole="tanod"><TanodDashboard /></ProtectedRoute>} />

          {/* 404 Route */}
          <Route path="*" element={<Home />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App