# Barangay Batinguel E-System

A web-based e-processing system for Barangay Batinguel, Dumaguete City,
built with React and Supabase. Residents can view announcements and
events, check the health center schedule and which medicines are in
stock, reserve the covered court, and request barangay documents.
Officials and the health center nurse have protected dashboards to
manage those services.

## Features

### Public pages
- Home, Announcements, Events, Officials directory
- **Health Center** — clinic hours including the lunch break, the
  nurse's live availability, and which medicines are currently in stock
- **Covered Court Reservation** — free to book, with a month-at-a-glance
  availability calendar. No payment of any kind; donations are voluntary
  and handled in person at the Barangay Hall.

### Resident Dashboard
- Request barangay documents and track their status
- View and cancel their own court reservations
- Correct their own name, contact number and purok
- Upload a valid ID (optional — see *Design decisions*)

### Official Dashboard
Reservations, announcements, events, document requests, waste collection
schedule, officials directory, residents registry, resident account
verification, reports, and an append-only activity log.

### Nurse Dashboard
Medicine availability, health center events, medical programs, and the
weekly availability schedule.

### Authentication
Supabase Auth with role-based access (official / nurse / resident),
protected routes, email confirmation, and self-service password reset.

## Tech Stack

- React 19 + React Router v6 (Create React App)
- Supabase — Auth, Postgres, Storage, Edge Functions
- react-hot-toast for notifications, react-icons for icons
- Plain CSS, one stylesheet per component

> Tailwind is present in `package.json` and `src/index.css` but is not
> actually used — the styling is hand-written CSS throughout. It can be
> removed.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

You will see deprecation warnings and a vulnerability count. Both are
expected: they come from `react-scripts`, and every reported
vulnerability is in the local development toolchain
(`webpack-dev-server`), not in anything deployed.

**Do not run `npm audit fix --force`.** It "fixes" them by installing
`react-scripts@0.0.0`, which breaks the build entirely.

If `npm install` modifies `package-lock.json`, restore it with
`git restore package-lock.json` unless you deliberately changed a
dependency. That file pins exact versions so every machine installs the
same tree.

### 2. Set up environment variables

Copy `.env.example` to `.env` and fill in the values from your Supabase
project (Project Settings → API):

```bash
cp .env.example .env
```

```
REACT_APP_SUPABASE_URL=your-supabase-project-url
REACT_APP_SUPABASE_ANON_KEY=your-supabase-publishable-key
```

`.env` is excluded via `.gitignore` and must never be committed — copy
it between machines by hand.

Both variables are read at **build time**. If either is missing the app
does not show an error: `supabaseClient.js` throws at import time, the
throw is constant-folded, and the whole app is dead-code-eliminated. You
get a **blank white page**, and `npm run build` still exits 0. If you
ever see a blank page, check `.env` first.

Do **not** add `DISABLE_ESLINT_PLUGIN=true`. It was in an earlier `.env`
and was hiding 14 real warnings, one of them a misplaced block of code
that would have thrown at runtime.

### 3. Run the development server

```bash
npm start
```

Opens the app at [http://localhost:3000](http://localhost:3000).

### 4. Build for production

```bash
npm run build
```

Deployed on Vercel from `main`. The same two environment variables must
be set in **Vercel → Settings → Environment Variables**; Vercel never
sees your local `.env`.

## Project Structure

```
src/
  assets/images/  Official portraits and page backgrounds
  components/     Navbar, Footer, Sidebar, ProtectedRoute
  constants/      Barangay facts, medicine categories, page content
  context/        AuthContext (Supabase auth + role state)
  dashboards/     OfficialDashboard, NurseDashboard, ResidentDashboard
  pages/          Public-facing pages (Home, Reservation, Officials, …)
  supabase/       Supabase client configuration
  utils/          Photo lookup, storage paths, clinic-hour parsing

supabase/functions/
  notify-reservation-sms — texts a resident when their court booking is
  approved or declined (IPROG SMS). Officials only; the request carries
  a reservation id, and every value in the message is read from that row.

supabase-migrations/
  14 numbered SQL files recording every schema, RLS and trigger change
  made to the hosted project.
```

`supabase-migrations/` is a **record, not a runner.** Editing a file
there changes nothing — migrations are applied by pasting them into the
Supabase SQL Editor. Each file's header states whether it has been
applied, when, and how it was verified.

## Design decisions

Things that look like omissions but are deliberate. Each one has fuller
reasoning in the relevant migration header.

- **ID upload is optional at signup.** Requiring one would exclude the
  residents most likely to need a Certificate of Indigency. They verify
  in person at the Barangay Hall instead.
- **Medicine stock is a status, not a quantity.** "Available / Low /
  Out of stock" is something a nurse can keep honest daily; a published
  count would require logging every tablet dispensed and would be wrong
  within hours.
- **The court is free, and the database has no money columns at all.**
  Ten fee-model columns were dropped in migration 006. "The system
  cannot charge you" is a stronger claim than "the system is configured
  not to charge you."
- **A registry match never auto-verifies an account.** It proves someone
  typed a name that exists, and in a barangay everyone knows their
  neighbours' names. The ID and the official settle identity.
- **Slots are held on submission, not on approval**, otherwise two
  people could book the same slot while the first sits unreviewed.
  Declining or cancelling frees the slot immediately.

## Security Notes

- Route protection (`ProtectedRoute`) only controls what the frontend
  renders. Actual access control is enforced by Supabase Row Level
  Security on every table and storage bucket, and by triggers where a
  rule applies to a *column* rather than a row — RLS cannot restrict
  columns.
- The Supabase key used here is a **publishable key**, designed to be
  exposed client-side. It is already readable in the deployed JavaScript
  bundle, so **the RLS policies are what protect the data, not the key.**
  Never put the `service_role` key in frontend code.
- Role-restricted actions are enforced twice: the dashboards hide
  controls the signed-in official has no right to use, and the policies
  reject the write regardless. Because RLS *filters rows* rather than
  raising an error, a blocked write returns success with zero rows — so
  the code checks that a row actually came back instead of assuming.
- Officials are linked to their auth account by matching `full_name`
  between `profiles` and `barangay_officials`. That string join is what
  the Treasurer and Secretary policies key on, so the two spellings must
  match exactly. **Renaming an official in one table but not the other
  silently removes their permissions, with no error anywhere.** Always
  update both.
- Storage: `id-verification` is private and read through short-lived
  signed URLs; `official-photos` and `resident-photos` are public images.
  All three are capped at 5 MB and restricted to JPEG, PNG and WebP.
  Two public buckets holding payment receipts and residency documents
  were deleted in September 2026 along with the fee model.

## Known gaps

- **Activity log entries can be forged.** Any signed-in user may insert
  a row with their own `actor_id` but arbitrary `actor_name` and
  `action` text. They cannot read the log back, but they can pollute it.
- **Leaked-password protection is unavailable** on the project's current
  Supabase plan, so password composition rules are used instead.
- **No automated tests** beyond a single smoke test. Schema and policy
  changes were verified by impersonating each role in SQL; the results
  are recorded in the migration headers.
- **The purok list** in `src/constants/barangay.js` was inferred from
  existing data and still needs confirming against the barangay's own
  records. A resident whose purok is missing cannot complete signup.
- **SMS notifications are built but dormant** — the Edge Function needs
  an `IPROG_SMS_API_TOKEN` secret before it will send anything.
