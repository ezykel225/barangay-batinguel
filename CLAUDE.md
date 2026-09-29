# Barangay Batinguel E-Services

Capstone project (CAPRES 2) — a web-based integrated system for Barangay
Batinguel, Dumaguete City, Negros Oriental.

Full title: *BARANGAY BATINGUEL E-SERVICES: A Web-Based Integrated System
for Barangay Services, Official Information, and Health Center Management.*

---

## Git workflow

**You do not merge. The repo owner does.** The whole point of the PR is
that he reads the diff before it lands — this is a capstone he has to
defend and understand, and a change that arrives already merged has
skipped the part that matters.

1. **`git pull` before starting.** Stale local code has looked like a bug
   more than once.
2. **Work on a feature branch** — `claude/<short-description>`.
3. **Never commit to `main` directly**, and never push to it.
4. Commit with a message saying what changed and why.
5. **Push the branch and open a PR.**
6. **Stop there.** He reviews and merges.

Do not merge your own PR. Not when the change is small, not when CI is
green, not when it is obviously correct — the review is not a quality
gate to be satisfied, it is how he learns what changed in his own
project.

---

## Tech stack

- **React 19.2.5** on **Create React App** (`react-scripts` **5.0.1**) —
  **not Vite.** Anything assuming Vite is wrong here: no
  `import.meta.env`, no `vite.config.js`, no `VITE_` prefixes. Env vars
  are `REACT_APP_*` and are read at **build** time.
- **React Router v6.28** (`react-router-dom`)
- **Supabase** — Postgres, Auth, Storage, Edge Functions
- `react-hot-toast` for notifications, `react-icons/fa` for icons
- Styling is hand-written CSS, one file per component

**Tailwind is configured but unused.** `tailwind.config.js` exists and
`src/index.css` has the `@tailwind` directives, but there is not a single
Tailwind utility class in the JSX — the apparent matches are all custom
class names containing the word "grid". It can be removed.

**Supabase project ref:** `mpcyqwasurhtdztzobwg`

### Commands

| Command | What it does |
|---|---|
| `npm start` | Dev server on :3000. Reads `.env` **only at startup** — restart after editing it. |
| `npm run build` | Production build into `build/`. Exits 0 even when the app is dead — see *Environment*. |
| `npm test` | Jest via react-scripts, watch mode. |

**There is no lint script and no typecheck script.** Don't reach for
`npm run lint` or `npm run typecheck` — they do not exist, and this is
plain JavaScript with no TypeScript anywhere, so there is nothing to
typecheck. The only lint signal is CRA's build-time ESLint warnings in
the terminal. That is exactly why `DISABLE_ESLINT_PLUGIN=true` is
banned below: it silences the one check this project has.

### Tests

One test exists — `src/App.test.js` renders `<App />` and asserts the
brand name appears. That is the entire suite. Schema and policy changes
were verified instead by impersonating each role in SQL, with the
results recorded in the migration headers.

**Tests need the Supabase env vars.** `supabaseClient.js` throws at
import time when they're missing; `App.test.js` imports `App`, which
imports the client. So a missing `.env` fails the test with a module
error that never mentions `.env`. If `npm test` fails on a fresh
checkout, check `.env` before debugging the test.

### Environment

Copy `.env.example` to `.env`. `.env` is gitignored; `.env.example` is
committed and documents what's needed.

```
REACT_APP_SUPABASE_URL=https://mpcyqwasurhtdztzobwg.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<publishable key from the dashboard>
```

Both are read at **build time**. `supabaseClient.js` throws at import
time if either is missing — and because almost everything imports it,
that surfaces as a **completely blank white page**, not a useful error.
Worse, `npm run build` still exits 0: the throw is constant-folded and
the whole app is dead-code-eliminated, so you ship an empty bundle with
no warning. A healthy build is ~180 kB gzipped; a dead one is ~90 kB.

If the app renders nothing, check `.env` first, and restart the dev
server — CRA only reads `.env` at startup.

The same two variables must be set in **Vercel → Settings → Environment
Variables**. Vercel never sees your local `.env`.

Do **not** add `DISABLE_ESLINT_PLUGIN=true`. It was in an earlier `.env`
and was hiding 14 real warnings, including a misplaced block of code
that would have thrown at runtime.

Do **not** run `npm audit fix --force`. Every reported vulnerability is
in `react-scripts` → `webpack-dev-server`, which never ships. `--force`
"fixes" them by installing `react-scripts@0.0.0`.

