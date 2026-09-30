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

Two suites, 39 tests:

| File | What it covers |
|---|---|
| `src/App.test.js` | One smoke test — renders `<App />` and asserts the brand name appears |
| `src/utils/residentGroups.test.js` | 38 tests over the resident grouping, status vocabulary, search/filter, and the account ↔ voter-list cross-check — including the ones that hold "not on the voter list" at severity `expected` so a later edit cannot quietly promote ordinary residents into a list of problems |

Schema and policy changes are still verified by impersonating each role
in SQL, with the results recorded in the migration headers — not by
these tests.

**`App.test.js` needs the Supabase env vars.** `supabaseClient.js` throws
at import time when they're missing; `App.test.js` imports `App`, which
imports the client. So a missing `.env` fails that test with a module
error that never mentions `.env`. If `npm test` fails on a fresh
checkout, check `.env` before debugging the test.

`residentGroups.test.js` does **not** — `residentGroups.js` is pure, with
no Supabase import, which is the reason the resident workflow's rules
live there rather than inside the dashboard component.

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
    residentGroups    The resident workflow's rules: the status
                      vocabulary, the Requests/Residents/Not Residents
                      grouping, search/filter, purok validity and the
                      account-registry reconciliation checks. Pure, and
                      unit-tested. Shared by both dashboards so an
                      official and a resident cannot be shown different
                      words for the same stored state.

  supabase/
    supabaseClient.js The single Supabase client. Throws at import time
                      when the env vars are missing.

  assets/images/      11 official portraits, page backgrounds, logo.

supabase-migrations/  19 numbered SQL files. A record, not a runner.
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

**Migration 018 removed the worst half of this.** A partial unique index
allows at most one *active* official per `full_name`, so two active rows
can no longer share a name and break the `.single()` lookups. The
zero-match half remains: an official with no active directory row still
silently loses their position permissions, which is what the missing
Kagawad below actually was.

### The missing Kagawad, 2026-09-30

One official's directory row was found missing while her account still
existed. `display_order` 7 was an empty slot between 6 and 8, and
`activity_log` held **zero** rows with `entity_type = 'official'` — so the
removal never went through the UI and left no trace anywhere. Nothing
records who removed it, when, or why.

Restoring her needed one row inserted through the existing Add Official
flow and **no code change at all**: the RLS policies, the audit trigger,
the vocabulary and the photo mapping were already correct. The photo map
had carried her exact name since August, waiting for a row to attach to.

This is the concrete reason officials are now archived rather than
deleted, and it is worth citing whenever someone asks why the archive
exists.

---

## Officials archive

**Officials are archived, never permanently deleted.** Migration 018.

A row is archived iff `archived_at IS NOT NULL`. One column carries both
the state and the timestamp, so the two can never disagree.

| Behaviour | How |
|---|---|
| Archive | Leaves the current directory and the public page immediately. The photo is **not** deleted. |
| Restore | Returns every field and the photo exactly as stored. |
| Who / when | `archived_by` and `archived_at` are **stamped server-side** by `stamp_official_archive`; anything the client sends is discarded. |
| Permanent delete | **No button anywhere.** The DELETE policy matches only rows that are already archived, so an active official cannot be deleted in one step. |
| Position powers | Archiving **revokes** them: the Treasurer and Secretary policies now require `bo.archived_at IS NULL`. |
| Audit | `archived` / `restored` on `official`, with the optional reason in `details`. **No vocabulary migration was needed** — migration 016 reserved both values for exactly this. |

**Three things about the design that are easy to get wrong later:**

- **Frontend filtering is not the control.** The old SELECT policy was
  `USING (true)`, and the publishable key ships in the bundle, so a React
  filter would have hidden archived officials from the pages and from
  nobody else. The policy is now split: `anon`/resident/nurse see active
  rows only, officials see all. The `.is('archived_at', null)` filters in
  the four read paths are defence in depth on top of that, not instead of
  it.
