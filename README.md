# Barangay Batinguel E-System

A web-based e-processing system for Barangay Batinguel, Dumaguete City, built with React and Supabase. Public residents can view announcements and events, check the health center schedule, and reserve the covered court online. Barangay officials and the assigned nurse have protected dashboards to manage these services.

## Features

- **Public pages** — Home, Announcements, Events, Officials directory, Health Center schedule, Covered Court Reservation (free to book, with an availability calendar and an optional GCash or in-kind donation)
- **Official Dashboard** — reservations, announcements, events, document requests, waste collection schedule, officials directory, residents registry, resident account verification, reports, and an activity log
- **Nurse Dashboard** — health center events, medical programs, and the weekly availability schedule
- **Resident Dashboard** — request barangay documents, track their status, and view your own court reservations
- **Authentication** — Supabase Auth with role-based access (official / nurse / resident), protected routes, self-service password reset

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

Copy `.env.example` to `.env` and fill in the values from your Supabase
project (Project Settings -> API):

```bash
cp .env.example .env
```

```
REACT_APP_SUPABASE_URL=your-supabase-project-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-publishable-key
```

`.env` is excluded via `.gitignore` and must never be committed — copy it
between machines by hand.

Both variables are read at **build time**. If either is missing,
`npm run build` still exits 0 but produces a blank page, so make sure
they are set before building or deploying.

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
  utils/          Shared helpers (official photo lookup)

supabase-migrations/
  Numbered SQL files recording the schema, RLS policies and triggers
  applied to the hosted Supabase project. Apply them in order when
  setting up a new environment.
```

## Security Notes

- Route protection (`ProtectedRoute`) only controls what the frontend renders. Actual data access control must be enforced through Supabase Row Level Security (RLS) policies on every table and storage bucket used by the app.
- The Supabase key used here is a **publishable key** (`sb_publishable_...`), which is designed to be exposed client-side — it is not a secret. It is already readable in the deployed JavaScript bundle, so **the RLS policies are what protect the data, not the key.** Do not use the `service_role` key in frontend code.
- Role-restricted actions are enforced twice: the dashboards hide controls the signed-in official has no right to use, and the RLS policies reject the write regardless. Where a write can be filtered out by RLS, the code checks that a row actually came back rather than assuming success.
- Officials are linked to their auth account by matching `full_name` between `profiles` and `barangay_officials`. That string join is what the Treasurer and Secretary policies key on, so the two spellings must match exactly.
- `reservation-payments` and `residency-proofs` are currently public buckets with anonymous read, which makes uploaded payment proofs and residency documents enumerable by anyone. Serving them to officials through signed URLs — as `id-verification` already does — would close that.