---

## Repository layout

```
src/
  App.js              All routing: 11 public routes, 3 role-protected
                      (/official, /nurse, /resident) wrapped in
                      ProtectedRoute, plus path="*" — see the note below.
  index.js            CRA entry point.
  index.css           Global CSS, plus the unused @tailwind directives.

  context/
    AuthContext.jsx   Supabase session + role for the whole app. Read the
                      getSession warning under Authentication first.

  components/
    Navbar.jsx        Public header.
    Footer.jsx        Public footer; contact details come from constants.
    Sidebar.jsx       Dashboard nav. Defines the tab lists for all three
                      roles: official (13), nurse (5), resident (4).
    ProtectedRoute    Role gate. Frontend only — RLS is the real control.

  pages/              Public routes: Home, Officials, HealthCenter,
                      Reservation, Login, ResidentSignup, ResetPassword,
                      Announcements(+Details), Events(+Details).
                      Reservation.jsx is the largest at ~950 lines.

  dashboards/         One component per role; each holds every tab's state
                      and its own data fetching.
    OfficialDashboard ~2,875 lines. The position gates live here.
    NurseDashboard    ~1,216 lines.
    ResidentDashboard ~1,136 lines.

  constants/
    barangay.js       Purok list, contact numbers, hall hours, nurse label.
    medicines.js      Medicine categories, forms, status vocabulary.
    about.js          Barangay history, profile, Batinguel Elementary.

  utils/
    officialPhotos    Maps barangay_officials.full_name -> portrait file.
    clinicHours.js    Parses the "8:00 AM" display strings.
    storagePath.js    Public URL -> storage object path.

  supabase/
    supabaseClient.js The single Supabase client. Throws at import time
                      when the env vars are missing.

  assets/images/      11 official portraits, page backgrounds, logo.

supabase-migrations/  17 numbered SQL files. A record, not a runner.
supabase/functions/   Edge Function source (notify-reservation-sms).
docs/                 SETUP.md, TESTING-WALKTHROUGH.pdf + its generator.
```

**`path="*"` renders `Home`, not a 404 page.** A mistyped URL therefore
looks like the homepage. Worth knowing before spending time on "why
does this bad route still work".

`supabase-migrations/` is a **record**, not a runner. Editing a file
there changes nothing — migrations are applied by pasting them into the
Supabase SQL Editor. "I edited the migration" and "the database changed"
are two separate steps, and forgetting the second is an easy mistake.

There is **no migration runner and no Supabase CLI workflow here** — no
`supabase db push`, no `supabase migration up`. A new file is applied by
hand in the SQL Editor (or via the Supabase connector), and its header
is then updated to record that it was applied, when, and how it was
verified. A file whose header does not say APPLIED has not run.

Each file's header records whether it has been applied, when, and how it
was verified. Those headers are the only place several non-obvious
decisions are written down; read them before changing anything nearby.

---

## Authentication and session handling

Supabase Auth, email + password, **email confirmation required**. See
*Signup flow* below for what that does to the first write after signup.

`AuthContext.jsx` is the single source of both the session and the role:
it subscribes to `onAuthStateChange`, and on each event fetches
`profiles.role` for the signed-in user. `ProtectedRoute` reads that
context to gate the three dashboard routes — **frontend only.** It
controls what renders, never what the database will allow; see *Security
model*. Roles are in *User roles* below, and the position-based
permissions that sit on top of them in *Role-specific permissions*.

### ⚠️ Never reintroduce `getSession()` alongside the subscription

`AuthContext` used to call `supabase.auth.getSession()` in a separate
`checkUser()` function **as well as** subscribing to
`onAuthStateChange`. That was the cause of the app-wide hangs and the
"Auth check timed out" errors.

`onAuthStateChange` already fires once immediately with the current
session the moment you subscribe — that is documented Supabase
behaviour. So the extra `getSession()` was a second, redundant request
racing the first for the same **browser-wide auth lock** on every page
load. And because `AuthProvider` wraps the whole app, every request
through the shared client queued behind that stuck lock — including
plain public table reads with no auth involved, like the Waste
Management schedule on the public homepage.

There must only ever be **one** of the two. The subscription is the one
that stays. Adding a `getSession()` call "just to be sure the session
loaded" reintroduces the bug, and it presents as unrelated public pages
hanging, which is nearly impossible to trace back.

