import { Link } from 'react-router-dom'
import { FaLock, FaUnlockAlt } from 'react-icons/fa'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { useAuth } from '../context/AuthContext'
import { SERVICE_GROUPS } from '../constants/eServices'
import './EServices.css'
import { loginHrefFor } from '../utils/returnTo'

// The E-Services landing page.
//
// It renders from the SAME catalogue as the navbar dropdown and the
// mobile drawer -- see src/constants/eServices.js. Adding a service
// there puts it on all three surfaces.
//
// ⚠️ This is a PUBLIC page and must stay one: the public navbar, the
// public footer, the site's typography and card language. It is not a
// dashboard and must not start to look like one, because a resident
// arriving here has not signed in and should not be shown something
// that implies they have.
const EServices = () => {
  const { user, role } = useAuth()
  // Only a signed-in RESIDENT is already past the gate on the resident
  // services. An official or nurse is signed in but has no resident
  // portal, so they see the same sign-in affordance a guest does.
  const isResident = role === 'resident' && !!user

  return (
    <div className="eservices-page">
      <Navbar />

      <main id="main-content" tabIndex={-1}>
        {/* Compact hero. The informational pages (Home, Officials,
            Health Center) carry a tall photographic hero; this page
            exists to get somebody into a service, so the content
            starts sooner. */}
        <section className="eservices-hero">
          <div className="eservices-hero-inner">
            <p className="eservices-hero-label">Barangay Batinguel E-Services</p>
            <h1>E-Services</h1>
            <p className="eservices-hero-text">
              Access Barangay Batinguel services online. Some services are
              open to everyone; others need a verified resident account.
            </p>
          </div>
        </section>

        <section className="eservices-body">
          {SERVICE_GROUPS.map((group) => {
            const needsAccount = group.access === 'resident'
            return (
              <div className="eservices-section" key={group.access}>
                <div className="eservices-section-head">
                  <h2>{group.groupLabel}</h2>
                  {/* Icon AND words. The access rule is never carried by
                      the icon or the colour alone. */}
                  <p className="eservices-section-note">
                    {needsAccount
                      ? <FaLock aria-hidden="true" />
                      : <FaUnlockAlt aria-hidden="true" />}
                    {group.label}
                  </p>
                </div>

                <div className="eservices-grid">
                  {group.services.map((service) => (
                    <article className="eservices-card" key={service.key}>
                      <h3>{service.label}</h3>
                      <p className="eservices-card-text">{service.summary}</p>

                      {/* ⚠️ An unauthenticated visitor is sent to sign
                          in rather than at the service, and is TOLD so
                          on the button itself. The alternative -- send
                          them to the service and let ProtectedRoute
                          bounce them -- is the thing this page exists
                          to stop. `next` carries them back afterwards;
                          Login sanitises it. */}
                      {needsAccount && !isResident ? (
                        <>
                          {/* ⚠️ Built by `loginHrefFor`, never by hand.
                              This line used to assemble
                              `?next=${encodeURIComponent(service.to)}`
                              itself, which is a `next` that skips the
                              allowlist: it would happily put a
                              destination in the URL that Login then
                              refuses, producing a link that promises to
                              bring somebody back and silently does not.
                              The helper returns a plain `/login` for
                              anything not on the list, so the link
                              cannot lie. */}
                          <Link
                            className="eservices-card-btn"
                            to={loginHrefFor(service.to)}
                          >
                            Sign in to continue
                          </Link>
                          <p className="eservices-card-alt">
                            No account yet? <Link to="/signup">Create a resident account</Link>
                          </p>
                        </>
                      ) : (
                        <Link className="eservices-card-btn" to={service.to}>
                          {service.cta}
                        </Link>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )
          })}

          <aside className="eservices-help">
            <h2>Need help?</h2>
            <p>
              Visit the Barangay Hall during office hours, or see the contact
              details at the bottom of this page. Document requests are
              processed by the Barangay Secretary and court reservations by
              the Barangay Treasurer.
            </p>
          </aside>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default EServices
