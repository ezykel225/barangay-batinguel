import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FaBullhorn } from 'react-icons/fa'
import { MdAnnouncement } from 'react-icons/md'
import { supabase } from '../supabase/supabaseClient'
import { announcementExcerpt } from '../utils/homeSections'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import './PageIntro.css'
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
          {/* One compact intro block, shared with /events -- see
              PageIntro.css. The icon is a SIBLING of the heading and
              `aria-hidden`, not part of it: inside the <h1> it wrapped
              to its own line above the title at every width. */}
          <div className="page-intro">
            <Link to="/" className="back-link">← Back to Home</Link>
            <div className="page-intro-row">
              <div className="page-intro-main">
                <span className="page-intro-icon" aria-hidden="true">
                  <MdAnnouncement />
                </span>
                <div className="page-intro-text">
                  <h1>All Announcements</h1>
                  <p>View all barangay updates and public notices.</p>
                </div>
              </div>
            </div>
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
                      {/* ⚠️ AN EXCERPT, and the row is untouched.
                          This is the BROWSE page: it printed each
                          announcement's whole body, so one 616-character
                          notice made its card 1,293px tall and the two
                          beside it were padded to match. The full text
                          is one click away at /announcements/:id, which
                          reads the same `description` column.
                          `announcementExcerpt` is the same function the
                          Home cards use, so the two surfaces cannot cut
                          at different lengths. */}
                      <p className="announcement-card-excerpt">
                        {announcementExcerpt(item.description)}
                      </p>
                      <div className="announcement-card-footer">
                        <span className="announcement-card-date">
                          {new Date(item.date_posted).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                        {/* ⚠️ A <span>, not a second link. The whole
                            card is already one <a> and an <a> inside an
                            <a> is invalid HTML -- so this is an
                            affordance that says where the card goes,
                            not a duplicate control a keyboard user
                            would have to tab past. */}
                        <span className="announcement-card-more" aria-hidden="true">
                          Read announcement →
                        </span>
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