The full reasoning is also in a comment in `AuthContext.jsx` — keep both
copies if you edit the file.

---

## User roles

Three roles, stored in `profiles.role`:

| Role | How created | Lands on |
|---|---|---|
| `official` | Manually by devs (service_role) | `/official` dashboard |
| `nurse` | Manually by devs (service_role) | `/nurse` dashboard |
| `resident` | Self-signup at `/signup` | `/` (Home) — **not** the dashboard |

There is no admin role — that was considered and dropped. But **ten old
policies across six tables still reference it**, as
`profiles.role = ANY (ARRAY['admin', ...])`: `announcements` (INSERT,
UPDATE), `events` (INSERT, UPDATE), `health_events` (INSERT, UPDATE),
`nurse_availability` (INSERT, UPDATE), `kapitan_status` (UPDATE) and
`kapitan_availability` (UPDATE).

The condition is dead — no row has `role = 'admin'`, so it never matches
and the `'official'`/`'nurse'` half does all the work. Harmless, but
worth knowing before someone assumes the role exists, and worth having
the full list if anyone ever cleans them up: an earlier version of this
file said "two policies on two tables", which would have left eight
behind while looking finished.

Residents deliberately land on Home after login, not their dashboard —
they're citizens browsing a public site who happen to have an account,
not staff logging into an internal tool.

### Role-specific permissions

Certain actions are restricted to a specific **position** (from
`barangay_officials.position`), not just to "any official":

- **Punong Barangay** — only they can change the Kapitan status
- **Barangay Treasurer** — only they approve/decline court reservations
- **Barangay Secretary** — only they approve/decline document requests
- **Any official** — verify/reject resident accounts, manage
  announcements, events, waste schedule, officials directory, registry

Officials who lack a given permission still **see** the data — the action
buttons are replaced with a "Treasurer only" note. Deliberate, for
transparency.

---

## ⚠️ Known fragility — read before renaming anyone

An official's login is linked to their directory record by **matching
`profiles.full_name` to `barangay_officials.full_name` as exact strings.**
There is no foreign key.

Rename an official in one table but not the other and they **silently
lose their role permissions**, with no error anywhere. The Treasurer
stops being able to approve reservations and nothing explains why.

**Always update both tables together.**

This has already bitten once in a different form: the officials' photo
map keyed on the same strings, and two officials silently showed a
fallback icon because the map said `Alexis Tan` while the directory said
`Alexis Theress P. Tan`. Fixed by keying the map on the exact directory
names — but the underlying fragility remains for permissions.

The proper fix is a `profile_id uuid references auth.users(id)` column on
`barangay_officials`, with all lookups switched to it. Not done — it
touches a lot of working code.

---

## Database notes

**17 migrations**, `001` through `017`, all applied.

**15 tables, RLS enabled on every one.**

| Table | Holds |
|---|---|
| `profiles` | One row per account — role, verification status, name parts, purok, contact |
| `reservations` | Covered court bookings. No money columns at all |
| `document_requests` | Document requests and their status |
| `announcements` | Public announcements |
| `events` | Public barangay events |
| `barangay_officials` | The officials directory, including `position`, which drives permissions |
| `residents_registry` | The barangay's own resident list — currently dummy data |
| `waste_schedule` | Collection days per purok |
| `activity_log` | Append-only audit trail. INSERT and SELECT policies only |
| `kapitan_status` | Whether the Punong Barangay is in |
| `kapitan_availability` | The Kapitan's weekly schedule |
| `nurse_availability` | Clinic hours per weekday, including the lunch break |
| `medical_programs` | Health centre programmes |
| `health_events` | Bakuna / health event calendar |
| `medicine_stock` | Medicine availability as a status, not a count |

What each migration *changed* stays in that migration's own header, not
here — this section says what exists now, the headers say how it got
that way and how it was verified.

### Security model

Security is enforced at the **database level** via Row Level Security and
triggers — not by hiding buttons. The publishable key ships inside the
JavaScript bundle by design, so anyone can call the Supabase API
directly. **The key is not what protects the data; the policies are.**

RLS controls *which rows* a caller may touch. It cannot restrict *which
columns*. Column-level rules need a trigger — that distinction is behind
several of the protections below.

**RLS filters rows; it does not raise.** A blocked UPDATE or DELETE
returns success with **zero rows affected**. Every write that RLS might
filter therefore calls `.select()` and checks a row actually came back,
rather than assuming success. Code that skips this reports a silent
failure as a save.

