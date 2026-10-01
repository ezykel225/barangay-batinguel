import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBullhorn } from 'react-icons/fa'
import { MdAnnouncement } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './Announcements.css'

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('date_posted', { ascending: false })

      if (error) {
        console.error('Announcements error:', error)
      } else {
        setAnnouncements(data || [])
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="announcements-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>

      <section className="announcements-page-section">
        <div className="announcements-page-container">
          <Link to="/" className="back-link">← Back to Home</Link>

          <div className="announcements-page-header">
            <h1><MdAnnouncement /> All Announcements</h1>
            <p>View all barangay updates and public notices.</p>
          </div>

          {loading ? (
            <div className="loading-text">Loading announcements...</div>
          ) : announcements.length === 0 ? (
            <div className="empty-text">No announcements yet.</div>
          ) : (
            <div className="announcements-page-grid">
              {announcements.map((item) => (
                <Link
                  key={item.id}
                  to={`/announcements/${item.id}`}
                  className="announcement-card-link"
                >
                  <div className="announcement-card">
                    <div className="announcement-card-image">
                      <FaBullhorn />
                    </div>
                    <div className="announcement-card-body">
                      <span className="announcement-badge">{item.badge}</span>
                      {/* ⚠️ (X3) h2, not h3. This page's only other
                          heading is its <h1>, so an <h3> here skips a
                          level and a screen-reader user navigating by
                          heading hears a gap. On Home the same card sits
                          under a section <h2>, where h3 is correct --
                          which is why the two pages differ. */}
                      <h2>{item.title}</h2>
                      <p>{item.description}</p>
                      <div className="announcement-card-footer">
                        {new Date(item.date_posted).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      </main>
      <Footer />
    </div>
  )
}

export default Announcements