- **The Treasurer/Secretary condition must be explicit.** Relying on the
  new SELECT policy to hide archived rows inside those subqueries does not
  work: for an authenticated official the policy grants the archived row,
  so the subquery would still find it. Deleting the row used to revoke
  those powers by accident; archive has to do it deliberately.
- **`display_order` is never renumbered.** Archiving leaves the gap;
  restoring into an occupied position **blocks** and asks for a free one
  rather than moving anybody. There is deliberately **no** unique index on
  active `display_order`: the Add form used to turn a blank field into `0`
  (`Number(x) || 0`, now validated instead), and swapping two officials'
  order needs a temporary value that a non-deferrable partial unique index
  makes impossible.

⚠️ **The self-archive guard is not a security boundary.** An official may
not archive their own record — blocked in the UI, and again in the
trigger. But the trigger compares `profiles.full_name` to the row's
`full_name`, the same string join documented above, so it **fails open**
on a mismatch. That is accepted: archiving yourself only *reduces* your
own privileges, so it is a foot-gun rather than an escalation path. Treat
it as mistake prevention and do not build anything on top of it.

⚠️ **Archived rows are not immutable in the database.** `archived_at` and
`archived_by` are protected by the trigger, but the other historical
fields are guarded only by the UI exposing no Edit control on archived
records. That is a deliberate Phase 3A boundary, not completeness. Full
immutability would need an allowlist trigger shaped like
`protect_reservation_status`, and it cannot simply block UPDATE on
archived rows — **restore is itself an UPDATE**.

---

## Previous term officials — schema only, nothing seeded

**Migration 019A created the structure and NOTHING ELSE.** Both tables hold
**zero rows**, there is **no Previous Term Officials frontend**, and 019B
has not started.

| Table | Holds |
|---|---|
| `barangay_terms` | one row per term: `label`, `start_year`/`end_year`, `status`, `is_current`, provenance |
| `barangay_term_members` | who served: `full_name`, `position`, `record_status`, `display_order` |

### ⚠️ This is NOT the officials archive, and must never be merged with it

Migration 018's archive means one specific thing: *this system archived
this record, and here is who did it and when.* A historical roster is not
that. Storing past terms in `barangay_officials` as archived rows would:

- offer **Restore buttons that can never work** — two members of the
  2018–2023 roster are also *current* officials, so restoring either would
  hit `23505` on `barangay_officials_one_active_per_name` every time;
- make the **audit trail contradict the UI** — ten "archived" officials
  with zero `archived` entries in `activity_log`;
- require **fabricating** `archived_at` and `archived_by` for people nobody
  archived.

So: separate tables, **no foreign key** to `barangay_officials`, no shared
column, and no policy on either side referencing the other.

### No name matching, anywhere

`barangay_term_members` stores names as plain text per term, with **no link
to `barangay_officials`, none to `profiles`, and none between terms.** The
only identity key this system has is the name string — the fragility above
— and matching on it gets all three interesting cases wrong:

| | |
|---|---|
| `Frankie Sia Credo` vs `Hon. Frankie Credo` | almost certainly one person; a matcher would **miss** it |
| `Catherine Lacson Tan` vs `Alexis Theress P. Tan` | different people sharing a surname **and** the office of Secretary; a matcher would **wrongly link** them |
| `Arnulfo Abol Catalan`, `Caroline Catan Amparado` | exact matches, the only ones a matcher would get right |

A roster that quietly asserts a false identity is worse than one that
asserts none. Consequence, all upside: archiving, restoring, renaming or
reordering a current official has **zero effect** on any historical roster.

### Read-only to application clients — two barriers, not one

| Barrier | Mechanism |
|---|---|
| **RLS** | enabled on both tables, **zero** write policies |
| **Privileges** | `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` **revoked** from `anon` and `authenticated` |