Key protections (all tested against the live database by impersonating
the relevant role in SQL):

- **`prevent_role_self_change`** (BEFORE UPDATE on `profiles`) — blocks a
  user changing their own `role`; blocks setting their own
  `verification_status` to anything but `pending`; blocks an
  `ineligible` account from reopening itself; and drops a **verified**
  account back to `pending` if its owner changes their own name.
- **`compose_full_name`** (BEFORE INSERT/UPDATE on `profiles`) — rebuilds
  `full_name` from the name parts. See *Trigger order* below.
- **`protect_reservation_status`** — an **allowlist**: a resident may
  write `resident_viewed_at`, and may cancel their own `pending` or
  `approved` booking if the date hasn't passed (Asia/Manila). Every other
  difference is rejected.
- **`protect_document_request_status`** — same shape:
  `resident_viewed_at` only.
- **`is_official(uuid)`** — SECURITY DEFINER helper. Exists because a
  policy that checks `profiles.role` by querying `profiles` causes
  **infinite recursion** in RLS. This actually happened and broke login
  for every user. Never check `profiles` from inside a `profiles` policy.
- **`activity_log`** has no UPDATE or DELETE policy on purpose, and
  since migration 015 its contents cannot be forged either. The
  `stamp_activity_actor` trigger takes `actor_id` and `actor_name` from
  the caller's own token and profile and discards whatever the client
  sent; `action` and `entity_type` are constrained to a fixed
  vocabulary; and a non-official may only record `cancelled` on a
  `reservation` that is their own. Before that, a resident could file
  entries reading "Barangay Secretary / verified / Someone Else".
  `subject` and `details` remain free text, but they hang off a
  truthful actor performing a real action.

  **Two gates, not one.** The CHECK constraints decide what words are
  permitted; the trigger decides who may say them. Migration 016 widened
  the vocabulary (14 actions, 11 entity types) and that alone changed
  nothing for the nurse, because the trigger refuses every non-official.
  Migration 017 added a narrow nurse branch: `added`/`edited`/`deleted`
  on `health_event`/`medicine`/`medical_program`, and nothing else. If a
  new log event is ever rejected, check both gates -- widening one
  without the other is the mistake 016 made on its own.

  **`is_official()` must not be made nurse-inclusive** to solve that
  kind of problem. It is used in eleven places including RLS policies on
  `residents_registry`, `waste_schedule` and `activity_log`'s own SELECT
  policy, so widening it would hand the nurse the residents registry,
  the waste schedule and read access to the whole audit trail. The nurse
  still cannot read `activity_log` at all -- she writes three entity
  types to a table she never sees.

  **Routine medicine stock changes are deliberately not logged.** Stock
  status changes daily by design; logging it would bury everything else.
  Only add/edit/delete of the medicine record itself is recorded. Kapitan
  status and nurse availability are excluded for the same reason.

**Allowlist, not denylist.** The protect triggers originally named the
*forbidden* columns, which fails open: anything unlisted was permitted,
and any column added later was unprotected by default. They now compare
`to_jsonb(NEW) - '<allowed>'` against the same for `OLD`. When
`activity_type` was added it was protected automatically, with no code
change.

**Admin bypass.** The protect triggers allow the update through when
`auth.role() IS NULL` — which happens only on a direct database
connection (SQL Editor, psql, a migration), never on an API request,
since PostgREST always sets a role claim. Without this, the first version
of the triggers locked the SQL Editor out of editing reservations
entirely, which you only discover when something is broken and you're
trying to fix it fast.

### ⚠️ Trigger order is load-bearing

Postgres fires same-timing triggers **in alphabetical order**, so
`trg_compose_full_name` runs before `trg_prevent_role_self_change`.

That is deliberate. When a resident edits only their first name the
client sends no `full_name` at all, so the guard would compare
`OLD.full_name` against itself, see no change, and leave a **verified
account verified under a new name**. Composing first means the guard sees
the real new value.

Rename either trigger and that breaks silently. See migration 011.

### Storage buckets

| Bucket | Public | Notes |
|---|---|---|
| `id-verification` | **no** | ID documents. Residents upload into a folder named after their own uid; officials read via short-lived signed URLs. |
| `official-photos` | yes | Official portraits shown on public pages |
| `resident-photos` | yes | Resident profile photos |

