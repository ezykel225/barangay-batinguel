import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import {
  BARANGAY_HISTORY,
  BARANGAY_PROFILE,
  BATINGUEL_ELEMENTARY,
} from '../constants/about'
import { BARANGAY_NAME } from '../constants/barangay'
import './About.css'

// About Barangay Batinguel.
//
// ⚠️ This content was MOVED off the home page, not written here. The
// history, the map, Barangay at a Glance and the Batinguel Elementary
// card filled most of the home page, above the announcements, the
// events and the waste schedule -- so somebody arriving to check when
// their rubbish is collected read several screens of history first.
//
// It is still the barangay's own text, unchanged, from
// `constants/about.js`. Nothing here is invented: this page renders
// what the constants already held.
const About = () => (
  <div className="about-page">
    <Navbar />

    <main id="main-content" tabIndex={-1}>
      <section className="about-hero">
        <div className="about-hero-inner">
          <p className="about-hero-label">About</p>
          <h1>{BARANGAY_NAME}</h1>
          <p className="about-hero-text">{BARANGAY_PROFILE.intro}</p>
        </div>
      </section>

      <section className="about">
        <div className="about-container">
          <div className="about-content">
            <h2>Our history</h2>
            {BARANGAY_HISTORY.map((paragraph) => (
              <p key={paragraph.slice(0, 32)}>{paragraph}</p>
            ))}

            <h3 className="about-subhead">Our Mission</h3>
            <p>
              To provide transparent, efficient, and compassionate public
              service. We are committed to keeping a quality, healthy, and
              digitally-empowered environment where every resident can
              participate in building a sustainable future together.
            </p>
          </div>

          <div className="about-map">
            {/* The same embed the home page carried. `title` is what a
                screen reader announces for an iframe, and without it
                this is announced as "frame" and nothing else. */}
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3937.2635274848303!2d123.2873436758287!3d9.30990198452701!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x33ab6f17b3b1d6ab%3A0xcb78463dddd5353b!2sBatinguel%20Barangay%20Hall!5e0!3m2!1sen!2sph!4v1775801628036!5m2!1sen!2sph"
              width="100%"
              height="100%"
              allowFullScreen=""
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="about-map-iframe"
              title="Barangay Batinguel Location"
            />
          </div>
        </div>
      </section>

      <section className="barangay-profile">
        <div className="barangay-profile-container">
          <div className="profile-card">
            <h3>Barangay at a Glance</h3>
            <dl className="profile-facts">
              {BARANGAY_PROFILE.facts.map((fact) => (
                <div className="profile-fact" key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>

            <h4 className="profile-subhead">Adjacent Barangays</h4>
            <ul className="profile-boundaries">
              {BARANGAY_PROFILE.boundaries.map((edge) => (
                <li key={edge.direction}>
                  <span className="boundary-direction">{edge.direction}</span>
                  <span className="boundary-name">{edge.barangay}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="profile-card">
            <h3>{BATINGUEL_ELEMENTARY.name}</h3>
            <p className="profile-description">{BATINGUEL_ELEMENTARY.description}</p>
            <dl className="profile-facts">
              {BATINGUEL_ELEMENTARY.facts.map((fact) => (
                <div className="profile-fact" key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </main>

    <Footer />
  </div>
)

export default About
