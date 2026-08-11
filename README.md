# Barangay Batinguel E-System

A web-based e-processing system for Barangay Batinguel, Dumaguete City, built with React and Supabase. Public residents can view announcements and events, check the health center schedule, and reserve the covered court online. Barangay officials and the assigned nurse have protected dashboards to manage these services.

## Features

- **Public pages** — Home, Announcements, Events, Officials directory, Health Center schedule, Covered Court Reservation (with GCash payment upload and resident discount)
- **Official Dashboard** — manage reservations, announcements, events, and Kapitan availability status
- **Nurse Dashboard** — manage health center events and availability schedule
- **Authentication** — Supabase Auth with role-based access (official / nurse), protected routes

## Tech Stack

- React 19 + React Router v6
- Supabase (Auth, Database, Storage)
- Tailwind CSS + custom CSS
- react-hot-toast for notifications

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env` file in the project root (see `.env` already included for local development) with:

```
REACT_APP_SUPABASE_URL=your-supabase-project-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-publishable-key
```

**Never commit real production credentials.** `.env` is already excluded via `.gitignore`.

### 3. Run the development server

```bash
npm start
```

Opens the app at [http://localhost:3000](http://localhost:3000).

### 4. Run tests

```bash
npm test
```

### 5. Build for production

```bash
npm run build
```

## Project Structure

```
src/
  assets/        Images used across the site
  components/     Navbar, Footer, Sidebar, ProtectedRoute
  context/        AuthContext (Supabase auth + role state)
  dashboards/     OfficialDashboard, NurseDashboard
  pages/          Public-facing pages (Home, Reservation, Officials, etc.)
  supabase/       Supabase client configuration
```

## Security Notes

- Route protection (`ProtectedRoute`) only controls what the frontend renders. Actual data access control must be enforced through Supabase Row Level Security (RLS) policies on every table and storage bucket used by the app.
- The Supabase key used here is a **publishable key** (`sb_publishable_...`), which is designed to be exposed client-side — it is not a secret. Do not use the `service_role` key in frontend code.