All three are capped at **5 MB** and restricted to **JPEG, PNG, WebP**.
HEIC is excluded on purpose: browsers cannot render it in an `<img>`, so
allowing it would mean an ID that uploads fine and then cannot be
displayed during review.

Every bucket has INSERT, SELECT, UPDATE **and DELETE** policies
(migration 009). Before that there was no DELETE policy at all, so
`storage.remove()` matched zero rows — the "Not a Resident" flow
promised to delete an applicant's ID and silently did not, and every
re-upload orphaned its predecessor.

`reservation-payments` and `residency-proofs` **no longer exist**. They
held GCash receipts and residency documents from the old fee model, were
flagged public with anonymous read *and write*, and were deleted on
2026-09-10.

Gotchas worth remembering:

- `getPublicUrl()` only works on buckets flagged `public = true`. A
  private bucket with a permissive RLS SELECT policy still 404s on that
  endpoint — use `createSignedUrl()`, as `id-verification` does.
- **Testing a storage policy is awkward.** Supabase's
  `protect_objects_delete` trigger rejects any DELETE issued over SQL and
  is *statement-level*, so it fires before row filtering and hides
  whatever RLS would have done. Set `storage.allow_delete_query = 'true'`
  inside a transaction first; that satisfies the trigger and leaves the
  policies as the only thing deciding. Roll back afterwards.

### Custom functions

- `get_reservation_slots(p_date date)` — held slots for one date
- `get_reservation_slots_range(p_start, p_end)` — a whole month in one
  call, powering the availability calendar (avoids ~30 requests per view)

Both return `preferred_time`, `duration_hours`, `status` and
`activity_type` — and nothing else. They are SECURITY DEFINER with `anon`
execute granted, so anonymous visitors can see availability **without**
being able to read `reservations`, which holds names, emails and phone
numbers. Whatever you add to those SELECT lists becomes public; a
category is safe, `purpose` or `full_name` would not be.

### Signup flow

This project **requires email confirmation**. `signUp()` returns a user
but **no session** until the email is confirmed — so any immediate
follow-up write fails RLS.

Handled by the `handle_new_resident_signup` trigger on `auth.users`,
which creates the profile row server-side from signup metadata. Don't go
back to a client-side profile insert right after signup; it breaks.

The trigger hardcodes `role = 'resident'` and only fires when the signup
metadata says so — signing up with `role: 'official'` in the metadata
creates no profile at all rather than an official.

**Custom SMTP is configured** (Gmail). Port **587**; a wrong port hangs
for exactly 10 seconds and returns `504 context deadline exceeded`,
which is how a transposed digit presented itself. Gmail is a development
configuration: ~500/day, and first messages often land in Spam. A
production deployment wants a transactional provider on the barangay's
own domain with SPF, DKIM and DMARC.

---

## Features

### Residents
- Self-signup with separate **first / middle / last / suffix** name
  fields and a **purok dropdown**, plus a residency declaration
- ID upload is **optional** — requiring one would exclude the residents
  who most need barangay documents (e.g. a Certificate of Indigency);
  they verify in person
- Document requests — blocked until the account is `verified`, enforced
  by RLS, not by hiding the button
- Court reservations with prefilled details
- Cancel their own **pending or approved** bookings for dates that
  haven't passed — this releases the slot immediately
- Correct their own name, contact number and purok (changing a verified
  name re-opens verification)
- Unseen-status-change badges; pickup reminders; profile photo

### Officials

Thirteen sidebar tabs, defined in `Sidebar.jsx` as `officialNavItems`:
Dashboard, Announcements, Events, Reservations, Document Requests, Waste
Management, Kapitan Status, Officials Directory, Residents, Residents
Registry, Reports, Activity Log, Settings.

Two of them carry more than their name suggests:

- Residents — verification queue with registry cross-reference, plus a
  permanent **Not a Resident** outcome that also deletes the uploaded ID
- Residents Registry — the barangay's own record. Currently **dummy
  data**; the real list wasn't available for a student project, which is
  also the right call under the Data Privacy Act.
- Reports, Activity Log

### Nurses
- **Medicine availability**, clinic availability with lunch break,
  medical programs, health events / bakuna calendar

---

## Account verification

Four states in `profiles.verification_status`:

| State | Meaning | Resident can reopen? |
|---|---|---|
| `pending` | Awaiting review | — |
| `verified` | Checked against an ID | — |
| `rejected` | Details wrong — fix and resubmit | **yes** |
| `ineligible` | Not a resident of this barangay | **no** — official only |

