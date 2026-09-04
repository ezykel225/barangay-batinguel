import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase/supabaseClient'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './AnnouncementDetails.css'

const AnnouncementDetails = () => {
  const { id } = useParams()
  const [announcement, setAnnouncement] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchAnnouncement = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Announcement details error:', error)
      } else {
        setAnnouncement(data)
      }
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAnnouncement()
  }, [fetchAnnouncement])


  return (
    <div className="announcement-details-page">
      <Navbar />

      <section className="announcement-details-section">
        <div className="announcement-details-container">
          <Link to="/announcements" className="back-link">
            ← Back to Announcements
          </Link>

          {loading ? (
            <div className="loading-text">Loading announcement...</div>
          ) : !announcement ? (
            <div className="empty-text">Announcement not found.</div>
          ) : (
            <div className="announcement-details-card">
              <span className="announcement-badge">
                {announcement.badge}
              </span>
              <h1>{announcement.title}</h1>
              <div className="announcement-date">
                {new Date(announcement.date_posted).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </div>
              <p>{announcement.description}</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default AnnouncementDetails