Supabase grants full DML on public tables by default, so the absent
policies alone would be the *only* thing stopping a write. Revoking as well
means a write is refused at the privilege layer first — verified: every
attempt, including as an official, returns **`42501`**, not RLS's silent
zero rows. If somebody later adds a permissive write policy by mistake, the
missing grant still blocks it.

**Seeding therefore happens from SQL only** (SQL Editor or the connector,
which connect as the table owner). There is deliberately **no in-app path**
to create, edit or delete historical terms — decided, not overlooked.

### Draft terms are invisible to the public at the RLS layer

`status` defaults to `'draft'`. A draft term is unreachable for `anon`,
residents and the nurse **at the database**, while officials see it — so a
roster can be entered and checked before the barangay confirms it.

The publishable key ships inside the bundle by design, so a React filter
would hide an unconfirmed roster from the page and **from nobody else**.
Verified both directions: draft → anon sees 0; confirm → anon sees it; back
to draft → 0 again.

**`term_is_confirmed(uuid)` is `SECURITY DEFINER` on purpose.** An inline
`EXISTS` subquery in the members policy would inherit the caller's view of
`barangay_terms`, so changing the term policies later would silently change
what members are visible — the exact coupling that would have let an
archived Treasurer keep approval rights in 018. It returns `false` for a
draft *and* for a non-existent id, so it reveals nothing about drafts.

### Recording what is not known, instead of guessing

Two constraints make uncertainty impossible to record silently:

- `term_members_name_matches_status` — a row cannot carry a name while
  claiming the holder is `unknown`, and cannot omit a name without saying
  so. **`full_name` is nullable only for `record_status = 'unknown'`.**
- `term_members_uncertainty_is_explained` — `partial` or `unknown`
  **requires** a `source_note`.

This is why the 2018–2023 Treasurer will be a row reading *"not
established"* rather than no row at all: an absent row cannot tell a reader
apart from "there was none", which is precisely what made the missing
Kagawad take an investigation to explain.

### Still unresolved, deliberately not seeded

- **SK Chairperson's middle name** — one source says `Danielle`, another
  `Daiella`. Neither chosen. Note that omitting it is *also* a version of
  the name, which is what `record_status = 'partial'` and a visible marker
  are for.
- **2018–2023 Barangay Treasurer** — not listed by either source. The post
  is *appointed*, not elected, so its absence from directory listings is
  expected and is **not** evidence the post was vacant.
- **The roster itself** — both sources are third-party directory sites that
  already disagree on one name. Nothing is seeded until the barangay
  confirms it.

### `display_order` is unique here, and not on `barangay_officials`

Opposite conclusions, for a real reason rather than inconsistency.
`barangay_officials` is edited one row at a time through a form, where
swapping two officials' order would collide midway and a partial unique
index cannot be `DEFERRABLE`. These tables are seeded and corrected by SQL,
where a reorder is one statement.

### `ON DELETE RESTRICT`, not `CASCADE`

Deleting a term with members **fails** (`23503`). Deleting the roster takes
two deliberate statements instead of one accidental one — the right default
for append-mostly historical data in a project that has already lost an
official's record without explanation.

### The current term

If it is ever represented here, add a `barangay_terms` row with
`is_current = true` and **no member rows**. `barangay_officials` stays the
single source of truth for who is serving; duplicating the serving roster
would give "who is serving now" two answers that can drift. 019A creates no
such row.

---

## Database notes

**19 migrations**, `001` through `019`, all applied.

**17 tables, RLS enabled on every one.**