`rejected` was previously doing both jobs. Because a resident may reset
themselves to `pending` by design, someone from another barangay could
bounce back into the queue indefinitely. `ineligible` is terminal and
also deletes the uploaded ID — once someone is established not to be a
resident, RA 10173 gives no purpose for holding a photo of their
government ID.

**Nothing is ever deleted.** An official refused someone a government
service; that decision stays accountable. There is no DELETE policy on
`profiles` at all.

### The registry match is a signal, never a decision

`findRegistryMatch` compares names only (purok is shown for comparison
but deliberately not tested — a resident who moved purok is still a
resident). Exact hits show green, partial hits amber, and a missing name
shows a neutral grey "Not in registry" rather than a red warning.

**A match must never auto-verify.** It proves someone typed a name that
exists, and in a barangay everyone knows their neighbours' names —
auto-verifying would let anyone claim a neighbour's identity. Equally,
never add someone to the registry *in order to* verify them: that makes
the check circular while keeping its reassuring appearance.

---

## Court reservations

- **Free.** The database has **no money columns at all** — ten fee-model
  columns were dropped in migration 006. "The system cannot charge you"
  is a stronger claim than "the system is configured not to charge you."
- **Slots are held on submission** (`pending`), not on approval,
  otherwise two people could book the same slot while the first sits
  unreviewed. `declined` and `cancelled` free the slot automatically.
- **Overlaps are prevented by an exclusion constraint** (migration 010),
  not a unique index. A unique index on `(preferred_date,
  preferred_time)` only catches identical start times — an 8 AM booking
  for 2 hours and a 9 AM booking for 1 hour collide with different start
  times, and a unique index would pass that through while looking like
  it had worked. Error code `23P01`; the form translates it.
- **The court closes for lunch.** `11:00 AM` and `1:00 PM` are adjacent
  in the slot list but *not* consecutive hours. `SLOT_HOURS` and
  `getCoveredSlots()` handle this; don't index blindly. The exclusion
  constraint needs no special case — `[11,12)` and `[13,14)` don't
  intersect.
- `end_time` is the **end** of the booking (start + duration), not the
  start of its last slot. Rows created before 2026-09-04 have the old,
  wrong value.
