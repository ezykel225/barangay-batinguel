import { BrowserRouter as Router,
  Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'

// Pages
import Home from './pages/Home'
import Reservation from './pages/Reservation'
import HealthCenter from './pages/HealthCenter'
import Officials from './pages/Officials'
import Login from './pages/Login'

// Dashboards
import OfficialDashboard from
  './dashboards/OfficialDashboard'
import NurseDashboard from
  './dashboards/NurseDashboard'
import AdminDashboard from
  './dashboards/AdminDashboard'

function App() {
  return (
    <AuthProvider>
      <Router>
        <Toaster position="top-right" />
        <Routes>

          {/* Public Routes */}
          <Route path="/"
            element={<Home />} />
          <Route path="/reservation"
            element={<Reservation />} />
          <Route path="/health-center"
            element={<HealthCenter />} />
          <Route path="/officials"
            element={<Officials />} />
          <Route path="/login"
            element={<Login />} />

          {/* Dashboard Routes */}
          <Route path="/official"
            element={<OfficialDashboard />}
          />
          <Route path="/nurse"
            element={<NurseDashboard />}
          />
          <Route path="/admin"
            element={<AdminDashboard />}
          />

          {/* 404 Route */}
          <Route path="*"
            element={<Home />} />

        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App