| Table | Holds |
|---|---|
| `profiles` | One row per account — role, verification status, name parts, purok, contact |
| `reservations` | Covered court bookings. No money columns at all |
| `document_requests` | Document requests and their status |
| `announcements` | Public announcements |
| `events` | Public barangay events |
| `barangay_officials` | The officials directory, including `position`, which drives permissions, and `archived_at`/`archived_by` since migration 018 |
| `residents_registry` | **Voter reference records**, not a resident roll — see *What `residents_registry` actually holds* |
| `waste_schedule` | Collection days per purok |
| `activity_log` | Append-only audit trail. INSERT and SELECT policies only |
| `kapitan_status` | Whether the Punong Barangay is in |
| `kapitan_availability` | The Kapitan's weekly schedule |
| `nurse_availability` | Clinic hours per weekday, including the lunch break |
| `medical_programs` | Health centre programmes |
| `health_events` | Bakuna / health event calendar |
| `medicine_stock` | Medicine availability as a status, not a count |
| `barangay_terms` | One row per barangay term. **Empty** — schema only, migration 019A |
| `barangay_term_members` | Who served in a term. **Empty** — schema only, migration 019A |

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
- Their own account status shown on the dashboard in the same words the
  official sees, verified included — the warning banner appears only when
  something is wrong, so its absence was being left to mean "you are
  fine", which is not something a resident can be expected to infer

### Officials

Thirteen sidebar tabs, defined in `Sidebar.jsx` as `officialNavItems`:
Dashboard, Announcements, Events, Reservations, Document Requests, Waste
Management, Kapitan Status, Officials Directory, Residents, Voter
Reference List, Reports, Activity Log, Settings.

The tab **ids** are unchanged — the Voter Reference List is still
`registry` internally. That is the value `activeTab` is matched against,
not something anybody reads.

Several of them carry more than their name suggests:

- Residents — the verification queue, split into **Requests /
  Residents / Not Residents** (see *The three resident groups* below),
  with registry cross-reference, search and purok filter, the permanent
  **Not a Resident** outcome that also deletes the uploaded ID, and the
  **Account & registry reconciliation** panel
- Voter Reference List — the voter records the barangay has available.
  **Not a list of residents**, and the UI says so on the tab itself; see
  *What `residents_registry` actually holds*. Searchable by name, purok,
  household number and contact.
- Officials Directory — also holds the **Archived Officials** panel, which
  appears only once something has been archived. Archive replaced the old
  permanent Delete; see *Officials archive*.
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
`profiles` at all. Since migration 018 the same principle governs the
officials directory: officials are archived, not deleted — see *Officials
archive* above.

### ⚠️ What `residents_registry` actually holds

**It is not a list of everyone who lives in Barangay Batinguel. The
barangay does not have one.** The rows come from the **voter records the
barangay has available**, and it is still waiting for the city to release
a broader resident dataset. An earlier version of this file called it
"the barangay's own resident list — currently dummy data"; both halves
were wrong.

The distinction is not cosmetic. A table presented as *the residents
registry* invites exactly one wrong inference — that a resident missing
from it is a resident whose residency is in doubt — and the consequence of
that inference is an official refusing somebody a government document.
Anyone too young to vote, anyone registered in another barangay, and
anyone the city has not supplied yet is absent from it while being a
resident.

So the user-facing name is the **Voter Reference List** throughout:

| Stored / internal | Shown to users |
|---|---|
| `residents_registry` table, `registryEntries`, `findRegistryMatch` | Voter Reference List |
| sidebar tab id `registry` | "Voter Reference List" |
| `Registry Match` column | **Voter List Match** |
| exact hit badge | **✓ On voter list** |
| no hit | **Not on voter list** |
| `registry_entry` in `activity_log` | (never displayed) |

**Nothing internal was renamed.** The table, its columns and the
`registry_entry` audit vocabulary keep their names: changing them means a
migration plus an `activity_log` CHECK constraint change, for no gain a
reader would ever see. `VOTER_LIST_LABEL` and `VOTER_LIST_CAVEAT` in
`src/utils/residentGroups.js` hold the wording so three surfaces cannot
drift into saying three different things.

**Absence from the voter list has no effect on anything.** It never
causes `ineligible`, a rejection, a loss of verification, or
classification as Not a Resident; the three groups are still read purely
from `verification_status`. The "Mark as Not a Resident" dialog now says
so in as many words — its reason placeholder used to *offer* "not listed
in the residents registry" as a worked example, which was the single most
harmful string in the app.