- **`activity_type`** is a fixed category shown publicly on the
  availability calendar. The free-text `purpose` stays visible to
  officials only — residents write personal things in it ("birthday
  party for my daughter"), and that must not be published.
- **Anyone may create a booking**, signed in or not — a walk-in has no
  account. But migration 008 constrains what they may create: `pending`,
  unreviewed, and attached to their own account or to none. Before that,
  both INSERT policies were `WITH CHECK (true)` and an anonymous caller
  could insert a booking already marked `approved`.

---

## Health centre

**Medicine stock is a status, not a quantity** — Available / Low stock /
Out of stock. A published count is a promise; keeping one truthful means
recording every tablet dispensed, which is a pharmacy inventory system
and is wrong within hours of one missed entry. Three states are
something a nurse can keep honest at the end of each day. The public
page shows when the list was last updated, because stale stock
information is worse than none.

**Clinic hours store times as display strings** (`"8:00 AM"`), not
`time` values. `src/utils/clinicHours.js` parses them; it accepts either
that or 24-hour input and returns the input untouched when it isn't a
time at all. The function it replaced assumed 24-hour `HH:MM`, split
`"8:00 AM"` on the colon, read `"00 AM"` as the minutes and appended its
own suffix — producing **`8:00 AM AM`** on the live page for months.

**Two ways of being on break, deliberately.** `break_start`/`break_end`
are the scheduled one, and the page works it out from the Manila clock
so nobody has to press anything at noon. `on-break` as a status is the
unscheduled one. Automatic covers the predictable case; manual covers
the rest.

---

## Barangay constants

`src/constants/barangay.js` holds the purok list, contact numbers, hall
hours and the health nurse's label.

⚠️ **The purok list still needs confirming.** Puroks 1–6 were inferred
from data already present; 7 was added on the strength of "I think there
is one". A resident whose purok is missing **cannot sign up at all** —
the dropdown replaced a free-text box precisely so there is no "other"
to fall back on.

The nurse is labelled **"Barangay Health Nurse"**, a role rather than a
person. The system previously carried an invented name and a stock photo
of an unrelated person, both presented as barangay staff. Replace with
the real name and photo together when the barangay confirms them.

---

## Not built yet

- **SMS notifications — a deferred external-service dependency.** SMS
  notifications are implemented but require activation and configuration
  of the paid SMS service for production use. Core reservation
  operations are designed to continue successfully when SMS delivery is
  unavailable.

  `supabase/functions/notify-reservation-sms` is written, deployed and
  secured — officials only, and the message is built from the
  reservation row rather than the request body, so a caller can neither
  choose the recipient nor write the text. It needs an
  `IPROG_SMS_API_TOKEN` secret; until then it returns
  `{ sent: false, reason }` and the dashboard tells the official to
  phone the resident instead. **Never tested against the live
  provider** — the phone format (`639XXXXXXXXX`) and content type
  follow IPROG's docs, not an observed response.

  ⚠️ **SMS delivery is not part of the approval transaction, and must
  never be made part of it.** The toast reading *"Saved, but the text
  message could not be sent — please contact the resident directly"* is
  **expected** with no token configured, and is **not a defect.** The
  reservation status change and the Activity Log entry have already
  completed and been verified by the time any SMS code runs.

  Four separate things keep it that way. Do not undo any of them:

  1. `notifyResident()` is called only inside the success branch of
     `handleApproveReservation` / `handleDeclineReservation`, after the
     `.select()` readback has confirmed a row was written.
  2. It is **not awaited.** Never add `await` to it — that would let a
     slow or hanging provider stall the per-row processing lock.
  3. Every failure path inside it ends in `cannotReach()`, which warns
     to the console and raises a neutral `toast()`. It must never
     `throw`, become a `toast.error()`, or roll anything back.
  4. The Edge Function answers **200** with `{ sent: false, reason }`
     for every delivery problem. A delivery failure must never become a
     non-2xx.

  The correct fix for the warning is a provider token, not a code
  change. Do not silence the toast: an official who believes the
  resident was texted will not phone them, and the resident then hears
  nothing at all.

  **No re-send button exists, and that is deferred, not a defect.** The
  Edge Function was deliberately built to allow a re-send — any
  official may call it, and it requires the reservation to be `approved`
  or `declined` already, so a re-send can only ever repeat something
  true. But the dashboard never exposes it: `notifyResident()` has
  exactly two callers, both decision handlers. So decisions taken while
  SMS is inactive cannot be texted retroactively from the UI. That is a
  known gap to revisit **if and when** the service is activated, not a
  Phase 1 defect — and it is not a reason to remove or redesign any of
  the existing SMS implementation.
- **Broadcast SMS by age group** — discussed, not built. Blocked on
  `profiles` having no birthdate, and on cost: ~₱1/SMS against 13,000+
  residents.
- **Auto-expiry for stale pending reservations.** An abandoned request
  blocks its slot until an official declines it.
- **`profile_id` foreign key** replacing the `full_name` matching above.

## Known gaps

- **Leaked-password protection is Pro-only** on Supabase and cannot be
  enabled on this project. The dashboard toggle appears to turn on and
  the save is rejected — don't trust a screenshot of it.
- **Source maps ship to production** (~7 MB), so the original JSX is
  publicly reconstructable. `GENERATE_SOURCEMAP=false` in Vercel fixes it.
- **`public/logo.png` is 984 KB and referenced by nothing.**
- **No automated tests** beyond one smoke test, which fails without
  `.env` because `supabaseClient.js` throws at import time.
- **An InfinityFree deployment** may still be serving an old broken build.
- **No 404 page.** `path="*"` in `App.js` renders `Home`, so a mistyped
  URL looks like the homepage instead of reporting an error.
- **No lint script and no typecheck script**, and a single test — see
  *Commands* and *Tests* above.

---

## Working style

- This is a student capstone. Explain reasoning, don't just emit code.
- Verify against the actual Supabase schema before assuming a column,
  policy or constraint exists — several assumptions have been wrong.
- Be explicit about what's tested versus what's merely written.
- **Run both directions of a test.** A guard test that doesn't change
  the value it guards proves nothing: a no-op UPDATE passed a
  change-detection trigger and looked like a pass. A negative test can
  also fail for the wrong reason: `INSERT ... RETURNING` needs a SELECT
  policy, so an insert that was actually *allowed* reported as blocked.
  Always ask which step produced the result.
- **Run `get_advisors` after any migration that adds a function.** It
  caught a missing `search_path` within minutes.
- Flag bugs and security gaps found in passing, even when off-task.