### The voter list match is a signal, never a decision

`findRegistryMatch` compares names only (purok is shown for comparison
but deliberately not tested — a resident who moved purok is still a
resident). Exact hits show green, partial hits amber, and a missing name
shows a neutral grey "Not on voter list" rather than a red warning.

**A match must never auto-verify.** It proves someone typed a name that
exists, and in a barangay everyone knows their neighbours' names —
auto-verifying would let anyone claim a neighbour's identity. Equally,
**never add someone to the voter reference data *in order to* verify
them, or to clear a line from the cross-check panel**: that makes the
check circular while keeping its reassuring appearance.

### The three resident groups

The Residents tab groups accounts as **Requests**, **Residents** and
**Not Residents**. All three are derived from `verification_status` — the
column that already records the decision. **There is no second store and
no new column**, deliberately: a separate record of "is this person a
resident" would be a copy that can drift from the one the RLS policies
actually enforce.

| Group | Stored status | Means |
|---|---|---|
| Requests | `pending`, `rejected` | Still in verification — waiting for an official, or sent back to the resident to correct |
| Residents | `verified` | Checked against an ID. The only group that may request documents |
| Not Residents | `ineligible` | Established not to be a resident. Terminal; only an official can reopen it |

A status the app does not recognise lands in **Requests** and is listed
by the reconciliation panel. It must never be dropped from all three:
the group counts are how the totals are read, and an account missing from
every group makes them silently short.

`rejected` sits under Requests rather than with Not Residents on purpose.
It means *details wrong, fix and resubmit* — the resident may return
themselves to `pending` — so filing it beside the terminal outcome would
misrepresent it as a refusal.

**The UI labels describe the stored states; they do not rename them.**
`src/utils/residentGroups.js` holds one vocabulary used by both the
Official Dashboard and the Resident Portal, and each badge carries its
raw stored value in its tooltip. `rejected` and `ineligible` used to
share one red badge and differ only by the word inside it — one is
resubmittable, the other permanent, so they now read and look different.

### Account ↔ voter list cross-check (D6)

The Residents tab carries an **Account & voter list cross-check** panel:
deterministic checks over data already fetched, rendered as findings.

**Three severities, and the third is the point.** `warning` means two
records contradict each other or a name is ambiguous. `notice` means
untidy data. **`expected` means it is not a problem at all** — that level
exists solely so *verified residents not on the voter reference list*,
which is the ordinary case, is reported without being filed under
problems. The panel counts the two groups separately ("2 to look at · 4
for information") so a screen of expected rows cannot read as a backlog,
and `residentGroups.test.js` asserts the severity and the ordering, so a
later edit cannot quietly promote it.

**It is detection only.** Nothing on it merges records, rewrites a name,
creates or deletes an account, or edits a registry entry — there are no
actions on the panel at all. It is rendered even when it finds nothing,
because a panel that is absent cannot be told apart from one that is
broken; that was the mistake in migration 018's first Archived Officials
cut.

The checks, in the order they are shown — contradictions first, the
expected case last:

| Check | Severity |
|---|---|
| `ineligible` account whose name *is* on the voter list | `warning` |
| Duplicate names within resident accounts | `warning` |
| Duplicate names within the voter reference data | `warning` |
| Unrecognised `verification_status` | `warning` |
| Purok blank or off the barangay's list — accounts, then voter entries | `notice` |
| **Verified residents not on the voter reference list** | **`expected`** |

Two limits that are load-bearing:

- **Exact normalised name equality only** — trim, collapse inner
  whitespace, lowercase, shared with `findRegistryMatch` so a badge
  reading "in registry" can never sit beside a panel counting the same
  account as missing. The *partial* (substring) branch of the badge is
  deliberately **not** used here: it is a prompt to look closer, and a
  near-match presented as a finding would assert that two different
  people are one.
- **A missing optional field is never a finding.** An uploaded ID is
  optional by design, so "verified with no ID on file" is not listed —
  it describes the intended flow for someone verified in person.
- **The expected finding must never be "fixed" by editing data.** The
  correct response to a verified resident who is not a registered voter
  is nothing at all. Adding them to the voter reference data to shorten
  the list would corrupt the one dataset the barangay actually has.

⚠️ **There is no deterministic link between an account and a voter
reference entry.** `profiles` holds no reference to the voter data,
`residents_registry` holds none to `profiles` (`added_by` is the official
who typed it), and `profiles.system_id` is null on every resident
account. The name string is all there is. So this panel informs an official; it never concludes.
Resolving the class properly needs the `profile_id` foreign key still
listed under *Not built yet* — a schema change, which is why the panel
was built without one.

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

**Every resident-facing purok field now offers this list**, not a text
box: signup, the resident's own details, the court reservation form
(which anonymous walk-ins use, and which was the last way a new spelling
could still reach the database) and the officials' Add/Edit Registry
Entry form. The waste schedule form is still free text — it is a
schedule, not a resident record, and was left out of that change
deliberately rather than overlooked.

**Existing stored values are never rewritten.** A record already holding
an off-list spelling keeps it, shown as an extra selected option so
opening a form to change a phone number cannot silently blank it, and
flagged "not on the list" wherever it is displayed. Correcting one is a
deliberate choice made with the resident — a bulk normalisation would
need its own approval, since the system cannot know whether 'purol 5'
meant Purok 5.

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
- **Reservation hours and the exception workflow — PR #23, recorded not
  built.** The covered court is normally reservable **5:00 PM – 10:00
  PM** only, because it is made available for bookings after office
  hours. The barangay may allow an office-hours booking depending on the
  event — the examples given were ayuda/distribution activities,
  health-related activities, city or government activities, and anything
  else officials judge should be accommodated.

  ⚠️ **Those examples are not automatic approval categories, and must not
  be built as ones.** Officials keep discretion, because whether an event
  can be accommodated depends on the day and on which Kagawads are
  available. So PR #23 is a **controlled exception workflow** — a request
  outside 5–10 PM is something an official decides on, with the reason
  recorded — not a rule that simply opens office hours to everyone who
  picks the right category from a dropdown.

  **Nothing in the reservation schedule changed in PR #21.** `timeSlots`
  and `SLOT_HOURS` still offer 8 AM – 5 PM exactly as before; only the
  purok field on that form was touched.
- **`profile_id` foreign key** replacing the `full_name` matching above.
- **019B — the Previous Term Officials roster and its UI.** Migration 019A
  created the tables; both are **empty**, and there is **no frontend**. 019B
  seeds the confirmed roster from SQL and adds the read-only Official Portal
  panel and the collapsed public section. Blocked on the barangay confirming
  the roster, the SK Chairperson's middle name and the 2018–2023 Treasurer.

## Known gaps

- **Leaked-password protection is Pro-only** on Supabase and cannot be
  enabled on this project. The dashboard toggle appears to turn on and
  the save is rejected — don't trust a screenshot of it.
- **Source maps ship to production** (~7 MB), so the original JSX is
  publicly reconstructable. `GENERATE_SOURCEMAP=false` in Vercel fixes it.
- **`public/logo.png` is 984 KB and referenced by nothing.**
- **Thin automated test coverage.** 39 tests in two suites: one smoke
  test over `<App />`, which fails without `.env` because
  `supabaseClient.js` throws at import time, and 38 pure unit tests over
  the resident workflow rules. No component, integration or end-to-end
  tests, and no test touches the database.
- **An InfinityFree deployment** may still be serving an old broken build.
- **No 404 page.** `path="*"` in `App.js` renders `Home`, so a mistyped
  URL looks like the homepage instead of reporting an error.
- **No lint script and no typecheck script** — see *Commands* and
  *Tests* above.

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
