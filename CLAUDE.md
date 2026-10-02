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

Twenty-nine suites, 627 tests:

| File | What it covers |
|---|---|
| `src/App.test.js` | One smoke test — renders `<App />` and asserts the brand name appears |
| `src/utils/residentGroups.test.js` | 38 tests over the resident grouping, status vocabulary, search/filter, and the account ↔ voter-list cross-check — including the ones that hold "not on the voter list" at severity `expected` so a later edit cannot quietly promote ordinary residents into a list of problems |
| `src/utils/displayLabels.test.js` | 30 tests over the shared status labels, the upcoming-event count, the Activity Log vocabulary, the Manila-vs-UTC date boundary (with fake timers), and a guard that this module never re-acquires a second verification vocabulary |
| `src/components/ActionMenu.test.js` | 30 tests: 13 over the ⋮ menu's keyboard, Escape and focus-restore behaviour — the parts nobody catches by clicking — then 5 over `portal` (the popup leaves the clipping wrapper for `<body>` while the trigger stays in its row, and the whole keyboard contract survives the move), 5 over **authorization** (an action the caller may not perform is **absent from `items`**, not rendered disabled, so a menu cannot widen what a role can reach), and 7 over `subject`, which are what makes the one-word labels safe: the item reads "Edit" on screen and is **announced** "Edit Anti-Dengue Cleanup Drive". Run **both directions** — with the composition removed, **4 of the 7 fail**; the other three pass trivially because they cover the trigger's name and the no-subject caller |
| `src/components/ConfirmDialog.test.js` | 4 tests over the shared confirmation hook. The load-bearing one: a second `confirm()` opened while the first is still showing used to leave the first promise **permanently pending**, hanging its handler with no write and no error. Latent while every caller was an official clicking one row at a time; reachable the moment the resident portal's blocking `window.confirm` calls became asynchronous. Verified both directions — the test fails with the fix removed |
| `src/utils/monthGrid.test.js` | 26 tests over the date-only arithmetic and the month grid: leap February, month-length refusal (`2026-02-30` is not a date and must not slide to March), December/January wrap, and the rule that **nothing in that module constructs a `Date` from a date string** |
| `src/components/MonthCalendar.test.js` | 19 tests over the shared grid as rendered: the accessible name of every day, navigation naming the month it goes to, and that today and selection are carried by `aria-current` / `aria-pressed` rather than by colour |
| `src/utils/reservationCalendar.test.js` | 22 tests over court occupancy. The load-bearing one: `declined` and `cancelled` do **not** make a date look occupied |
| `src/utils/notificationLabels.test.js` | 33 tests over the notification wording. The load-bearing ones walk **migration 022's whole `event` CHECK vocabulary** and assert every value produces a title with no underscore in it — so widening the migration without touching this module fails in Jest rather than printing `ready_for_pickup` on screen. Also a guard that this module **defines no status map of its own** |
| `src/components/NotificationBell.test.js` | 24 tests over the bell: the unread count in the accessible name **as words**, Escape and focus restore, click-outside closing *without* stealing focus back, mark-read-then-navigate ordering, and that unread is carried by a class **and** the spoken word "New" rather than by colour |
| `src/components/useModalA11y.test.js` | 9 tests over Escape, focus entry and focus restoration for the seventeen hand-rolled modals. Run **both directions**: with the hook stubbed, 4 of 9 fail. Includes the case where the opener is removed by the save the modal performed — focusing a detached node silently sends focus to `<body>` |
| `src/components/Navbar.test.js` | 6 tests over the public mobile menu button, which had **no accessible name at all** before X3: the name changes with state, `aria-expanded` tracks it, and `aria-controls` points at an id that exists |
| `src/utils/eventCalendar.test.js` | 24 tests over event placement and the upcoming split. The load-bearing one: the homepage filters **then** limits, plus 6 over `eventTimeLabel`: the `HH:MM:SS` a `time` column really returns, and that anything which is not a time — a location beginning with one included — yields `''` rather than being printed |
| `src/utils/documentFilter.test.js` | 16 tests over `filterDocumentRequests` — the status narrowing, the five searched fields, and that an unknown status yields nothing rather than everything |
| `src/utils/reservationWindow.test.js` | 46 tests over the 5–10 PM window, the per-slot and per-kind durations, the noon-spanning exception and the office-hours exception — deliberately mirroring the SQL cases in migration 020's header, so client and database are asserted to agree rather than each checked alone. The load-bearing one is that an exception is read from `exception_reason` and never from the hour |

| `src/utils/reservationSteps.test.js` | 18 tests over which step of the booking flow owns which field. The load-bearing pair: the two field sets are **disjoint**, and together they cover every value `create_court_reservation` requires — so nobody choosing a date can be told their NAME is missing, and no required field can reach the RPC blank |
| `src/utils/reservationTracking.test.js` | 19 tests over the public tracking page. The load-bearing one asserts **no message it can produce mentions "not found", "no such" or "invalid reference"** — an answer distinguishing a wrong reference from a wrong number is an oracle for guessing references. Plus a source-reading guard that the module defines no status word of its own |
| `src/utils/returnTo.test.js` | 39 tests over the `?next=` allowlist, **26 of them attack strings** that have each defeated a redirect sanitiser written by inspection — `//evil.example`, `/\evil.example`, `https:/evil.example`, `javascript:`, `data:`, a `user:pass@` trick, a double-encoded payload. All fall back to `/` |
| `src/utils/signupSteps.test.js` | 23 tests over the sign-up rules. The load-bearing ones: step 1 reports nothing about the password, the two advisory password checks **stay advisory** (a long passphrase with no digit is accepted), and `MIN_PASSWORD_LENGTH` can never drop below Supabase's own minimum |
| `src/utils/officialPhotos.test.js` | 26 tests over the portrait map, `portraitWillBeLost` and `PersonAvatar`. `hasBundledPhoto` uses `hasOwnProperty`, asserted — a bare lookup reports a portrait for an official named `toString`. Six are the **2026-10-01 regression guard**: the eleven canonical keys written out in full, that the erroneous rename is not a key, and that no middle name the barangay spells out is abbreviated to an initial. Run **both directions** — re-keying the portrait to `Lastimoso` fails 4, and "tidying" it to `Jeffrey F. Duran` fails 4 |
| `src/utils/clinicSchedule.test.js` | 29 tests over the clinic week, built from the **live rows including Friday's two**. Friday is ONE entry carrying both stored sessions in `sessions`, and `displaySessions` presents them as one 8-to-5 span because **both rows record the 12-1 break that exactly fills the gap**. The load-bearing pair runs the other direction: a two-session day whose gap no recorded break covers is **not** joined, and neither is one whose break only partly fills it |
| `src/utils/medicineFilter.test.js` | 28 tests over the public medicine list — the three narrowings, an unrecognised category or status matching **nothing rather than everything**, that the counts always sum to the total, and 8 over `isCategoryOpen`. The load-bearing one there: **while a filter is applied every rendered group is open**, including one the reader had collapsed — `filterMedicines` has already dropped the non-matches, so a collapsed group would hide a medicine the page has just counted as a result |
| `src/utils/homeSections.test.js` | 19 tests over the Home page's two summaries: the announcement excerpt (a very-long-body regression guard, the word boundary, the unbreakable token) and `nextCollection`, whose load-bearing one is that it returns **null rather than a guess** when no row carries a weekday name, and counts the rows it left out |
| `src/pages/Announcements.test.js` | 8 tests over the browse page, the FIRST suite that renders a page component. The load-bearing pair: the card shows an excerpt and `/announcements/:id` still renders the whole 2,159-character notice, from the same row. Also that each card is ONE link with no nested anchor |
| `src/pages/Events.test.js` | 14 tests over the Calendar \| List switcher, the list card and date selection. The load-bearing one: a card shows a time **only when `event_time` holds one** — it is NULL on every live row — and never digs one out of `location`, which on three legacy rows begins with a time somebody typed. Two more assert no heading level is skipped in either view |
| `src/pages/EventDetails.test.js` | 8 tests over the detail page's Time row: shown with a time, **gone — label and all — for null, empty, whitespace and a missing column**, with the location left exactly as stored even when it begins with a time. Run **both directions**: with the condition removed, 5 of 8 fail |
| `src/utils/officialAvailability.test.js` | 24 tests over per-official consultation hours. The load-bearing one **reads `026_official_availability.sql`** and asserts the four statuses the form offers are exactly the four the CHECK accepts — the same thing `reservationWindow.test.js` does for migration 020 |
| `src/components/EServicesMenu.test.js` | 15 tests over the E-Services dropdown and the catalogue: the disclosure pattern, Escape and focus restore, that it does **not** use `role="menu"`, and that every service states its access requirement in words |
| `src/utils/residentTabs.test.js` | 7 tests over `?tab=` resolution — a hint, never authorization |

Schema and policy changes are still verified by impersonating each role
in SQL, with the results recorded in the migration headers — not by
these tests.

**`App.test.js` needs the Supabase env vars.** `supabaseClient.js` throws
at import time when they're missing; `App.test.js` imports `App`, which
imports the client. So a missing `.env` fails that test with a module
error that never mentions `.env`. If `npm test` fails on a fresh
checkout, check `.env` before debugging the test.

⚠️ **`Announcements.test.js` and `Events.test.js` render page
components that DO import the client, and still do not need `.env`.**
They `jest.mock('../supabase/supabaseClient')`, which is hoisted above
the imports, so the real module -- and its import-time throw -- never
runs. Navbar and Footer are stubbed in both, because Navbar pulls in
`AuthContext` and standing that up would be testing the chrome, which
has its own suites. Verified by renaming `.env` and running both: 20
passed. That is the pattern for any future page-level suite.

The other suites do **not** need it. `residentGroups.js`,
`displayLabels.js`, `reservationWindow.js`, `monthGrid.js`,
`reservationCalendar.js`, `eventCalendar.js`, `notificationLabels.js`,
`ActionMenu.jsx`, `MonthCalendar.jsx`, `NotificationBell.jsx` and
`ConfirmDialog.jsx` have no Supabase import, which is the reason the resident workflow's rules, the
label vocabulary and the booking window live in modules rather than
inside the dashboard components.

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
  App.js              All routing: 14 public routes, 3 role-protected
                      (/official, /nurse, /resident) wrapped in
                      ProtectedRoute, plus path="*" — see the note below.
  index.js            CRA entry point.
  index.css           Global CSS, plus the unused @tailwind directives.

  context/
    AuthContext.jsx   Supabase session + role for the whole app. Read the
                      getSession warning under Authentication first.

  components/
    Navbar.jsx        Public header.
    Footer.jsx        Public footer. Contact details AND the office
                      hours come from constants/barangay.js -- the hours
                      used to be a second hard-coded copy that said
                      "8:00 AM - 5:00 PM" straight through and omitted
                      the lunch closure the Home page states.
    Sidebar.jsx       Dashboard nav. Defines the tab lists for all three
                      roles: official (12), nurse (5), resident (4).
                      Official was 13 until the Punong Barangay Status
                      tab was folded into the overview -- see *The
                      compact Punong Barangay status*.
                      Also renders the MOBILE DASHBOARD HEADER -- brand,
                      notification bell, menu button -- for all three
                      portals; see *Responsive layout (X2)*.
    ProtectedRoute    Role gate. Frontend only — RLS is the real control.
    NotificationBell  The bell and its panel. Resident and Official
                      portals only -- there is deliberately no nurse
                      bell. Takes its data as props, no Supabase import.
    useNotifications  Fetching for the bell, and the one definition of
                      unread the sidebar badges also read.
    ActionMenu        The ⋮ overflow menu. Six places now, not one --
                      `portal` lifted the clipping constraint. Items read
                      one word ("Edit"); `subject` puts the row back into
                      every accessible name. Read the header before
                      putting it anywhere else: the PRIMARY-DECISION rule
                      still stands.
    MonthCalendar     THE month grid. One generic component behind four
                      calendars; owns the grid, navigation, today,
                      selection and accessibility, and NO business
                      logic -- callers pass `renderDay`.

  pages/              Public routes: Home, Officials, HealthCenter,
                      Reservation, Login, ResidentSignup, ResetPassword,
                      Announcements(+Details), Events(+Details).
                      Reservation.jsx is the largest at ~1,160 lines.

  dashboards/         One component per role; each holds every tab's state
                      and its own data fetching.
    OfficialDashboard ~4,920 lines. The position gates live here.
    NurseDashboard    ~1,674 lines.
    ResidentDashboard ~1,303 lines.

  constants/
    barangay.js       Purok list, contact numbers, hall hours, nurse label.
    medicines.js      Medicine categories, forms, status vocabulary.
    about.js          Barangay history, profile, Batinguel Elementary.

  utils/
    officialPhotos    Maps barangay_officials.full_name -> portrait file.
    clinicHours.js    Parses the "8:00 AM" display strings.
    clinicSchedule    The clinic week as it is READ. One entry per
                      weekday; `displaySessions` joins two sessions into
                      one span ONLY when a break recorded on that day's
                      own rows exactly fills the gap -- which is why
                      Friday's two live rows read as one 8-to-5 day. The
                      database still holds both; `sessions` still reports
                      both. Pure.
    medicineFilter    Narrows and counts the public medicine list, and
                      owns `isCategoryOpen` -- the collapse default
                      (first group open) and the rule that a FILTER
                      opens every rendered group, because every row left
                      is a match. Pure.
    homeSections      The two Home summaries: `announcementExcerpt` (the
                      card's text only -- the stored description is
                      untouched) and `nextCollection`, which returns
                      NULL rather than a guess when no waste row carries
                      a weekday name. Pure.
    storagePath.js    Public URL -> storage object path.
    displayLabels     Stored status -> the words users read: document
                      requests, reservations, availability. Also the
                      upcoming-event count. It does NOT own account
                      verification -- see below.
    monthGrid         Date-only arithmetic and the month grid. ⚠️ Nothing
                      in it constructs a Date from a date string -- that
                      is the whole point. See *Calendars* below.
    notificationLabels The words a notification shows. Borrows every
                      status word from the module that already owns it
                      and defines none of its own -- see Notifications.
                      Pure and unit-tested.
    reservationCalendar Court occupancy for the calendar: which statuses
                      hold a slot, and how a day is toned. Pure.
    eventCalendar     Event placement, and `upcomingEvents`, which
                      filters before it limits. Pure.
    reservationWindow The covered court's booking window: the start-time
                      list, the 5-10 PM rule, the per-kind duration caps,
                      what hours a booking occupies (coveredHours, which
                      mirrors the database's int4range and runs through
                      noon), and what counts as an office-hours
                      exception. Pure and unit-tested. Shared by the
                      booking form, the Official queue and the Resident
                      portal.
    residentGroups    The resident workflow's rules: the status
                      vocabulary, the Requests/Residents/Not Residents
                      grouping, search/filter, purok validity and the
                      account-registry reconciliation checks. Pure, and
                      unit-tested. Shared by both dashboards so an
                      official and a resident cannot be shown different
                      words for the same stored state. Also holds
                      `filterDocumentRequests`, which reuses the same
                      `filterRows` normalisation so two tabs' searches
                      cannot drift apart.

  supabase/
    supabaseClient.js The single Supabase client. Throws at import time
                      when the env vars are missing.

  assets/images/      11 official portraits, page backgrounds, logo.

supabase-migrations/  21 numbered SQL files. A record, not a runner.
supabase/functions/   Edge Function source (notify-reservation-sms).
docs/                 SETUP.md, TESTING-WALKTHROUGH.pdf + its generator.
```

### ⚠️ The mobile table-to-card block converts rows, not the table

`Sidebar.css`'s protected responsive block sets `tr { display: block }` and
`td { display: flex }` at 768px and below, but leaves the `<table>` and
`<tbody>` as table boxes. A table box is sized by its contents' **minimum**
width, and one unbreakable value -- a long email address -- sets that
floor. So the cards kept a ~485px floor at every viewport width and
`.table-wrapper`'s `overflow-x: auto` scrolled them sideways: at 375px,
184px of every card sat off-screen, and because the layout is label-left /
value-right, the hidden part was the **value**.

It read as "the cards clip their values". The cause was the table box, not
the cells. `display: block` on the table and tbody, appended after the
protected block, removes the floor; `min-width: 0` and
`overflow-wrap: anywhere` on the cell let a long word wrap instead of
pushing the card wide; and below 480px each value stacks under its label.
Measured at 320/360/375/390/414/480/600/768: card width now equals the
available width at every one.

**Anything appended after that block must stay at equal or lower
specificity.** `.dashboard-table td:last-child` (0,2,1) in the protected
block outranks `.dashboard-table td` (0,1,1), which is why the action cell
keeps its own column layout and 8px gap while every other cell takes the
2px stack.

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

**27 migrations**, `001` through `027`, all applied. ⚠️ 027 is a
DATA CORRECTION, not a schema change — see *The portrait is lost by the
RENAME* under *Public E-Services (X5)*.

**20 tables, RLS enabled on every one.**

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
| `official_availability` | Weekly consultation hours per elected official. Migration 026. **Empty** — only an official can enter their own |
| `notifications` | In-app notifications. **Client-read-only** — written only by triggers; see *Notifications* |
| `notification_reads` | Who has seen which notification. Insert and select only |

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

### ⚠️ A GENERATED column breaks an allowlist trigger — migration 023

**Migration 020's `slot_hour` silently broke two resident rights, and
023 fixes it.** This is the second time the same Postgres fact has cost
this project something.

`slot_hour` is `GENERATED ALWAYS`, and **generated values are computed
*after* before-triggers run**. CLAUDE.md already recorded that for the
INSERT case — it is why `enforce_reservation_window()` calls
`reservation_slot_hour()` instead of reading `NEW.slot_hour`. The same
fact breaks `protect_reservation_status` (BEFORE UPDATE), and that was
missed: inside the trigger `NEW.slot_hour` is **NULL** while
`OLD.slot_hour` holds the stored value, so the allowlist comparison saw
a column it had not been told to ignore and **every** resident UPDATE
looked like an attempt to change something forbidden.

Measured directly by attaching a probe trigger that printed the
differing keys:

```
status=cancelled/was:pending   slot_hour=NULL/was:17
```

Measured as `authenticated`, before 023:

| Resident action | Result |
|---|---|
| Cancel their own pending booking | `P0001` "You can only cancel this reservation, not change its details." |
| Write `resident_viewed_at` | `P0001` "Only an official can change a reservation." |

Both are documented resident rights. The second is the quieter half:
`resident_viewed_at` is what cleared the unseen badge, so **the badge
could never be cleared either**. This affected every booking created
since 020 — which, since 020 constrained `preferred_time`, is all of
them.

`protect_document_request_status` is unaffected: that table has no
generated column, and `reservations.slot_hour` is the **only** generated
column in the schema.

⚠️ **Subtracting `slot_hour` is not a denylist entry.** It is
`GENERATED ALWAYS`, so Postgres itself refuses any client attempt to
write it (`428C9`) before the trigger is reached — verified — and its
value is a pure function of `preferred_time`, which the allowlist still
protects. Excluding a column nobody can write, derived from one still
guarded, leaves the guarantee intact. Both directions re-verified: the
two broken paths work, and self-approval, cancel-plus-edit,
cancel-plus-change-duration, cancelling somebody else's and cancelling a
past date are all still refused.

**Any future generated column on a table with a `protect_*` trigger
needs the same treatment**, and will present exactly like this: a
documented user action refused with the trigger's own message, for every
row, with nothing in the diff to explain it.

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
- A notification bell and sidebar badges, both reading **one**
  definition of unread (migration 022's read marks, not
  `resident_viewed_at`); pickup reminders; profile photo
- Their own account status shown on the dashboard in the same words the
  official sees, verified included — the warning banner appears only when
  something is wrong, so its absence was being left to mean "you are
  fine", which is not something a resident can be expected to infer

### Officials

**Twelve** sidebar tabs, defined in `Sidebar.jsx` as `officialNavItems`:
Dashboard, Announcements, Events, Reservations, Document Requests, Waste
Management, Officials Directory, Residents, Voter Reference List,
Reports, Activity Log, Settings.

It was thirteen until **Punong Barangay Status** was folded into the
Dashboard overview — see *The compact Punong Barangay status* below.
Nothing about the feature was removed; it stopped being a destination.

The remaining tab **ids** are unchanged — the Voter Reference List is
still `registry` internally. Those are the values `activeTab` is matched
against, not something anybody reads. ⚠️ **`isKapitan`, the
`kapitan_status` table, `kapitan_availability` and every `.kapitan-*`
class keep their names**, exactly as *One word per thing* records; only
the nav entry is gone.

**Two tabs carry sidebar badges**, from data the dashboard already
fetched: Document Requests shows requests at `pending`, and Residents
shows accounts at `pending`. Both count only what is waiting on an
official — `rejected` is an account already dealt with and returned to
the resident, so it is in the Requests group but not in the badge, and a
line under that group's heading says so. There is no read-state and no
new column; each successful action refetches its list and the badge
drops on its own.

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
- Events — `Table | Calendar`, with **Edit Event** alongside Add and
  Delete since 2026-10-01
- Announcements — **Edit Announcement** alongside Add and Delete since
  2026-10-01; no migration was needed, see *Official Portal workflow
  adjustments (post-X3)*
- Document Requests — search and a status filter over state the tab
  already holds, with **two different empty states**; same section
- Reservations — `Queue | Calendar`; see *Calendars*
- Dashboard — carries the **compact Punong Barangay status** that
  replaced the tab of that name; same section
- Reports, Activity Log

### Nurses
- **Medicine availability**, clinic availability with lunch break,
  medical programs, health events
- Health Events — `Table | Calendar`, with **Edit Health Event**
  alongside Add and Delete since 2026-10-01. Her dashboard's
  "Bakuna Calendar" card was a three-row list and is now
  **Upcoming Health Events**; see *Calendars*

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

### Who owns a status label

Two modules, and the split is deliberate:

| Module | Owns |
|---|---|
| `residentGroups.js` | `profiles.verification_status` — the wording **and** the Requests / Residents / Not Residents grouping, so the two cannot drift apart |
| `displayLabels.js` | `document_requests.status`, `reservations.status`, and the availability vocabulary shared by `nurse_availability` and `kapitan_availability` |

`displayLabels.js` used to be **dead** — written ahead of the phases that
would need it, imported by nothing, and by the time those phases arrived
the wording had been settled elsewhere. So it sat in the repo holding a
*second* vocabulary for statuses the app was already rendering:
`verified` as "Resident", `rejected` as "Needs correction". Neither
shipped. Those maps are gone, and `displayLabels.test.js` asserts they
stay gone — re-adding them would give one status two answers again.

⚠️ **No raw database value is shown to a user.** The Official Dashboard
used to print `pending` and, through a regex, `ready for pickup` in the
same table where the resident portal read "Pending Review" and "Ready for
Pickup". Both now read from one map.

The **Activity Log tab was the last place this rule was not wired up**,
and it was found by the X1 wording inspection rather than by anybody
looking at the screen. It rendered `entry.action.replace(/_/g, ' ')` and
the same for `entity_type`, so an official read "ready for pickup",
"marked ineligible", "resident account" and "medical program" straight
from the table. `ACTIVITY_ACTION_LABELS` and `ACTIVITY_ENTITY_LABELS` in
`displayLabels.js` now cover all 14 actions and 11 entity types.

Two things about those maps:

- **An unknown value is returned exactly as stored** — not blank, not
  guessed. The audit trail is the one surface where a word nobody
  anticipated must stay visible, and the vocabulary is widened by
  migration (015, 016, 017) more often than this file is edited. A test
  walks `activityLog.js`'s own `ACTIONS` and `ENTITY_TYPES`, so widening
  one without the other now fails in Jest rather than on screen.
- **`registry_entry` was the latent half.** It would have rendered as
  "registry entry" — the term the Voter Reference List naming exists to
  keep off the screen, and the one this file's own table says is "never
  displayed". No such row exists yet, so it had never been seen. It now
  reads "Voter reference entry", asserted by a test. Three related defects were fixed
with it: `badge-cancelled` was generated from the status string and
defined in no stylesheet, so a cancelled booking rendered as an unstyled
pill; the nurse's weekly schedule coloured everything that was not
`available` red, presenting a lunch break and a scheduled field day as
faults; and a card labelled "Upcoming Events" counted every event ever
created.

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

## Notifications

**In-app only.** Migration 022. There is **no browser push, no Web
Push, no service worker, no VAPID, and no notification email**, and no
new SMS — the existing `notify-reservation-sms` Edge Function is
untouched and unrelated.

Two tables:

| Table | Holds |
|---|---|
| `notifications` | What happened, and who it is addressed to |
| `notification_reads` | Who has seen which one. `(notification_id, user_id)` |

### ⚠️ Clients never write a notification

`notifications` has a SELECT policy and **no INSERT, UPDATE or DELETE
policy at all**, and `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` are
**revoked** from `anon` and `authenticated` — 019A's two-barrier
pattern, so a forged notification is refused at the privilege layer
(`42501`) before RLS is consulted. Verified. Rows are written only by
three `SECURITY DEFINER` triggers, on `document_requests`,
`reservations` and `profiles`.

### Audience is resolved at READ time, never fanned out

A queue notification stores `audience = 'secretary'` and no
`recipient_id`. **Who that is gets decided when somebody reads it**, by
`can_see_audience()` against the live directory.

The alternative — one row per official, written at decision time — would
have to resolve the position through the
`profiles.full_name = barangay_officials.full_name` string join *at that
moment* and freeze the answer. A newly appointed Secretary would never
see the backlog and an archived one would keep receiving it. Resolving
at read time means **archiving an official revokes their queue the same
instant it revokes their position powers** (018). Verified: an archived
Treasurer loses the treasurer queue and keeps only what any official
sees.

`can_see_audience` is `SECURITY DEFINER` for the reason
`term_is_confirmed` is — an inline `EXISTS` would inherit the caller's
own view of `profiles` and `barangay_officials`, so changing those
policies later would silently change which notifications are visible.
**It returns `false` for `'resident'`**: a resident notification is
reached by `recipient_id`, never by audience.

### The event matrix

| Source | Event | Goes to |
|---|---|---|
| `document_requests` INSERT at `pending` | `submitted` | **Secretary** |
| `document_requests` → `approved` / `declined` / `ready_for_pickup` / `claimed` | that status | the **requesting resident** |
| `reservations` INSERT at `pending` | `submitted` | **Treasurer** |
| `reservations` → `approved` / `declined` | that status | the **booking resident** |
| `profiles` INSERT or → `pending` (resident) | `submitted` | **any official** |
| `profiles` → `verified` / `rejected` / `ineligible` | that status | the **account owner** |

- **A walk-in booking notifies nobody downstream.** `resident_id IS
  NULL` is supported by design (008), so there is no account to tell —
  the Treasurer still gets the queue item. Verified.
- **`cancelled` is not announced.** The only parties who can reach it
  are the resident themselves and a direct database connection.
- **Self-actions produce nothing.** A resident cancelling their own
  booking, or resetting their own account to `pending`, is not told what
  they just did. Verified: 0 notifications.
- **An office-hours exception is flagged *inside* the Treasurer's one
  notification** (`is_exception`), not sent as a second one.
- **No person's name is ever stored in a notification.** A queue item
  says a request is waiting, not whose. The name is already in the
  source table the official reads, and copying it here would duplicate
  resident PII into a second place where it could also go stale.
  `subject` holds a **raw stored value** — a document type verbatim, or
  a reservation date as `YYYY-MM-DD` — and the client formats it.

### ⚠️ Duplicate prevention is the transition guard, and nothing else

**There is no unique index on `notifications`, and one must not be
added.** Two were tried and both silently destroyed real notifications.

The design review proposed `UNIQUE(audience, recipient_id, entity_type,
entity_id, event)`. That asserts an entity produces each event at most
once *ever*, which this system contradicts by design: `rejected` is
resubmittable and a resident may return their own account to `pending`,
so an account can legitimately cycle
`pending → rejected → pending → rejected → pending`.

022 then tried to rescue the idea with the same columns **plus
`source_changed_at`** (`statement_timestamp()`), `NULLS NOT DISTINCT`,
on the theory that two notifications collide only if they came from the
same statement. **That failed on the first probe.**
`statement_timestamp()` is per *statement*, not per row change, so five
genuine transitions sent as one multi-statement batch all shared it:

| | expected | measured |
|---|---|---|
| `officials` / `submitted` | 3 | **1** |
| `resident` / `rejected` | 2 | **1** |
| `resident` / `verified` | 1 | 1 |

Four real notifications vanished, and the only trace was three
`23505` lines in the Postgres log from the trigger's own
`RAISE WARNING`. So duplicate prevention is:

```sql
IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
```

It **cannot** suppress a genuine later cycle, because it only ever
compares one row change against itself, and it covers every duplicate
that can actually happen at runtime: a no-op write, an UPDATE of other
columns, a double-clicked Approve, and two officials deciding
concurrently (the second waits on the row lock and **re-reads** the row,
so its `OLD` already carries the new status). Re-verified after the
index was dropped: 3 / 2 / 1, and two no-op writes added nothing.

`source_changed_at` survives as a **diagnostic column only**, and is
commented as such in the database.

### ⚠️ A notification must never roll back the decision it announces

An exception raised in an AFTER trigger aborts the whole statement, so
each trigger body is wrapped in its own exception block ending in
`RAISE WARNING`. Verified in both directions: with every notification
insert forced to fail, the document request still reached `claimed` and
zero notifications were written; with the forcing removed, one was.

The warning reaches the Postgres log and names the trigger, the entity,
`SQLERRM` and `SQLSTATE`. **That log is the only reason the bad unique
index above was diagnosable** — a swallowed exception with no signal is
invisible.

This is the same boundary the SMS Edge Function draws by answering 200
with `{ sent: false, reason }`: telling somebody is not part of
deciding. **`stamp_notification_read` is the deliberate exception — it
raises**, because a read mark is not a business operation to protect.

### Read marks verify visibility, they do not merely stamp

`trg_stamp_notification_read` takes `user_id` from the caller's own
token and **discards whatever the client sent** (015's pattern), and
then refuses a mark against a notification the caller cannot see. The
INSERT policy carries the same check through
`notification_is_visible()`, which is the single authority both use — so
"I can read it" and "I may mark it read" cannot drift apart.

`user_id = auth.uid()` **alone would not be enough**: it would let a
signed-in user mark any notification id as read, which is a write
against a row they cannot see and also confirms the id exists.

Verified as an authenticated resident: forging a notification `42501`;
marking their own read, accepted; marking one they cannot see,
refused; marking their own **as another user**, the forged `user_id` is
*overwritten* with theirs; deleting a read mark `42501`. There is no
UPDATE and no DELETE policy — a read mark is not un-made.

### One definition of unread

**The resident's sidebar badges now read the notification read-state**,
keyed by each notification's own `link_tab`, so the badge counts and
the bell count are the same number from the same rows.

They previously counted rows whose `resident_viewed_at` was older than
their `updated_at`, which answers a different question — it marks a
**row** as seen, so a request going
`approved → ready_for_pickup → claimed` could only ever remember the
last of the three. `resident_viewed_at` **stays in the schema and is
still written**; it just no longer feeds a badge.

⚠️ **The official sidebar badges are deliberately NOT repointed.** They
count what is still *waiting* — document requests at `pending`,
accounts at `pending` — which is not the same as "have you seen it". An
official who has read a notification still has the work to do, so a
badge driven by read state would clear while the queue stayed full.

### The bell

`NotificationBell.jsx`, shared by the **Resident and Official portals
only**. It takes its data as props and has **no Supabase import** — the
fetching is in `useNotifications.js` — which is why it has unit tests
that run without the env vars.

- The unread count is in the accessible name **as words**
  ("Notifications, 3 unread"), not only as a number in a coloured
  circle.
- **Unread is three cues, not one**: a left bar, a bolder title, and the
  word "New" in the accessible name. The tint is the least of them.
- Escape closes and returns focus to the bell. A click outside closes
  **without** stealing focus back — the person is clicking elsewhere on
  purpose, the same rule `ActionMenu` follows.
- The empty state says `No notifications yet.` A panel that renders
  nothing cannot be told apart from one that is broken.
- Below 600px the panel becomes a sheet pinned to both edges, at
  `z-index: 1100` so it covers `Sidebar.css`'s fixed
  `.mobile-menu-button` (`z-index: 1050`) rather than being punched
  through by it.
- `.dashboard-topbar` lives in `NotificationBell.css`, **not** in
  `Sidebar.css`, so nothing is appended after that file's protected
  block.

⚠️ **There is no nurse bell**, and that is a decision. Her work —
medicine stock, clinic hours, health events — has no asynchronous
decision waiting on anybody else, so a bell would be permanently empty.
Adding one needs a nurse audience in migration 022 first.

⚠️ **`link_tab` is a hint, not authorization.** It names the dashboard
tab that answers the notification; RLS still decides what that tab may
load, exactly as when it is reached from the sidebar. Navigation is
through the existing `activeTab` state — **no new routes**.

### Wording comes from the modules that already own it

`src/utils/notificationLabels.js` **defines no status vocabulary of its
own**, and a test asserts it. The `event` values *are* the stored status
values they came from, so the outcome word is looked up in the same map
the badge on the row uses:

| Events | Read from |
|---|---|
| `approved` `declined` `ready_for_pickup` `claimed` | `DOCUMENT_STATUS_LABELS` |
| `approved` `declined` (reservations) | `RESERVATION_STATUS_LABELS` |
| `verified` `rejected` `ineligible` | `residentGroups.VERIFICATION_STATES` |

A resident gets `residentLabel`, an official gets `label` — the
distinction `residentGroups` already draws.

⚠️ **It reads those maps directly rather than calling
`documentStatusLabel()` / `reservationStatusLabel()`.** Those two
deliberately **return an unknown value unchanged**, which is right for
the Activity Log — the audit trail is the one surface where an
unanticipated word must stay visible — and wrong here, where the
passthrough would print `ready_for_pickup` on screen. An unrecognised
event falls back to the heading alone. A test walks all 8 events across
all 3 categories and asserts no title contains an underscore.

`submitted` is the only event this module names itself, because no table
stores it — it means "this arrived and nobody has dealt with it yet".

### Deferred, deliberately

- **Realtime.** `supabase_realtime` still publishes **zero tables** and
  022 did not change that. The bell refreshes on tab change, which is
  the moment the reader is asking to see that part of the dashboard
  anyway. **There is no polling loop** — a repeating request against the
  shared client is how the `getSession()` lock problem presented.
- **Retention.** History is kept indefinitely; there is no pruning job,
  no cron and no archival. A production deployment wants a retention
  policy. This is a capstone dataset.
- **Push of any kind**, per the scope above.

---

## Court reservations

- **Reservable 5:00 PM – 10:00 PM, up to 4 hours** (migrations 020 and
  021). The court is made available for booking after office hours, so
  the window describes when the **facility** is open: a booking must
  **finish** by 10:00 PM, not merely start before it. The latest
  ordinary start for a full four hours is 6:00 PM, and 9:00 PM offers one
  hour only. Both the window and the 4-hour maximum are enforced in the
  database, not only in the form. `src/utils/reservationWindow.js` holds this for the client;
  `reservation_slot_hour()` and `enforce_reservation_window()` hold it in
  the database. See *The office-hours exception* below.
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
- **There is no 12:00 NN start time**, so `11:00 AM` and `1:00 PM` are
  adjacent in the slot list while being two hours apart on the clock.
  That is about what can be *stored* in `preferred_time` — it is **not**
  a closure a booking has to stop for. A span runs straight through
  noon; see *Noon is not a closure for an exception* below. Never walk
  the label list to work out what a booking occupies; use
  `coveredHours()`.
- **The Official Portal has a court calendar** since 2026-10-01 —
  `Queue | Calendar`, Queue the default. See *Calendars* below.
- `end_time` is the **end** of the booking (start + duration), not the
  start of its last slot — and it is a **display string the client
  computes and sends**, never derived or validated server-side. The
  authoritative extent is always `slot_hour + duration_hours`, which is
  what the exclusion constraint uses; `end_time` is what the Resident
  portal prints. Measured 2026-10-01: of 21 stored rows, **6 hold NULL
  and 9 hold the old off-by-one value** (the start of the last slot), all
  of them created on or before 2026-08-19. Every row created from
  2026-09-04 onward is correct, so the form is not still producing them
  — but nothing stops a crafted API call from storing any string here.
- **`activity_type`** is a fixed category shown publicly on the
  availability calendar. The free-text `purpose` stays visible to
  officials only — residents write personal things in it ("birthday
  party for my daughter"), and that must not be published.
- **Anyone may create a booking**, signed in or not — a walk-in has no
  account. But migration 008 constrains what they may create: `pending`,
  unreviewed, and attached to their own account or to none. Before that,
  both INSERT policies were `WITH CHECK (true)` and an anonymous caller
  could insert a booking already marked `approved`.

### The office-hours exception

A booking that starts **before 5:00 PM** is an exception the barangay
decides one at a time. It is not reachable by scrolling: the booking form
offers the evening slots, and the daytime slots appear only after the
resident deliberately opens *Request an exception*, which also requires a
free-text `exception_reason`.

⚠️ **The activity categories are descriptions, not approval rules.**
Migration 020 added *Ayuda / Distribution*, *Health Activity* and *City /
Government Activity* to `activity_type`'s vocabulary because those are
the kinds of thing the barangay described. **Nothing anywhere reads
`activity_type` to decide anything**, and nothing should — whether an
event can be accommodated depends on the day and on which officials are
available. An official decides every exception, and the Treasurer-only
approval gate is untouched.

The daytime slot range (8 AM – 4 PM) is **inherited system behaviour** —
the hours this app has always offered — not a documented statement of the
barangay's office hours. User-facing wording says "office hours" without
claiming a span.

| | |
|---|---|
| Client | `reservationWindow.js`; the form refuses a daytime slot with no reason and a duration that does not fit. Ordinary bookings up to 4 hours, exceptions up to 8, both still ending by 10:00 PM |
| Database | `enforce_reservation_window()`, BEFORE INSERT. Rejects an unknown time, an end past 10:00 PM, a daytime start with no reason, an evening start that **carries** one, and — since migration 021 — an ordinary booking longer than 4 hours |
| Official Portal | an `Office-hours exception` badge on the row, the reason under the purpose, and an *exceptions only* checkbox beside the status filter |
| Resident Portal | a pending exception reads *"Office-hours request — awaiting barangay decision"* rather than plain "Pending" |

⚠️ **An exception is identified by `exception_reason`, never by the
hour.** All 21 bookings that existed before migration 020 start before
5 PM and carry no reason, because that was the ordinary path under the
old rule. Classifying by hour would badge the entire history as
exception requests and bury the real ones. `isExceptionRequest()` is the
single predicate, and `reservationWindow.test.js` asserts it.

⚠️ **`exception_reason` is deliberately NOT in `get_reservation_slots` or
`get_reservation_slots_range`.** Those two are SECURITY DEFINER with
`anon` execute, so whatever they select becomes public; the reason is
free text a resident wrote about their own activity, and belongs with
`purpose` — officials only.

**Why a BEFORE INSERT trigger and not a CHECK constraint.** A CHECK is
revalidated on **every UPDATE**, so a window CHECK would have made
approve, decline and cancel fail on all 21 legacy daytime rows — the
history would have become uneditable. The trigger fires on INSERT only,
so it governs new bookings and leaves the record alone. Verified: all
three transitions still succeed on a legacy row.

⚠️ **`NEW.slot_hour` is NULL inside a BEFORE trigger.** `slot_hour` is a
`GENERATED ALWAYS` column, and generated values are computed *after*
before-triggers run. Reading it in the guard would have compared NULL
against everything and passed every check silently. The guard calls
`reservation_slot_hour(NEW.preferred_time)` — the same IMMUTABLE helper
the generation expression uses — instead.

**The hour map exists twice, by necessity**: `SLOT_HOURS` in
`reservationWindow.js` and `reservation_slot_hour()` in migration 020. A
client constant cannot cross into the database. If they drift, an
unrecognised label yields a NULL `slot_hour` and the overlap
constraint's partial `WHERE` silently stops covering those rows — which
is also the pre-existing hole migration 020 closed: `preferred_time` had
no constraint at all, so `'9:30 PM'` inserted fine and was invisible to
the overlap guard.

### Noon is not a closure for an exception

**The barangay's decision, 2026-09-30: an office-hours exception MAY run
continuously across 12 NN – 1 PM.** An ayuda or distribution activity can
take most or all of the day, so the lunch closure does not apply to the
exception workflow. There is **no database rule prohibiting a
noon-spanning exception, and none is to be added.**

The lunch gap was never enforced by the database at all — the exclusion
constraint has always used `int4range(slot_hour, slot_hour + hours)`,
which is continuous. Verified: against a 10 AM / 4-hour exception, the
constraint refuses an 11:00 AM booking **and** a 1:00 PM one, so overlap
protection covers every hour of a long span, noon included.

⚠️ **So a booking's extent is computed in HOURS, never by walking the
slot-label list.** `coveredHours()` in `reservationWindow.js` is the
single source of it and mirrors that range exactly. The old walk stopped
dead at the 11 AM / 1 PM label gap, which was not only the superseded
rule but **already misreported a shape of booking that exists in the
data**: an approved 10:00 AM / 3-hour row occupies hours 10, 11 and 12
in the exclusion constraint, while the walk returned two labels — so the
booking form's live *"Ends At"* preview for that shape read 12:00 PM
instead of 1:00 PM, and the public slot grid marked only two of the three
occupied hours as held. (That row's **stored** `end_time` is correct, at
`1:00 PM`; the defect was in what the client computed, not in what the
database holds.)

### Duration: 4 hours ordinary, 8 for an exception

**Both limits are enforced in the database, and each number lives in
exactly one place.**

| Limit | Where it lives | What refuses it |
|---|---|---|
| Ordinary ≤ 4 hours | `enforce_reservation_window()`, **migration 021** | `P0001` with a sentence a resident can read |
| Exception ≤ 8 hours | `reservations_duration_hours_check`, which has read `duration_hours BETWEEN 1 AND 8` since the table was created | `23514`, the raw constraint |
| Everything ends by 10:00 PM | `enforce_reservation_window()`, migration 020 | `P0001` |

**Migration 021 exists because the 4-hour limit used to be client-only.**
Verified before it: a 5:00 PM / 5-hour booking with no reason was
**accepted** over the API. The publishable key ships inside the bundle,
so "the form does not offer it" was never a control — the same argument
migration 018 made about hiding archived officials with a React filter.
Verified after it, as `authenticated` **and** as `anon`: refused.

⚠️ **021 deliberately does not restate the 8.** Repeating that ceiling
inside the guard would give one rule two homes that can drift, so the
exception branch says nothing about duration and the CHECK is the only
place the number appears. The consequence to know: a 9-hour exception
fails as a bare `23514` rather than a sentence, so **the form must never
offer a 9th hour** — `reservationWindow.test.js` asserts it does not.

⚠️ **A refusal proves nothing until you know which step produced it.**
5:00 PM / 8h is refused by the **10:00 PM rule**, not by the cap — 5 PM
plus 8 is 1 AM. The case that isolates the cap is 5:00 PM / **5h**: it
ends at 10:00 PM exactly, so only the cap can refuse it. Both the
migration header and the tests use that case for exactly this reason.

Going past 8 (a full 8 AM – 10 PM day is 14) means altering the CHECK.
**Not done, and not wanted at this time** — decided 2026-10-01.

⚠️ **A 12:00 NN start is refused, not stored.**
`reservation_slot_hour()` has no `'12:00 PM'` case, so the guard rejects
it (`P0001`, unknown time) rather than writing a row whose NULL
`slot_hour` would escape the overlap constraint's partial `WHERE`.
**Noon is a coverable hour, not a startable one** — which is correct for
blocking (any span reaching noon also holds 11 AM, and that is the cell a
resident sees) but means a resident cannot pick noon as a start time.
Making it startable means adding the mapping in a migration. **Decided
against at this time**, 2026-10-01.

**Why 021 is a trigger branch and not a CHECK**, for the same reason as
020: `duration_hours <= 4 OR exception_reason IS NOT NULL` as a
constraint would be revalidated on every UPDATE, so any pre-existing
evening row longer than 4 hours would become un-approvable and
un-cancellable. There is no such row (all 21 stored rows are daytime,
durations 1–4), but the trigger does not depend on that staying true.

---

## Wording and UI consistency (X1)

A full-application wording inspection, 2026-10-01. The conventions it
established, so they are not re-litigated:

| | |
|---|---|
| Nav labels, table headers, field labels, standing action buttons | Title Case |
| Confirmation-dialog titles, messages and buttons | sentence case |
| Status badges | `displayLabels.js` decides; document statuses are Title Case because that wording already shipped |
| Spelling | **US** — `Health Center`, `Program`, `Grayed`, `Unrecognized` |
| Empty states | `No X yet.` when nothing exists, `No X match this filter.` / `this search` when one is applied |
| Add buttons | `Add <Thing>` |
| Loading labels | three dots, `Saving...`, not `…` |
| Quotes in user-facing strings | straight, not curly |
| Page headings | match the navigation item that leads to them |

**Headings match the nav.** The Official Portal had invented headings —
*Administrative Hub*, *Community Voice*, *Facility Booking Queue*,
*Leadership Directory* — so a user clicked **Reservations** and landed on
a page titled something else. A dashboard tab may name its portal
("Official Dashboard", "Health Center Dashboard"); every other tab takes
the nav item's own words.

**`end_time`, `Filed` and the toast punctuation were deliberately left
alone.** `Filed` stays in the reservations table: eleven columns need the
width, and the three other tables' `Submitted` is the inconsistency the
project accepts. The app has 81 toasts ending in `!` and 77 in `.`;
rewriting all of them is churn for nothing, so new and directly-edited
messages take the full stop and the rest stay.

⚠️ **Two things that are NOT typography and must not be "tidied" back.**

- **`System ID` and `Security Key` were wrong, not just formal.**
  `profiles.system_id` is a real column and is **null on every resident
  account**, so the login form named something the account does not
  have, above a placeholder that already said "email". The fields are
  `Email` and `Password`, matching signup, Settings and the reset page.
  The state variables are still `systemId` / `securityKey` — renaming
  them buys nothing a user sees.
- **The Voter Reference List delete dialog said "the barangay's own
  resident record".** The exact framing the rename exists to remove. See
  *What `residents_registry` actually holds*.

**`window.confirm` is now gone from the application.** The resident
portal's last two — cancelling a booking, and changing a verified name —
use the shared `useConfirm`, so a resident gets the same focus trap,
Escape handling, Enter-defaults-to-Cancel and `aria-modal` as an
official. Two details worth keeping:

- Cancelling a booking sets `cancelLabel: 'Keep booking'`. The default
  pair reads "Cancel" beside "Cancel booking", which is unreadable when
  the action itself is called cancelling.
- ⚠️ **The conversion exposed a real bug in `useConfirm`**, now fixed
  and tested: a second `confirm()` while one was open overwrote the
  resolver, so the first promise never settled and its handler hung for
  the rest of the session — no write, no error, nothing on screen. It
  was latent for the Official and Nurse portals, whose buttons disable
  per row rather than across rows; `window.confirm` blocked the page, so
  the resident portal could not hit it until now. An abandoned question
  settles **`false`**: a question nobody saw must never come back true,
  because true is the answer that causes a write.
- The name-change dialog passes **`destructive: false`** (the dialog
  defaults to `true`) and says *"Awaiting review"*, the approved
  resident-facing wording for `pending`. The native dialog it replaced
  printed the raw stored value.

### ⚠️ The UTC date bug, fixed in two places

`OfficialDashboard`'s events filter and `NurseDashboard`'s health-events
filter classified upcoming vs past with
`new Date().toISOString().slice(0, 10)` — the **UTC** date. Manila is
UTC+8, so between midnight and 8 AM Philippine time that string is still
*yesterday*, and an event dated today was filed under "past" — while the
**Upcoming Events card on the same dashboard**, which already used
`manilaToday()`, counted it as upcoming. One dataset, two surfaces,
different answers, every morning.

Both now call `manilaToday()`. `displayLabels.test.js` pins it with fake
timers at `2026-09-30T17:30:00Z` — 01:30 the next day in Manila — where
the UTC string and the Manila string genuinely differ.

**Anything that compares an event or reservation date against "today"
uses `manilaToday()`.** Never `toISOString()`. The reservation cancel
rule already does this in SQL for the same reason.

---

## Calendars

Two IT feedback items, implemented 2026-10-01: *"Calendar view for court
schedule"* and *"Change and Update events to calendar"*. Four calendars,
**one** month grid.

| Surface | Views | Default | Authoritative data |
|---|---|---|---|
| Official → Reservations | `Queue` \| `Calendar` | **Queue** | the `reservations` state the dashboard already fetched |
| Public `/events` | `Calendar` \| `List` | **Calendar** | `events.event_date` |
| Official → Events | `Table` \| `Calendar` | **Table** | the `events` state the tab already fetched |
| Nurse → Health Events | `Table` \| `Calendar` | **Table** | the `health_events` state the tab already fetched |

**No Google Calendar, no OAuth, no external synchronisation, no second
event store.** Supabase stays the only source for `events` and
`health_events`.

### The shared grid, and the line it does not cross

`src/components/MonthCalendar.jsx` owns the grid, the weekday headings,
previous/next navigation, today, selection, the responsive behaviour and
the accessible names. It owns **no business logic** — it does not know
what a reservation is, which statuses hold a slot, or where an event's
detail page lives. Callers pass `renderDay(cell)`, which returns
`{ tone, count, disabled, label }`.

So the feature logic stays where it is tested:

| Module | Owns |
|---|---|
| `monthGrid.js` | date-only arithmetic, the grid, `groupByDateKey`, `monthOf` |
| `reservationCalendar.js` | occupancy, covered hours, pending/approved holding, exception counting, day tone |
| `eventCalendar.js` | event placement, day labels, `upcomingEvents` / `pastEvents` |

It was **extracted from** the public court-reservation calendar, which
was the only month grid in the app. That page still renders its own grid
with its own slot-availability tones — it is deliberately untouched,
because it is the surface #23/#23.R verified most heavily and its cell
states are about slot counts rather than about records on a date. The
`mcal-` prefix exists so the two cannot collide.

### ⚠️ The court calendar reads the official's own rows, not the public RPC

`buildReservationCalendar` is given the `reservations` state the
dashboard already fetched with `.select('*')`. It must **never** call
`get_reservation_slots_range`: that is the anonymous view, five columns,
deliberately without `full_name` and without `exception_reason`. An
official calling it would be reading a poorer copy of their own data
through a second source.

**Occupancy is `status IN ('pending','approved')`** — the same
definition as the exclusion constraint's partial `WHERE`, both public
RPCs, and the booking form. `declined` and `cancelled` release their
slots and must never make a date look occupied; a test asserts it.
Extent comes from `coveredHours()`, so a multi-hour booking and a
noon-spanning exception both hold every hour they occupy.

Amber means a booking on that date still waits on an official; green
means every booking on it has been decided; grey is the past. **Nothing
is decided from the calendar** — Approve and Decline stay in the queue,
and *Open these in the queue* sets a date filter and switches back.
That filter is separate from the search box on purpose:
`RESERVATION_SEARCH_FIELDS` does not include `preferred_date`, so a date
typed into the search would match nothing.

### ⚠️ Cells stay compact. Detail goes in the panel

No resident name, email, purpose, exception reason or event title goes
inside a calendar cell. Cells carry the day number and a count; the
selected date's records render in `.mcal-day-panel` beside the grid on a
wide screen and underneath it on a narrow one. Measured at 1280 / 768 /
375: **zero document-level horizontal overflow**, cells 96px square on a
tablet and 42px on a phone.

Officials see in the panel exactly what the queue already shows them.
Nothing new is exposed, and nothing is exposed publicly.

### ⚠️ `event_date` is the date. `event_month`/`event_day` are not

Those two are denormalised display copies, and they were written as
`new Date(dateString)` then `.getDate()` / `.toLocaleString()`. The
string parses as **UTC midnight** and both methods read it back in the
**browser's** zone, so west of UTC they describe the previous day —
verified: the same instant renders "Sep 30" in New York and "Oct 1" in
Manila. Every stored row is correct only because every row was written
from the Philippines.

Both write paths now derive them from the characters of the date
(`displayPartsFor`), so they can no longer disagree with `event_date`.
The calendars read `event_date` and ignore them; the public event cards
still render them, which is why they are kept.

**Nothing in `monthGrid.js` constructs a `Date` from a date string.** A
stored date is three integers and a label: `parseDateKey` splits the
characters, `dateKey` reassembles them, and comparisons are string
comparisons, which sort correctly for zero-padded ISO dates. The only
`Date` in the module is built from explicit `(year, month, day)` numbers
for the length of a month and the weekday of the 1st, where no parsing
happens and the day cannot shift.

### Home → Upcoming Events: filter, then limit

The section was `order('event_date').limit(4)` with **no date filter**,
so on live data it showed three events from 2024 first and the single
genuinely upcoming one last, under a heading promising the opposite.
`upcomingEvents()` filters against `manilaToday()` and limits
afterwards. Limiting in SQL first would hand four rows to a filter with
nothing upcoming left in them. Today counts as upcoming — an event this
afternoon has not happened yet.

### Edit Event and Edit Health Event — no migration needed

Both tables already had an unused `UPDATE` policy. **Reconfirmed by
impersonating each role over the API before implementing**, every case
rolled back:

| | |
|---|---|
| official → `events` | rows=1 |
| official → `health_events` | rows=0 |
| nurse → `health_events` | rows=1 |
| nurse → `events` | rows=0 |
| anon → `events` | rows=0 |

So Edit uses the existing permission, with no schema change. One modal
serves Add and Edit in each portal, so the fields cannot drift apart,
and **the existing row is updated** — not deleted and recreated, which
would break the public `/events/:id` link, lose `created_at` and file
two audit entries for one correction. Both call `.select()` and check a
row came back, because RLS filters rather than raising. Both log
`edited` on `event` / `health_event`, already in the vocabulary.

### The nurse's "Bakuna Calendar" was not a calendar

It was `healthEvents.slice(0, 3)` — the first three rows whatever their
date — under a heading saying Calendar. Renamed **Upcoming Health
Events** and now fed by `upcomingEvents(…, { limit: 3 })`, so it shows
the next three sessions rather than the first three rows. Not turned
into a second grid: the real one is one tab away under Health Events.

---

## Responsive layout (X2)

A whole-application responsive sweep, 2026-10-01, measured in Chromium at
**375 / 768 / 1280 / 1440** rather than read off the stylesheets.

**Result: zero document-level horizontal overflow** on every public route
and every dashboard surface measured, at every width. The one table that
scrolls internally does so on purpose — see below.

### ⚠️ A bare `1fr` grid track is `minmax(auto, 1fr)`

This was the single biggest finding, and it is the **same mechanism**
already documented for the mobile table-to-card block: a `1fr` track
cannot shrink below its content's **min-content** width, so one
unbreakable value sets a floor and the whole document scrolls sideways.

Measured at 375px with a long email address as the unbreakable token —
the realistic case, and the one that bit the tables before:

| Surface | Before |
|---|---|
| Home | **+310px** |
| Announcements | **+232px** |
| Health Center | **+193px** |

⚠️ **Collapsing to one column does not fix it.** A single `1fr` track is
just as much `minmax(auto, 1fr)` as three of them, which is why the
existing `grid-template-columns: 1fr` mobile rules did not help.

Every card/section grid now uses `minmax(0, 1fr)`, and the elements that
hold **text a person typed** — an event title and location, an
announcement title and body, a medicine name — carry
`overflow-wrap: anywhere`. Flex items that hold such text (`.event-info`,
`.health-sidebar > *`, `.medicine-item-main`) carry `min-width: 0`,
because a flex item's default `min-width: auto` is its min-content width
too.

**Not `word-break: break-all`.** That hyphenates ordinary prose
mid-word; `overflow-wrap: anywhere` only breaks a word that cannot
otherwise fit, and it is applied to the handful of elements that hold
user text rather than globally.

### ⚠️ A modal could put its own submit button out of reach

`.modal-overlay` is `position: fixed; inset: 0` and centres its child.
`.modal` had **no `max-height` and no `overflow`**, so a form taller than
the viewport overflowed both edges with nothing able to scroll — the page
behind is covered by a fixed overlay, and the modal did not scroll
itself.

Measured with the 9-field Add Registry Entry form (979px tall):

| Viewport | Before |
|---|---|
| 375x667 | title at **-156px**, Save button **124px below the fold** |
| 375x812 | Save button 52px below the fold |
| **1280x800** | Save button 58px below the fold — **not a mobile-only bug** |

`.modal` and `.confirm-dialog` are now capped at
`calc(100vh - 40px)` with `overflow-y: auto`, plus a `100dvh` line for
mobile browsers whose toolbars make `100vh` taller than the visible area
(a browser that does not know the unit ignores that declaration). The cap
only binds when the modal is too tall, so short modals are pixel-
identical. Verified afterwards at all four sizes: the modal scrolls to
**both** ends.

### The mobile dashboard header

All three portals share one fixed strip at the top, below 769px, rendered
by `Sidebar.jsx`:

**brand (logo + "Barangay Batinguel E-Services") · notification bell ·
menu button**

Before, that same 76px strip held the menu button **alone** — an
otherwise empty band — while the bell floated separately above the page
content, so a phone carried two pieces of chrome where one row would do.

| | |
|---|---|
| Brand | links to **`/`**, the public home page. It is the system's identity, and a resident reading their portal is still a citizen browsing a public site — the same reasoning that lands residents on Home after login |
| Logo | the existing `assets/images/logo.png`, the same asset the public `Navbar` uses. No duplicate asset |
| Brand text | wraps to two lines rather than shrinking; a brand smaller than the body text around it is worse than a wrapped one. Measured: it fits on **one** line at 375px beside both controls |
| Bell | immediately left of the menu button. **The nurse has none** — there is deliberately no nurse bell, so her header is brand + menu |
| Menu | far right, 44px, 12px from the edge |
| `z-index` | 1050 — above the drawer overlay (1000), below the drawer itself (1100), so an open drawer covers the header instead of leaving a strip floating over it |

Measured at 375px: brand at x=12 (245px wide), bell 269–311, menu
319–363 of 375. No overlap, nothing off-screen, unread badge visible,
and the notification sheet opens at y=68 fully inside the viewport.

⚠️ **Two `<NotificationBell>` elements are mounted, and exactly one is
ever displayed.** The desktop one is in `.dashboard-topbar`; the mobile
one is in the header. That keeps the desktop placement byte-identical
while giving the phone a single row, and `display: none` removes the
hidden copy from the accessibility tree so nobody is offered two
Notifications buttons. Both are rendered from **one** `notificationBell`
const per dashboard, so the two placements cannot be given different
props.

### ⚠️ The hide rule has to live beside the rule it overrides

`.dashboard-topbar { display: none }` was first written into
`Sidebar.css`. It **silently never applied** — measured as two visible
bells at 375px.

Both selectors are `.dashboard-topbar` (0,1,0), and **a media query adds
no specificity**, so the rule the bundler emits *last* wins at every
width. Sidebar.css was emitted ~6.7KB earlier and lost. The rule now sits
in `NotificationBell.css`, immediately after the `display: flex` it
overrides.

The general lesson, worth more than this one rule: when two files style
the same class, a media query is **not** a tiebreaker. Put the override
in the same file, or raise specificity deliberately.

### The drawer

Portal identity (`Resident Portal` / `Official Portal` /
`Health Center Portal`), the signed-in account, every nav item and
Logout are all unchanged. The account row got two declarations: without
them the 36px avatar is a flex item free to shrink, and a long name
squeezed it to **23x36** — an ellipse. It now holds 36x36 and the name
block takes the remaining width, with **0px** of slack. No system brand
is repeated inside the drawer; the mobile header already carries it.

### Tables: what each one is meant to do

| Table | Behaviour |
|---|---|
| Reservations (11 columns) | **Internal horizontal scroll, on purpose.** 1163px of real content in ~956px of content area at 1280 with the sidebar expanded |
| Document Requests, Residents, Voter Reference List, Activity Log | Fit without internal scrolling at 1280+ |
| All of them, ≤768px | Convert to cards (the protected block). Measured: row width equals the available width, and the **Action cell stays visible** at 301px |

⚠️ **Name and Email stay separate columns, and the reservations table
keeps its internal scrollbar.** Both were settled before X2 and were not
revisited: forcing eleven columns of real data into ~650px would make
them unreadable, and the scrollbar is styled to be visible so a column
off the end reads as scrollable rather than missing. **No action is ever
hidden to make a table fit.**

### The calendars

The shared `MonthCalendar` was measured in both layouts. Cell sizes:

| Width | Public Events | Inside a dashboard |
|---|---|---|
| 375 | 42px | 42px |
| 768 | 96px | 96px |
| 1024 | — | 41px (two columns beside the panel) |
| 1280 | — | 59px |
| 1440 | — | 71px |

All comfortably usable; day detail stays in `.mcal-day-panel` outside the
grid, so a long event title never has to fit in a cell. `.mcal-grid` was
moved to `minmax(0, 1fr)` for consistency with the above — nothing
overflows there today, since a cell holds only a number and a count.

⚠️ **An 18px cell was measured at 1024 and was a HARNESS BUG, not a
defect.** The measurement page wrapped the capture in
`.dashboard-layout > .dashboard-main` when the capture already contained
them, so the sidebar's 260px margin was applied **twice**. Worth
recording because the number was alarming and nearly led to a fix for a
problem that does not exist — the project's own rule about asking which
step produced a result.

**The public Covered Court booking calendar was left alone.** It has its
own grid with slot-availability tones, it is the surface #23/#23.R
verified most heavily, and it showed no overflow at any width. It was
deliberately **not** refactored into `MonthCalendar` for consistency.

### What was NOT browser-verified

The three dashboards are behind `ProtectedRoute` and this environment has
no test account, so **no authenticated page was loaded in a browser.**
Nothing was done to weaken or bypass authentication for a screenshot.

Instead, `Sidebar`, `NotificationBell`, `MonthCalendar` and the
confirmation dialog were rendered through Jest — the **real** components,
with only their data sources stood in for — and the captured markup was
measured against the **shipped CSS bundle** in Chromium. The tables and
the tall modal are faithful reproductions of the dashboard JSX (same
columns, same `data-label` attributes, same `.cell-truncate` wrappers),
not the live pages.

So the chrome, the calendars and the dialogs are measured from real
component output; the **table and modal bodies are measured from
reproductions**, and the live authenticated pages remain unverified in a
browser.

Outbound HTTPS from the container's browser is not permitted to reach
Supabase, so even the public pages were measured against **synthetic**
fixtures — deliberately pathological ones (a 59-character unbreakable
email, a 74-character event title), which is what exposed the `1fr`
defects that real data does not reach.

---

## Accessibility (X3)

A whole-application accessibility sweep, 2026-10-01. Audited with
**axe-core 4.13** (WCAG 2.0/2.1 A + AA plus best-practice) across **50
page-measurements** — every public route at 375 and 1280, plus the
dashboard chrome, tables, calendar and dialogs — and then by **driving
the keyboard in Chromium**, which is where the defects axe cannot see
turned up.

**Result: zero axe violations on real application content.** The one
remaining finding is `page-has-heading-one` on a measurement fragment of
my own that has no `<h1>` by construction.

### What was wrong, and what fixed it

| Defect | Severity | Fix |
|---|---|---|
| The **public mobile menu button had no accessible name** — icon-only, announced as "button" and nothing else, on 13 surfaces. The only way into navigation on a phone | critical | `aria-label` that changes with state, plus `aria-expanded` and `aria-controls`, matching the dashboard button that had all three already |
| **72 of 81 `<label>` elements were not associated with their control.** axe only flagged the four with no `placeholder` to fall back on; the rest were silently unassociated, so clicking a label did not focus its field either | critical | `htmlFor`/`id` on **68** pairs across 7 files, ids derived from each control's existing `name` |
| **Five icon-only password toggles had no name at all** (`{show ? <FaEyeSlash /> : <FaEye />}` and nothing else) | critical | `aria-label` naming *which* password, plus `aria-pressed` for the state |
| **Seventeen modals had no dialog semantics** — no `role`, no `aria-modal`, no Escape, and focus left on the button behind the overlay | serious | `role="dialog"`, `aria-modal`, `aria-labelledby` pointing at each modal's own heading, and the shared `useModalA11y` hook |
| **The skip link did not skip.** `<main id="main-content">` was not focusable, so following it moved the hash and left focus on `<body>` — the next Tab went back to the top, which is the exact thing the link exists to prevent. Measured: `inMain=false` | serious | `tabIndex={-1}` on all 14 `<main>` elements. Measured after: focus lands on `MAIN#main-content` |
| **Contrast below AA in five places**, including `#8a97a4` on the unread-notification tint at **2.80:1** — the worst in the app, in code added during the notifications work | serious | see below |
| The **sidebar's portal name and signed-in account belonged to no landmark** | moderate | `role="complementary"` with the portal name, on the existing `<div>` — every sidebar selector is class-based, so no tag changed |
| **Announcements jumped `<h1>` to `<h3>`** | moderate | `<h2>` on that page. Home keeps `<h3>` because its cards sit under a section `<h2>`; the shared card styling now matches both tags |
| **Eight controls under the 24px minimum** (WCAG 2.2 SC 2.5.8) | AA (2.2) | padding on the four footer legal buttons (18→28px) and the two "View All" links (21→27px) |

### Contrast: measured, then minimally darkened

Each value was computed against the lightest background it actually sits
on, and moved the smallest distance that clears 4.5:1 with headroom.

| Where | Was | Now | Ratio |
|---|---|---|---|
| `--grey-600`, the app's muted text in **86 places** + 45 inline styles | `#6b7280` | `#5f6775` | 4.41 → **5.20** |
| Green buttons carrying white text | `#16a34a` | `#15803d` | 3.30 → **5.02** |
| Notification timestamp on the unread tint | `#8a97a4` | `#5f6775` | **2.80** → 4.9 |
| Error text | `#dc2626` | `#b91c1c` | 4.41 → **5.91** |
| Green status badge text | `#15803d` | `#126c33` | 4.39 → **5.71** |

⚠️ **`#15803d` was already in the palette**, so the green buttons reuse
an existing colour rather than introducing one. No type was shrunk and
no content was hidden to reach AA.

### ⚠️ The protected block was NOT edited for contrast

The global `#6b7280` replacement caught one declaration **inside**
`Sidebar.css`'s protected mobile table-to-card block —
`.dashboard-table td::before`, the card label colour. That block is
byte-for-byte protected, so the byte was **restored** and the correction
appended *after* the block at the **same specificity**, where it wins on
source order alone.

That is X2's cascade lesson applied deliberately rather than discovered
by accident. Verified at 375px: the label renders `#5f6775` while the
protected rule still supplies its content, weight, size, letter-spacing
and flex behaviour.

### `useModalA11y` — one call per component, not one per modal

`src/components/useModalA11y.js`. The shared `useConfirm` dialog and
`OfficialArchiveDialog` already had Escape, focus entry and focus
restoration; the other seventeen modals had none.

These modals are **mutually exclusive** — a dashboard never shows two at
once — so the hook takes "is any modal open" plus a single close action.
That turns nine separate wirings in a 4,600-line dashboard into one
call, and avoids threading a ref through deeply nested JSX.

It finds the open dialog by selector rather than by ref, for the same
reason. A modal that does not carry `role="dialog"` simply gets no focus
entry — visible, because its Escape still works and its focus does not
move, rather than failing silently.

⚠️ **Focus is not trapped.** The hook moves focus in, handles Escape and
restores focus on close. It does **not** cycle Tab inside the dialog, so
a keyboard user can still tab out into the page behind. The shared
`useConfirm` dialog does trap. Containment for the other seventeen is
**deferred to the final authenticated pass** — it needs each modal's
first and last focusable element, which is worth doing against the live
pages rather than against reproductions.

### ⚠️ One finding was a measurement artifact, not a defect

The keyboard probe reported the four public navigation links as having
**no focus ring**: `matches(':focus-visible')` was true, the tokens
resolved, and the computed outline was still `solid 0px currentColor`.
A rule was added for them — and then a screenshot showed the ring was
**already being painted**, before and after, identically.

`getComputedStyle().outlineWidth` reports `0px` for those elements in
this headless Chromium build even when an `!important` outline is
applied. The added rule was redundant and was **reverted**.

Recorded because the project's own rule caught it: *a negative test can
fail for the wrong reason — always ask which step produced the result.*
The paint-level screenshot was the only check that settled it.

### Verified by driving the keyboard

| Check | Result |
|---|---|
| Skip link → focus target | `MAIN#main-content`, `inMain=true` |
| Login reset-password modal | `role="dialog"`, `aria-modal=true`, labelled, focus lands on the first input |
| Escape on that modal | closes, focus **restored** to the exact opener |
| Footer Privacy modal | same, verified independently |
| Public menu toggle at 375px | found **by accessible name**; `aria-expanded` false→true; `aria-controls` target exists |
| First 8 tab stops on Home | skip link first, then logo, nav, Login, hero — logical order, nothing off-screen |

### Tests added

`useModalA11y.test.js` (9) and `Navbar.test.js` (6). The hook's tests
were run **both directions**: with the hook stubbed out, **4 of 9 fail**
— focus entry, focus containment on open, Escape closing, and the
detached-opener case. The other five pass trivially because a closed
modal cannot misbehave, which is worth knowing about them.

### What was NOT verified in a browser, and what is deferred

The three dashboards are behind `ProtectedRoute` and this environment
has no test account, so **no authenticated page was audited live**.
Nothing was done to weaken authentication for a screenshot.

The dashboard chrome, calendar and dialogs were audited from **real
component output** captured through Jest; the table and modal bodies
from faithful reproductions. So the dashboards' *markup* is covered by
axe, and their *runtime keyboard behaviour* is covered by unit tests —
but neither is the live page.

**Deferred to the final authenticated regression pass:**

- Tab containment inside the seventeen hand-rolled modals (above).
- Screen-reader announcement order on the dashboards — axe checks
  structure, not what a reader actually hears.
- The notification bell's panel reached by keyboard on a live dashboard;
  its behaviour is unit-tested but has never been driven in a browser
  while signed in.
- Any dashboard-only contrast pair that only appears with live data.

---

## Official Portal workflow adjustments (post-X3)

Four changes to how an official works, 2026-10-01, after X3 was
accepted. **No migration, no schema change and no permission change** —
each was checked against the live policies first, and in every case the
permission already existed.

### Edit Announcement — the UPDATE policy already allowed it

Announcements could be added and deleted but **not corrected**: a typo
meant deleting the post and writing it again, which changes the id the
public `/announcements/:id` link depends on and files two Activity Log
entries for one fix.

**Verified before writing any UI**, by impersonating each role over the
API and rolling every case back:

| | |
|---|---|
| official → `announcements` UPDATE | rows=1 |
| resident → `announcements` UPDATE | rows=0 |
| nurse → `announcements` UPDATE | rows=0 |
| anon → `announcements` UPDATE | rows=0 |

So the policy was already correct and **no migration was created merely
to let the UI do something the database already permitted** — the same
finding, and the same conclusion, as Edit Event and Edit Health Event
under *Calendars*.

Shape follows those two exactly: **one modal serves Add and Edit**, so
the fields cannot drift apart; the **existing row is updated** rather
than deleted and recreated; the write calls `.select()` and checks a row
came back, because RLS filters rather than raising; and it logs `edited`
on `announcement`, already in migration 016's vocabulary.

⚠️ **The column is `description`, not `content`.** Assuming `content`
cost a round trip — the project's own rule about verifying against the
actual schema.

### Document Requests — search and filter

The queue had no way to narrow it. It now carries the same
`DashboardFilterBar` the Residents tab, the Voter Reference List and the
Reservations queue already use — a **fourth caller of one component**,
not a fourth filter implementation.

- **Client-side, over state already fetched.** `filterDocumentRequests`
  in `src/utils/residentGroups.js` filters the `documentRequests` array
  the tab already holds. **No second data source and no new query** —
  the dashboard would otherwise have two answers for what is in the
  queue.
- It lives in `residentGroups.js` beside `filterRows` and reuses it, so
  search normalisation cannot drift between the two tabs.
  `DOCUMENT_SEARCH_FIELDS` is `full_name`, `document_type`, `purpose`,
  `contact_number`, `purok`.
- The status dropdown's labels come from **`documentStatusLabel()`**, so
  the words in the filter are the same words on the badges beside them.
  No raw stored value reaches the dropdown, per *Who owns a status
  label*. The option **values** are the stored ones, which is what the
  filter compares against.
- ⚠️ **Two different empty states.** `No document requests yet.` and
  `No document requests match this search.` are different facts.
  Showing the first while a filter is applied tells an official the
  queue is empty when it is not — which, on a queue of requests for
  government documents, is the one wrong thing this tab can say.
- The filter bar renders only when at least one request exists, so an
  empty queue does not offer controls that can narrow nothing.

`documentFilter.test.js` covers the status narrowing, each searched
field, the two composing, and that an unrecognised status yields
**nothing rather than everything** — the direction that fails open.

### The compact Punong Barangay status

**Punong Barangay Status is no longer a sidebar tab.** It was a whole
destination for one value that changes a few times a day, and it pushed
the official nav to thirteen entries. The feature, its data, its
permission and its wording are all unchanged; only the navigation entry
is gone.

It is now `.kapitan-compact` on the Dashboard overview: one navy row
reading **who**, **what state**, and — for the Punong Barangay only —
**one control** to change it. ⚠️ It first shipped as a full-width band
under the stat cards and was **moved into the dashboard header** after
review — see *Follow-up adjustments* below for the placement that is
current.

| | |
|---|---|
| Permission | ⚠️ **Unchanged.** `isKapitan` is still the only thing that renders a control, `handleUpdateKapitanStatus` still returns early for anybody else, and the `kapitan_status` UPDATE policy was not touched. An official who is not the Punong Barangay sees the state and no control, exactly as before |
| Wording | `KAPITAN_STATUS_OPTIONS` is the same constant the four-button grid used — same options, same order, same words. A `<select>` replaces the grid because one control fits on a dashboard row and four buttons do not |
| Label | `PUNONG_BARANGAY_LABEL`, as *One word per thing* requires |

⚠️ **The state text and the control are never both shown.** Rendering
`.kapitan-compact-state` beside the select put **"✅ Available" on
screen twice, side by side** — the same near-identical-strings-stacked
fault `HEALTH_NURSE_ROLE` exists to prevent, and it was found by
screenshotting the element rather than by reading the JSX. A select
reports its own state; a second copy of it is not information. So the
state div renders only when `!isKapitan`.

### ⋮ row actions, and the portal that made them possible

`ActionMenu`'s own header used to say it could go in **exactly one
place**, for two reasons. **One of them is now solved and one still
stands.**

- ✅ **The clipping reason is fixed.** `.table-wrapper` has
  `overflow-x: auto` and `overflow-y: auto`, and an overflow container
  clips absolutely-positioned descendants — measured: a menu in a
  table's action cell ended 69px past the wrapper and
  `elementFromPoint` at its own centre returned `.dashboard-main`, i.e.
  it was not painted at all. The new `portal` prop renders the popup
  into `<body>` with `position: fixed`, anchored from the trigger's
  measured rect, right-aligned and **flipped above** when there is not
  enough room below. Re-measured in Chromium: `insideWrapper=false`,
  and `elementFromPoint` returns `action-menu-item`. The flip was
  verified in its own direction at 375/768/1280/1440 with the trigger
  60px above the fold — `flipUp=true`, menu fully inside the viewport,
  painted.
- ⚠️ **The primary-decision reason still stands, and is why Document
  Requests was NOT converted.** See below.

Converted — five tables whose action cells held only *secondary*
management actions:

| Table | In the menu |
|---|---|
| Announcements | Edit, Delete |
| Events | Edit, Delete |
| Waste Management | Edit, Delete |
| Voter Reference List | Edit, Delete |
| Officials Directory | Edit, Archive |

⚠️ **Deliberately NOT converted, and this is a departure from the
request worth reading:** **Document Requests** was named explicitly, and
was left alone. Its action cell holds nothing but the Secretary's
primary decisions — Approve and Decline at `pending`, and a single
`Mark Ready` or `Mark Claimed` otherwise. `ActionMenu`'s own rule is
that *a primary decision must never be hidden behind it*, naming
Approve/Decline on document requests by name, and a one-button cell
behind a ⋮ is strictly worse than the button. Reservations, the
overview's pending list, the Residents tab, Archived Officials (one
Restore) and the Activity Log (no actions) are left alone for the same
reasons.

⚠️ **A menu must never widen what a role can reach.** The dashboards
build `items` with the **same conditionals the buttons had**, so an
action a role may not perform is simply **absent from the array** —
never present and disabled. The Officials Directory self-archive guard
is the worked case: an official's own row gets a menu with Edit and no
Archive, and the explanatory note still renders beside it.
`ActionMenu.test.js` asserts both directions.

### A padded wrapper is not a target — found while measuring this

The shared filter bar's search `<input>` and status `<select>` are
borderless and padding-less inside padded wrappers, so the field that
*looks* 52px tall could only be hit over **20px** of itself, and the
select over **17px** — both under WCAG 2.2 SC 2.5.8's 24px minimum,
and both missed by X3.

Measured with `elementFromPoint` stepped down each wrapper's box: the
padding returned the **wrapper**, not the control. `align-self: stretch`
(overriding the wrappers' `align-items: center`) plus `min-height: 24px`
makes each control fill its wrapper's content box. Re-measured: input
**34px**, select **24px**, and the pointer now reaches the control
across the padding. Pre-existing on four tabs, not introduced here — but
this change made Document Requests the fourth.

### What was verified, and what was not

The full suite (15 suites, 333 tests at the time, 340 after the
follow-up below), a clean production build with no
ESLint warnings at **207 kB** gzipped — a healthy build; a dead one is
~90 kB — and `git diff --check` clean. The protected mobile
table-to-card block hashes **identically to its pre-X2 bytes**; only its
line offset moved.

Responsive: **zero document-level horizontal overflow across 20
measurements** — four surfaces at 375/768/1280/1440.

⚠️ **The dashboards are still behind `ProtectedRoute` and this
environment still has no test account, so no authenticated page was
loaded in a browser.** The ⋮ menu was measured from **real component
output** captured through Jest and rendered against the shipped CSS
bundle; the Document Requests tab and the compact status row are
**faithful reproductions**, not the live pages. Two of this round's
findings came from reproduction errors caught by asking which step
produced the result — a `btn-decline` class that **does not exist**
(the real one is `btn-deny`) reported a 20px button, and an anchoring
probe that pushed the trigger 260px below the fold reported a flip
failure that was not one.

### Follow-up adjustments after manual review of the deploy preview

Two changes, 2026-10-01, from the repo owner's own review of the
deployed branch. Neither touches a handler, a permission, the
confirmation flow, the portal, the keyboard behaviour or Document
Requests.

#### Menu items read one word, and are announced with the row

The five management menus said *Edit announcement*, *Delete
announcement*, *Edit event* and so on. The table heading and the row the
⋮ sits in already say what the object is, so the entity noun was read
past on every line. They now read **Edit** and **Delete** (and **Archive**
in the Officials Directory — see below).

⚠️ **A screen reader does not have the row for context**, so the words
could not simply be deleted. `ActionMenu` takes a **`subject`** prop —
the announcement's title, the official's name — and does two things with
it:

| | |
|---|---|
| Names the trigger | `More actions for <subject>`, which is the template five call sites used to each write out themselves |
| Names each item | `aria-label` = `<item.label> <subject>`, so "Edit" is **announced** "Edit Anti-Dengue Cleanup Drive" |

The menu itself also takes the trigger's name through `aria-labelledby`,
so an assistive technology that announces the group on entry says which
row it belongs to before reading the first item.

⚠️ **The visible word is the FIRST word of the accessible name, never
replaced by it.** WCAG 2.5.3 Label in Name requires the accessible name
to contain the visible label, so a voice-control user saying "click
Edit" still matches. An `aria-label` of "Edit Anti-Dengue Cleanup Drive"
satisfies that; one reading "Change this announcement" would not. A test
asserts the prefix on every item.

Two deliberate exceptions:

- **Officials Directory reads `Edit` / `Archive`, not `Edit` / `Delete`.**
  Archive and delete are *different outcomes* here and the word is the
  only thing on screen that says so — see *Officials archive*. Only the
  redundant entity noun was dropped. ⚠️ This menu was **outside** the
  literal "simply Edit/Delete" scope of the request; shortening it was a
  judgment call for consistency across the five, and it is one line to
  revert.
- **The nurse's medicine list is unchanged** (`Edit details` / `Remove`).
  It is a card list, not a management table, and it passes `label`
  rather than `subject`, so its items carry no `aria-label` and their own
  text speaks. `label` still wins over the derived name when both are
  given.

#### The compact status moved into the dashboard header

It was a full-width navy band under the four stat cards. On a wide
screen that is a second full-width row for one value, so it now sits
**beside the greeting**, right-aligned in the header area:

```
Official Dashboard                    [ PUNONG BARANGAY        ]
Good day, Alexis · Barangay Secretary [ Hon. Frankie Credo  ▾  ]
```

⚠️ **One element, one DOM node, no second copy.** Heading, stats and
status are three children of `.dashboard-overview-top`, and the
arrangement is a responsive layout:

| | |
|---|---|
| **The default is the mobile layout, and it is nothing at all** | `display: block`, so the three stack in DOM order — heading, stats, status. There is **no `order` anywhere**: if both rules below vanished the phone layout would be unchanged. The accepted layout is the fallback, not the override |
| **≥ 769px** | a two-column grid: heading at row 1 column 1, status at row 1 column 2 `justify-self: end`, stats spanning both columns in row 2 |

**769px was measured, not assumed.** Forcing the side-by-side rule on at
768 leaves the greeting paragraph **342px** — too narrow for a sentence
naming the official and their position — so the breakpoint sits where
every other dashboard breakpoint in this project does.

Verified against the pre-change markup at 375 and 768: the heading,
stats, status, select and first card are **pixel-identical**, every box,
both widths. Adding the wrapper changes nothing narrow.

At 1280 and 1440 the status is content-width and capped at `max-width:
420px`, so it cannot become a third full-width band or out-grow the
greeting. With a deliberately long 48-character name it wraps to two
lines and the select drops below the name (138px tall rather than 67px)
without pushing into the stats — bounded, and not a shape the real
directory produces.

⚠️ **The Punong Barangay's name is still derived**, from `officialsList`
by position, exactly as before. Nothing about the permission moved:
`isKapitan` is the only thing that renders a control, and the state text
still renders only when the select does not.

⚠️ **On a wide screen the visual order and the DOM order differ**: the
status is painted beside the heading but comes third in the markup,
after the stats. That is the accepted cost of leaving the narrow layout
in pure document flow. Nothing interactive depends on the order — the
only focusable thing in the element is the Kapitan's own select — and
heading → stats → status is itself a meaningful sequence, which is what
WCAG 1.3.2 asks for.

---

## Dead CSS cleanup (X4)

2026-10-01, after the post-X3 adjustments were accepted. **Removal
only** — no renaming, no consolidation for its own sake, no change to
the colour system, the type scale or the spacing tokens.

**461 net lines of CSS removed** across nine stylesheets; the shipped
bundle went 19.14 kB → **18.38 kB**. The JS bundle is byte-identical to
the pre-X4 build because X4 made no JS/JSX/component changes. Earlier
X3 accessibility component changes remain present and unchanged.

### How "dead" was established, since grep is not enough

`className` in this project is sometimes built at runtime
(`` `badge badge-${tone}` ``, `` `reconcile-${severity}` ``,
`` `mcal-tone-${tone}` ``), so a class can be live with no literal
anywhere. The scan therefore collected every class token in every CSS
selector, then checked each against **word-boundary** matches across all
60 JS/JSX files *and* against every template-literal prefix the code
constructs. **There is no `classList` manipulation anywhere in the
application** — every class reaches the DOM through a `className` prop —
which is what makes the analysis closed rather than best-effort.

Of 644 class tokens, 37 were removed. The six that look unreferenced and
are **not** (`badge-ineligible`, the two `mcal-tone-*`, the three
`reconcile-*`) are each produced by one of those template literals, and
all six were kept.

### Proof that nothing changed, rather than an assurance

The pre-X4 bundle was built from the previous commit and kept, and every
measurement surface was rendered against **both** bundles:

| Check | Result |
|---|---|
| Full computed style of **every element**, 25 surfaces × 4 widths | **100 comparisons, zero differences** |
| Full-page screenshot hash, 14 surfaces × 4 widths | **56 renders, all pixel-identical** |
| Document-level horizontal overflow at 375/768/1280/1440 | 0 failures across 32 measurements |
| ActionMenu portal anchoring and the flip-up path | unchanged at all four widths |

⚠️ **The first style-diff run reported a difference and it was a
measurement artifact** — `.nav-drawer`'s `transform` differed by
**0.17px** at 375 and 768, which was the drawer's slide-in animation
sampled at two slightly different moments. Waiting on
`document.getAnimations()` before dumping removed it. The project's own
rule again: ask which step produced the result.

### `@keyframes` is global — `pulse` was declared three times

`@keyframes pulse` existed in `NurseDashboard.css`, `HealthCenter.css`
**and** `Officials.css`. Keyframes are **not scoped to the file that
declares them**, so only whichever the bundler emitted last was ever in
effect, and editing either of the other two would have silently done
nothing. All three bodies were identical, so the trap was invisible.

It is now declared **once, in `index.css`**, and the four animating
elements keep their own `animation:` lines. Same reasoning as
`tokens.css`: a global owned by one page is dishonest.

⚠️ **Verified both directions, because `animation-name` is a false
friend.** With the keyframe present, all four dots report
`getAnimations().length > 0` and three resolved keyframes. With
`@keyframes pulse` deleted from the bundle, `animation-name` **still
reads `pulse`** on all four while `getAnimations()` returns empty — so
checking the property alone would have passed a broken page.

### Deliberately retained

- ⚠️ **One dead rule inside the protected block.**
  `.kapitan-status-grid` at the end of `Sidebar.css`'s mobile
  table-to-card block belongs to the removed Punong Barangay tab and
  can never match. It stays, because that block is byte-for-byte
  protected and a dead declaration is cheaper than editing it. The
  block still hashes to its pre-X2 bytes. Anyone who ever reopens that
  block legitimately can take this rule with them.
- **Seventeen `tokens.css` custom properties that nothing reads.**
  That file is a deliberate palette whose own header records that the
  72 remaining hex literals were **not** migrated to `var()` — so a
  token ahead of its consumers is the documented state, not an orphan.
  Removing them would be changing the colour system. One of the
  seventeen, `--shadow-brand-strong`, became unused *in this pass*: its
  only consumer was `.events-calendar-btn:hover`, removed here.
- **Every appended override** from X2 and X3 — the rules that sit after
  the protected block at equal specificity, and `.dashboard-topbar`'s
  hide rule in `NotificationBell.css`. They read as duplicates and are
  the opposite: they are what makes the cascade come out right.

### What the removals were

Four groups, each proven against the live markup rather than by search
alone:

| Group | Why it was dead |
|---|---|
| The old **Punong Barangay tab** — nine classes across `OfficialDashboard.css` and `Sidebar.css` (`kapitan-status-card/-section/-option/-btn/-buttons`, `kapitan-page-header`, `kapitan-current-status/-display`) | The tab was folded into the overview; `.kapitan-compact-*` replaced all of it |
| **Fee-model leftovers** in `Reservation.css` (`.payment-note`, `.residency-box`) | Migration 006 dropped all ten money columns and the `reservation-payments` / `residency-proofs` buckets were deleted on 2026-09-10 |
| **Status classes no label map emits** — `.badge-in-office`, `.badge-on-field`, `.status-badge.on-duty`, `.health-badge-onduty`, `.dot-onduty` | The live vocabularies are `displayLabels.js`'s five availability labels and Officials.jsx's own `in-office`/`on-field` on a *different* selector |
| **Never-built UI** — a nurse notification-preferences block, an outreach stats card, a login role list, `.dashboard-grid`/`-grid-3`, `.dashboard-header`, `.sidebar-role`, `.sidebar-nav-divider`, two unused buttons on the Officials page | No component renders any of them |

One superseded `@media (max-width: 768px)` block in `Sidebar.css` was
also removed: all three of its rules were re-declared later in the same
file, identically or more completely (the later `.dashboard-main` adds
the mobile header's `padding-top: 76px`). Measured at 375/768/1024/
1280/1440 before and after: every computed value identical.

### Not done

No authenticated page was loaded in a browser — the dashboards are
behind `ProtectedRoute` and this environment still has no test account.
The surfaces compared above are the same real-component captures and
reproductions X2 and X3 used, rendered against both bundles.

---

## Public E-Services (X5)

A public-site workflow phase, 2026-10-02. **Not a visual-theme
rewrite:** the white navbar, the blue institutional palette, the
photographic heroes with their dark-blue overlays, the typography, the
card language and every accepted X2/X3/X4 decision are unchanged. What
changed is the information architecture and five workflows.

The navigation is now **Home / Officials / Health Center / E-Services /
Login**, and *Court Reservation* is no longer a top-level item.

### One catalogue, four surfaces

`src/constants/eServices.js` is the single list of services. The
desktop dropdown, the mobile drawer, the `/e-services` landing page and
the Home page's services section all render from it, and
`returnTo.js`'s allowlist is derived from it too — so a service added
once appears in all four and becomes returnable, and a service removed
stops being linked and stops being returnable at the same moment.

⚠️ **Do not add a service before its route exists.** `path="*"` renders
`Home`, so a premature entry does not 404; it silently takes somebody
to the homepage and looks like the service is broken.

⚠️ **`access` is a promise to the reader, never a gate.** It decides the
words shown beside a service, so a resident learns an account is needed
*before* clicking. `ProtectedRoute` and RLS decide what is actually
reachable, exactly as before.

### The booking flow is four steps, over one `formData`

`Reservation.jsx` asked for everything at once, so the first thing it
said to somebody who had typed their name was that their password —
sorry, their *date* — was missing. Worse, it carried **two** date
controls writing the same `formData.preferred_date`: a calendar and an
`<input type="date">`. The input is gone; the calendar is authoritative
because it is the only one of the two that knows what is already booked.

| Step | Asks for |
|---|---|
| 1 Date & Time | calendar, booking window, exception panel, duration, slots |
| 2 Your Details | who the booking is for, and what for |
| 3 Review | a `<dl>` of everything; nothing is written until confirmed |
| 4 Done | the reference number, what was booked, what happens next |

All four render from **one** `formData`, so Back never clears anything
— the fields are hidden, not unmounted. `src/utils/reservationSteps.js`
owns which step asks for what, and its tests assert the two field sets
are **disjoint** and together cover every value
`create_court_reservation` requires.

⚠️ **The window, the duration caps, the overlap check and the
office-hours rule are NOT restated there.** Those are
`reservationWindow.js` and the database triggers (020, 021). A second
home for a rule is how two copies drift.

The donation message moved out of the form into a *Court Information*
section below the flow. It sat between Additional Notes and the submit
button, where it read as a payment step — which for a facility that is
free, and whose table has had no money columns since 006 dropped all
ten, is the one thing it must not look like.

### A guest can check on a booking — migrations 024 and 025

A guest may book without an account (008) and now gets a reference:
**`BCR-2026-AB12CD`**. Random, not sequential: a sequential public
number tells anybody holding one that the neighbouring numbers exist,
which turns the tracking page into a directory of other people's
bookings. Crockford base32 with I, L, O and U removed; lookup maps the
look-alikes back, so an O read for a zero still finds the booking.

⚠️ **The reference is an identifier, never a credential.**
`track_court_reservation(p_reference, p_contact)` requires the
reference **and** the contact number, returns at most one row through a
fixed narrow column list, and masks the name and the number **in SQL**
— a client-side mask ships the real value to the browser and hides it
with CSS. `reservations` still has **no anonymous SELECT policy**.

⚠️ **A wrong reference and a wrong contact number give the same empty
result.** An answer that distinguishes them confirms which guesses are
live. The page keeps that property, and
`reservationTracking.test.js` asserts no message it can produce says
"not found", "no such" or "invalid reference".

⚠️ **Creation is an RPC, not a table insert, and the reason is
measured.** A guest has no SELECT policy on `reservations`, and
PostgREST's `.insert().select()` is `INSERT ... RETURNING` — so asking
for the reference back over the table API is refused `42501` even
though the insert itself is allowed. The fix is **not** to open up
anonymous SELECT. `create_court_reservation` is *stricter* than the
policy it replaces: `status`, `reviewed_by` and `resident_id` are not
parameters at all.

### `?next=` is an allowlist, not a sanitiser

`src/utils/returnTo.js` does not inspect the value. It decodes it
**once** and compares it against a fixed list of paths this application
serves. Anything not exactly on the list becomes the fallback, and
cannot be made to pass by any encoding, because nothing is parsed.

⚠️ **Decoding in a loop is how a double-encoded payload gets past a
check that ran before the last decode.** Exactly one decode.

⚠️ **It is not authorization either**, and the dashboards are absent
from the list anyway — asserted by a test, because no public page links
to one. `next` is honoured for a **resident** only: a staff member
arriving from an E-Services link would otherwise be bounced by
`ProtectedRoute` and read it as a broken login.

### The login role picker is gone, and nothing lost a control

It was Official / Nurse / Resident in three accent colours, defaulting
to **Official** on a public barangay website. It compared the chosen
button against `profiles.role` and, on a mismatch, signed the person
back out with *"Invalid role selected."* — **after**
`signInWithPassword` had already succeeded. So it never kept anybody
out of anything (RLS did and does), and what it produced was a
correctly typed password reported as a role error.

Two tabs now, **Resident first and default**, with `role="tab"`,
`aria-selected` and a `tabpanel`. They choose the heading, the help
text and the sign-up prompt — nothing else. Where somebody lands is
decided entirely by `profiles.role`.

### Sign-up is four steps, and the password guidance guides

Minimum **8**, where Supabase's own default is 6. ⚠️ The client being
*stricter* than the server is safe in that direction — an account this
form refuses is simply not created — and unsafe in the other, where a
form promising less than the server enforces produces an error nobody
can act on. A test pins it at ≥ 6.

⚠️ **One check blocks (length); two are suggestions and must stay
suggestions.** A rule that rejects a long passphrase for having no
digit makes passwords worse, not better. Which is which is said in
words as well as by the tick. The common-password list is a courtesy,
**not** leaked-password protection — that is Pro-only and cannot be
enabled here.

Step 4 replaced a `toast.success` fired while the page was navigating
to `/login`, where the toast then sat over a form that could not yet be
used. It names the address the confirmation went to, says the message
often lands in spam, and says plainly that signing in and booking the
court work straight away while requesting a document does not.

### ⚠️ Two defects that CLIP rather than scroll

X2 and X3 both looked for a document that scrolls sideways. Neither of
these does: the overflow is cut off by an `overflow: hidden` ancestor,
so `document.scrollWidth` equals the viewport width and **every
overflow probe reports a clean page**. Both were found with a
screenshot and then measured with a clipping detector — each element's
right edge against its nearest *clipping* ancestor, not against the
document.

- **`.login-box` was `grid-template-columns: 1fr 1.5fr`**, and `1fr` on
  a phone. That is X2's own biggest finding still sitting in the file.
  The panels stayed 438px wide at a 375px viewport, so 63px of every
  heading and paragraph on the login, sign-up and reset-password pages
  was simply **gone** on a phone.
- **`.login-input-wrapper input` had `flex: 1` and no `min-width: 0`.**
  A flex item's default `min-width: auto` is its min-content width, and
  for an `<input>` that is the default `size="20"`. Measured at 375px:
  the input cut by 58px and the **show/hide-password button by 102px**
  — entirely off the end of its own field, on the login page.

Both are the same family as the bare `1fr`: a default `auto` minimum
nothing can shrink past. **When a container has `overflow: hidden`, the
overflow detector is blind to it — screenshot, or measure against the
clipping ancestor.**

### The portrait is lost by the RENAME, not by archiving

Reported as "archiving an official loses their photo". It does not.
The audit trail:

```
2026-10-01 04:58  edited    Jeffrey Cataylo Lastimoso — Kagawad
2026-10-01 05:02  archived  ("for testing purposes")
2026-10-01 05:04  restored
2026-10-01 05:10  archived  ("gi kapoy na")
2026-10-01 13:29  restored
```

The portrait was gone at **04:58, by the EDIT**, four minutes before
the first archive. `display_order` 10 held `Jeffrey Feria Duran`, whose
photo is in `officialPhotos`; the rename left no key matching, and
`PersonAvatar` fell back to an icon with no word anywhere. Verified
that archiving is not the cause: neither handler sends `photo_url`,
neither makes a storage call, and `photo_url` is **NULL on all eleven
rows** — every portrait comes from the bundled map.

`portraitWillBeLost()` now warns on the rename (it **warns**, it does
not block), and the fallback is **named**: "No photo on file for
&lt;name&gt;".

#### ✅ The data was corrected — migration 027

The barangay confirmed that **Jeffrey F. Duran is the real Kagawad** and
that the Lastimoso entry was an erroneous rename, not a second official.
Migration 027 is a **data correction**: one row, one column.

| | |
|---|---|
| row id | `311c140b-7a9f-449b-bf1f-9371f46c304f` — **the same row, kept** |
| `full_name` | `Jeffrey Cataylo Lastimoso` → `Jeffrey Feria Duran` |
| everything else | `position`, `committee`, `display_order`, `archived_at`, `photo_url`, `created_at` all **untouched** |

⚠️ **The canonical form is `Jeffrey Feria Duran`, spelled out, not
`Jeffrey F. Duran`.** It was not chosen from memory — four independent
sources were checked and all four agree: his own `profiles.full_name`
(created 2026-05-28, never touched by the rename), the `officialPhotos`
key since the earliest commit, the **original uploaded asset filename**
(`Jeffrey Feria Duran.jpg`, later shortened to `J.Duran.jpg` with the
map keeping the exact name), and the directory's own convention, where
every official spells the middle name out in full — Catan, Flores,
Katada, Abol, Catadman, Fabillar. An initial would be the only
abbreviated name in the directory, and would break the match just as
thoroughly as Lastimoso did while *looking* right.

⚠️ **`J.Duran.jpg` was never re-keyed**, which is why this was a
one-line fix rather than a reconstruction. The map was already correct
and waiting for a row to attach to — the same thing that was true of the
missing Kagawad on 2026-09-30.

⚠️ **The audit trail is not rewritten.** The five `activity_log` rows
from 2026-10-01 still read "Jeffrey Cataylo Lastimoso — Kagawad",
because that is what the record genuinely said when each was written.
`activity_log` is append-only and has no UPDATE or DELETE policy;
tidying history would destroy the evidence that identified the defect.
No entry was written for the correction either — `stamp_activity_actor`
takes the actor from the caller's token, and a direct connection has
none, so the only possible entry would be unattributed, which is what
migration 015 exists to prevent. Migration 027's header is the record.

Verified after: his account matches **exactly one** active directory
row; `official_id_for_current_user()` returns his row id and he can
write his own availability but not the Treasurer's (`42501`); the public
page decodes `J.Duran.jpg` at 800×640 under his exact name; archive →
restore in a rolled-back transaction keeps the id, name, committee and
order; and **no official account is left without an active directory
row** — a query that named him before the correction and returns
`(none)` after it.

⚠️ **The underlying fragility is untouched.** There is still no
`profile_id` foreign key, so the next rename can do this again. What
changed is that it will now warn first, and a lost portrait says so.

### Friday was listed twice

`nurse_availability` has no uniqueness on `day_of_week`, and the live
table holds **two Friday rows** (08:00–12:00 and 13:00–17:00, both
stored 24-hour while every other row is a display string). The Clinic
Hours list printed Friday, then printed Friday again underneath it.

`src/utils/clinicSchedule.js` builds **one entry per weekday** carrying
every session recorded for it.

⚠️ **It first refused to merge them, and that was wrong — corrected in
the post-X5 polish pass.** The original reasoning was that 08:00–12:00
plus 13:00–17:00 only *looks* like the standard day with a lunch break,
so joining them would be inferring what the barangay meant. The page
therefore printed two blocks and the line *"Two sessions — closed in
between"*, which readers took to mean the clinic keeps unusual Friday
hours.

It is not an inference, and **the rows themselves settle it**: both
Friday rows record a break of 12:00–13:00, which is exactly the gap
between the two sessions. The barangay has already written down that the
closure between them is the lunch break. So `bridgingBreak` joins two
sessions into one span **if and only if** a break recorded on one of
that day's own rows starts precisely where the first session ends and
ends precisely where the second begins. Friday now reads
`8:00 AM – 5:00 PM` with `Lunch 12:00 NN – 1:00 PM`, like every other
day.

⚠️ **The rule is derived, not keyed to a weekday.** Nothing in the
module names Friday, and a day whose gap no recorded break accounts for
— a genuine morning-only / late-afternoon clinic day — is still shown as
two blocks, because flattening it would promise hours the clinic does
not keep. A break that only *partly* fills the gap does not join either.
Friday is the only day in the live table with two rows, which is why it
is the only day this changes; a test asserts every other day renders
exactly as stored.

⚠️ **Nothing was written to the database.** There are still two Friday
rows, and `sessions` still reports both; `displaySessions` is what the
page renders. A data correction remains the barangay's to make.

⚠️ **A break is shown only when it falls inside the session it was
stored against.** Friday's second row carries a 12:00 PM–1:00 PM break
against a session that *starts* at 1:00 PM; printing it would tell a
resident the clinic shuts an hour before it opens.

⚠️ **And `fetchWeekSchedule` was not selecting `break_start` /
`break_end` at all**, so `isOnScheduledBreak` got `undefined`, returned
null, and the automatic lunch-break detection **had never once fired**
on the public page.

### Consultation hours for every official — migration 026

`kapitan_availability` could not carry this: it has **no column naming
an official**. Adding one would leave existing rows with a NULL meaning
"the Kapitan, implicitly" beside new rows where NULL means nothing.
⚠️ **`kapitan_availability` and `kapitan_status` are untouched.**

`official_availability` is keyed to `barangay_officials.id`, public to
read **for active officials only**, and writable by that official alone.

⚠️ **Ownership resolves through the `full_name` string join and FAILS
CLOSED.** A mismatch means the official cannot publish their own hours
— never that they can edit somebody else's. Contrast the self-archive
guard (018), which compares the same strings and fails *open*; that is
accepted there only because archiving yourself reduces your own
privileges.

⚠️ **`official_id` is CHECKED, not stamped.** 015's pattern is to
overwrite what the client sent, which is right for an actor. It is
wrong for the column deciding *whose* schedule a row is: stamping would
silently reassign a mistaken insert rather than refusing it.
`updated_by` and `updated_at` **are** stamped.

⚠️ **The UPDATE policy needs its `WITH CHECK` as much as its `USING`.**
Without it an official could update their own row and set `official_id`
to somebody else's — passing on the way in, landing on the other
official's schedule on the way out. Verified refused.

⚠️ **Archiving hides the hours from officials too**, deliberately
unlike 018. A directory record is history worth keeping visible; a
consultation schedule is operational.

⚠️ **Nothing is seeded.** The table holds zero rows. Inventing
consultation hours would put times on a public page nobody at the
barangay agreed to.

### Home lost its history, and gained its services

The home page opened with three paragraphs of history, an embedded map,
a facts table and a school card — above the announcements, the events
and the waste schedule. Somebody arriving to check when their rubbish
is collected read several screens of history first.

All of it moved to **`/about`** — the same bytes, the same text from
`constants/about.js`, nothing restyled and nothing rewritten. Home now
carries an E-Services section where the history was, and a one-line
doorway to `/about`. ⚠️ **Not a second copy of the history**: two copies
of the barangay's own text is two places for it to drift.

### ⚠️ The Supabase connector gates more than migration 024 recorded

024's header says `DROP TRIGGER` cannot be sent through the connector —
it is treated as a destructive statement and the call times out waiting
for a confirmation that never arrives. Measured again here, it is
broader: **plain `DELETE`, `DROP FUNCTION` and `REVOKE` behave the same
way.** In the SQL Editor they are all fine.

Consequence recorded in 026's header: one dead helper function,
`tmp_cleanup_probe_row`, could not be dropped from here. It has been
neutralised (SECURITY INVOKER, a body that deletes nothing and raises)
and needs one line in the SQL Editor:
`DROP FUNCTION public.tmp_cleanup_probe_row();`

### What was measured, and what was not

Every public route — `/`, `/about`, `/e-services`,
`/track-reservation`, `/officials`, `/health-center`, `/reservation`,
`/announcements`, `/events`, `/login`, `/signup` — driven in Chromium
against the **shipped production bundle**:

| Check | Result |
|---|---|
| Document-level horizontal overflow, 8 widths (320–1440) | **0 failures across 88 measurements** |
| Clipping against the nearest `overflow: hidden` ancestor, 6 widths | **0 across 66** |
| Controls under WCAG 2.2 SC 2.5.8's 24px | **0 across 66** |
| Every `<label>` associated with a control | **true on every route** |
| Exactly one `<h1>` per page | **true on every route** |

The four-step booking flow, the four-step sign-up and the tracking page
were **driven**, not just rendered: every step reached, Back verified
to keep every value, and the two `?next=` and reference-lookup
behaviours exercised.

⚠️ **The dashboards are still behind `ProtectedRoute` and this
environment still has no test account, so no authenticated page was
loaded in a browser.** The Official Dashboard's new consultation-hours
editor is covered by the migration's own role-impersonation
verification and by unit tests over its pure module — **not** by a live
page. Step 4 of the booking flow and the tracking page's result were
reached with the **real** components and the **real** CSS bundle and
only the **network** stubbed, because Supabase is not reachable from
this container's browser.

---

## Manual review polish pass (post-X5)

Eight corrections, 2026-10-02, from the repo owner's own review of the
deployed PR branch. **No migration, no schema change, no permission
change, no new table and no change to authentication, RLS or the
reservation security model** — the pass is presentation, plus two real
defects where a control reported one state and the page showed another.

### ⚠️ Two controls that reported a state the page did not have

Both are the **same Postgres-of-CSS fact**, and it is worth stating once
because it will come back: **`[hidden]` is a UA rule on the ELEMENT
selector, so any author `display` declaration beats it.**

- **The medicine category disclosures did nothing.** `hidden` was set,
  `aria-expanded` flipped, the chevron turned — and `.medicine-list`
  sets `display: flex`, so the list never moved. Measured in Chromium
  after one click: `aria-expanded="false"`, `ul.hidden === true`,
  computed `display: flex`, the list still **126px tall with both
  medicines on screen**. A screen reader was told the group was closed
  while everybody could see it.
- Fixed with `.medicine-list[hidden] { display: none }`. The two new
  disclosures added in this pass — the officials' week and the waste
  grid — each carry the same guard next to their own `display`, by
  construction rather than after the fact.

Same family as `@keyframes pulse` and `animation-name` in X4: the
attribute reads right and the CSS silently defeats it. **Checking the
attribute alone passes a broken page** — measure the computed `display`
and the box.

### ⚠️ The E-Services dropdown was centring, not indenting

Reported as uneven padding. Measured inside the panel, the four service
labels sat at **82px, 54px, 41px and 62px** from its left edge — a
different offset each, varying with the length of the text. That is not
padding; that is centring.

The panel renders **inside the public navbar**, so its own `<li>`
elements also match `.navbar-menu li { display: flex; align-items:
center; justify-content: center }`. Each `<a>` became a block-level flex
item, shrink-wrapped to its text, and was then centred in its row.

`.eservices-panel .eservices-list li { display: block }` at **(0,3,1)**
outranks `.navbar-menu li` at **(0,1,1)**, so the fix never touches the
rule every other nav item depends on. Re-measured at 1024/1280/1440:
all five entries, the *All E-Services* link included, at **21px**.

⚠️ **The general lesson is not about this panel.** A component rendered
inside another component's DOM inherits that component's descendant
selectors. The X2 cascade note says a media query is not a tiebreaker;
this one says **proximity in the file tree is not isolation**.

### Medicine categories: a default, and a filter that overrides it

The groups exist to shorten a page that was unreadably long, so leaving
them all open defeated the thing they were added for. `isCategoryOpen`
in `medicineFilter.js` is the one rule: **first group open, the rest
folded**, overridden by what the reader has clicked.

⚠️ **While a filter is applied EVERY rendered group is open**, and that
is not a convenience. `filterMedicines` has already dropped the
non-matches, so every group still on screen *is* a match — a collapsed
one would hide a medicine the page has just counted as a result
("Showing 1 of 6" over an empty screen). Verified in the browser:
searching `Ascorbic`, whose only match lives in a group that is
collapsed by default, renders it open with the medicine visible; and
searching `Paracetamol` with that group **explicitly** collapsed still
shows both matches.

⚠️ **While filtered the group title is a plain heading, not a button.**
There is nothing left to disclose, and a disclosure whose control cannot
change anything is worse than no control — `aria-expanded` would
announce a state the click does not alter.

⚠️ **The override map stores only what the reader clicked.** An absent
key means "never touched", which is what lets the default differ per
group. A plain `collapsed[key] = true/false` map could not tell the two
apart, so the first click on a group folded *by default* would have
written `true` and left it folded. `toggleCategory` flips the
**effective** state, not the stored one.

### The Home page

- **The hero badge is the system's name**, `Barangay Batinguel
  E-Services`, not `Official Barangay Portal` — which could sit on any
  barangay's homepage, above a heading that already says which one this
  is.
- **The primary action is the catalogue**, `Explore E-Services` →
  `/e-services`. It was `Book a Reservation`, which made the covered
  court the headline errand of the whole barangay — above requesting a
  document, which is why most residents open this site. Health Center
  stays secondary, unchanged; the image, the overlay and the typography
  are untouched.
- **Announcement cards carry an excerpt**, and ⚠️ **the stored
  `description` is not touched** — `/announcements/:id` still renders it
  in full, verified: 179 characters on the card, **2,159 on the detail
  page**, from one row. Two things bound the card and both are needed:
  `announcementExcerpt` keeps a long notice out of the DOM, and a
  three-line CSS clamp makes the boundary exact at any width. Measured
  at 320/375/768/1024/1280/1440: **every row of cards is one height**,
  three at 365px across at 1280 and 1440.
- ⚠️ **The clamp's own ellipsis can follow the excerpt's three dots** on
  a narrow screen, where 179 characters do not fit three lines. Cosmetic,
  and the alternative — dropping the clamp — gives the phone a card as
  tall as whoever wrote the longest notice.

### ⚠️ The next waste collection is DERIVED, and absent when it cannot be

`waste_schedule.day_of_week` holds a weekday **name** and the schedule
recurs weekly, so "the next collection" is a question the stored data
can answer: the fewest days from the Manila weekday to that weekday.
`nextCollection` in `src/utils/homeSections.js` does exactly that and
**returns null rather than a guess** when no row carries a weekday name,
in which case the page renders no summary at all. Nothing is hard-coded
— no day, no purok, no time.

What the table does **not** hold is a date, a fortnightly or monthly
pattern, or a holiday exception. So a row whose `day_of_week` is not a
weekday name is left out of the computation and **counted in a note**,
rather than quietly dropped: a summary that loses rows looks complete
while being short.

⚠️ **Today counts as the next collection, not as missed.** `time_label`
is free text — one live row reads `7:00 AM - 10:00` — so deciding
whether today's window has passed would mean parsing a range the column
does not guarantee, and telling somebody their collection is six days
away on the morning it happens is the worse error. Same rule as
`upcomingEvents`: an event this afternoon has not happened yet.

⚠️ **There is no public waste-schedule route, so nothing links to one.**
`path="*"` renders `Home`, so a *"View Full Waste Schedule"* link would
land a resident back on the page they started from and look broken. The
full grid was already on this page; it now sits behind a real disclosure
(`<button>`, `aria-expanded`, `aria-controls`) under the summary. A
dedicated public page is **not built** — see *Known gaps*.

### The officials' consultation hours have two shapes

`official_availability` holds **zero rows** (026 seeded nothing, by
decision), so the common case is "nothing published" — and eleven cards
each carrying the sentence *"No consultation hours published yet."* was a
screen of apology where a reader wanted a name and a committee. That
case is now one short line: **Consultation Schedule / Not published
yet**.

⚠️ **It still says NOT PUBLISHED, never "unavailable".** An absent
schedule is not a closed door, and `todayLine` already draws that
distinction; this only chose how to show it. Nothing fabricates a status.

When an official *has* published, the card reads **Consultation Today**,
the status and the hours, with a **View schedule** disclosure revealing
all seven days. Days with no row read *Not published* rather than being
omitted.

⚠️ **The disclosure's accessible name carries the official's name** —
eleven cards would otherwise offer eleven controls all announced "View
schedule" — and it is a **prefix** of the visible label, never a
replacement: WCAG 2.5.3 means somebody saying "click View schedule" must
still match. The same rule, and the same reasoning, as `ActionMenu`'s
`subject`.

⚠️ **The Punong Barangay's card hides the empty shape, and only the
empty shape.** His card already carries the full weekly Consultation
Schedule from `kapitan_availability` in `.kapitan-section`, so
"Not published yet" beside a schedule the reader can see would
contradict it. Verified both directions: with the table empty his card
has no block and `.kapitan-section` still shows its days; give him
`official_availability` rows — a **different** table — and the block
appears like anybody else's.

### Two findings from passing, both target size

- ⚠️ **The public mobile drawer's four nav links were 21px tall**, under
  WCAG 2.2 SC 2.5.8's 24px. `.navbar-mobile` spaces its rows with
  `gap: 16px` on the flex column, so the space around each link belongs
  to the **list**, not the link — the same "a padded wrapper is not a
  target" defect as the dashboard filter bar's borderless input. X3 and
  X5 both missed it because **neither sweep opened the drawer**: a
  `display: none` control has a zero box and every target check skips
  it. Three of the four are pre-existing; E-Services is the one X5
  added. Fixed with `.navbar-mobile > li > a`, which keeps off the
  service sub-list (already padded) and off the login button (its
  padding is `!important`).
- ⚠️ **A comment in `EServicesMenu.css` asserted a rule that does not
  exist** — that `.navbar-mobile li` supplies the row padding. There is
  no such rule anywhere. The comment is corrected; it was the reason the
  21px links read as already handled.
- **Home's four contact cards jumped `<h2>` to `<h4>`** (axe
  `heading-order`). The old Home had the history block and its own
  sub-headings above them; X5 moved that to `/about` and left the skip
  behind. They are `<h3>` now, and the stylesheet matches **both** tags
  so nothing depends on which one a card uses — verified pixel-identical
  (13px / 700 / `#bfdbfe` / 5px margin).

### What was measured, and what was not

Driven in Chromium against the **shipped production bundle**, with only
the network stubbed:

| Check | Result |
|---|---|
| Document overflow + clipping + 24px targets, every public route, 6 widths | **0 failures across 66** |
| The same with each new control OPEN (dropdown, every medicine group, a filter applied, the waste grid, every officials week), 8 widths | **0 failures across 40** |
| axe-core 4.13 (WCAG 2.0/2.1 A + AA + best practice), 9 page states x 2 widths | **0 violations** |
| Announcement card heights per row, 6 widths | one height in every row |
| Dropdown label offsets, 3 widths | 21px for all five entries |
| Jest | 26 suites, **592 tests**, all passing |
| Production build | clean, no ESLint warnings, **220 kB** gzipped |

Every control was **clicked**, not inspected: the dropdown (open,
Escape, focus restored to the trigger), each medicine group (collapse,
expand, and the two filter cases), the waste disclosure (open, grid
`display: grid`, both purok cards present), each officials week (open by
mouse, closed by Enter), and the hero CTA and an announcement card
followed to their destinations.

⚠️ **The dashboards are still behind `ProtectedRoute` and this
environment still has no test account, so no authenticated page was
loaded in a browser.** Nothing in this pass touches a dashboard.

---

## Announcements and Events organization pass (post-X5)

A small presentation pass over **`/announcements` and `/events` only**,
2026-10-02, from the repo owner's review of the deployed PR branch. **No
routing change, no database change, no change to event or announcement
CRUD, no RLS change and no navbar change.**

### One compact intro block, shared by both pages

Both pages wrote the same block out separately and both rendered it the
same wrong way: `<h1><MdAnnouncement /> All Announcements</h1>` put the
icon INSIDE the heading, where it took a line of its own above the
title at every width. Four stacked lines for two things to say, and the
first card 305px down a 1280x1000 viewport.

`src/pages/PageIntro.css` now owns it and both pages import it. The icon
is a **sibling** marked `aria-hidden`, in a tinted 46px tile beside the
title, so it reads as one unit; the description sits under the title.

| | |
|---|---|
| Heading structure | unchanged -- still exactly one `<h1>` per page |
| Accessible name of the `<h1>` | now the words alone, with no svg in it |
| First card / calendar | 305px down → **232px** |

⚠️ **`.page-intro .back-link` is (0,2,0) on purpose.** Each page
declares `.back-link` at (0,1,0) in its own file, and an
equal-specificity override would be decided by which file the bundler
emits first -- the X2 cascade trap. Raising specificity makes it
independent of emission order.

⚠️ **It lives in its own file**, not in either page's stylesheet. A
block two pages share, owned by one of them, is the dishonesty
`@keyframes pulse` taught in X4.

### ⚠️ The category pill was stretching the full card width, and the cause was mine

Reported as a category bar spanning almost the whole card. Measured at
1280: the pill **346px wide inside a 382px card**, computed
`display: block`.

`.announcement-badge` is `display: inline-block`, which fits its text.
But the previous pass made `.announcement-card-body` a **column flex
container** to give the cards equal heights -- and a flex item is
`align-self: stretch` by default and is blockified besides. The badge
had been correct for as long as its parent was a block.

`align-self: flex-start` restores it (60px for "Notice"). Same family as
every other finding in this project where a container quietly redefined
a child: `[hidden]` under a `display: flex`, the navbar's `li` under the
E-Services panel. **A change that fixes one thing can silently redefine
a sibling; measure the siblings too.**

### The announcement cards became a browse page

`/announcements` printed each notice's **whole body**. Measured with the
live rows -- a 616-character notice beside a 10-character one -- all
three cards were **1,293px tall**, because the previous pass's equal
heights padded the short ones to match the long one.

| | Before | After |
|---|---|---|
| Card height | 1,293px (x3) | **317px** (x3) |
| Body | whole `description` | 3-line excerpt |
| Category pill | 346px | 60px |
| Megaphone band | 160px | 112px |

⚠️ **The stored `description` is untouched** and
`/announcements/:id` still renders it in full -- verified in a browser:
the card shows 179 characters, the detail page **2,159**, from one row.
`announcementExcerpt` is the function the Home cards already use, so the
two surfaces cannot cut at different lengths.

⚠️ **"Read announcement →" is a `<span>`, not a second link.** The
whole card is already one `<a>`; an `<a>` inside an `<a>` is invalid
HTML and would give a keyboard user a second stop for one destination.
A test asserts the card contains no nested anchor.

### The Events header is one row, and the list card gained its meta line

The Calendar | List switcher sat in a band of its own 28px below the
intro -- 181px of control against the right edge of a 1200x36 empty
row. It is now the aside of `.page-intro-row`, which **wraps**, so on a
phone it drops under the text instead of squeezing it. The markup,
handlers, `role="group"`, label and `aria-pressed` are unchanged.

⚠️ **A list card shows a time only when `event_time` holds one, and
`event_time` is NULL on every row in the live table.** So today the time
line is simply absent. A "Time:" label with a blank after it reads as a
value that failed to load, and inventing one is not an option.

⚠️ **And it does not dig a time out of `location`.** Three legacy
rows store one there -- `"2:00 PM - Main Covered Court"` -- and
splitting that string would be guessing at a format nothing guarantees,
on a column whose job is the place. Those rows show it as part of their
location, as somebody typed it. `eventTimeLabel` uses
`clinicHours.toMinutes` as its parse check, which is the same authority
`formatTime` uses internally, so the two cannot disagree about what
counts as a time.

Equal heights per row (102/102/102/**134** before), a location pin from
the icon library already in use, and a border that answers on hover.

### ⚠️ The selected-day panel was a 46px box beside a 532px calendar

Unselected, `.mcal-day-panel` measured **591x46** next to a 591x532
calendar -- it read as something that failed to render rather than as a
panel waiting for a click. The **words are unchanged**; the panel now
carries an `is-waiting` class and is styled as a waiting state: dashed
edge, centred text, 180px. Selected, it stretches to the calendar's own
height (591x532) so the two read as a pair.

⚠️ **Every rule is scoped to `.events-calendar-layout`.**
`.mcal-day-panel` is MonthCalendar's own class and the three dashboard
calendars use it too; an unscoped rule here would restyle surfaces this
pass is not about.

### Two heading-order violations, both pre-existing, both invisible to every earlier audit

axe flagged `heading-order` on the Events page in two states:

- **List view**: `<h1>` → `<h3>` on the event card title.
- **Calendar view with a date selected**: `<h1>` → `<h4>` on the
  panel's date heading.

Neither had ever been measured. X3 and X5 both audited `/events` in its
**default** state -- the calendar, with no date selected and with empty
fixtures -- where the list is not rendered and the panel heading does
not exist. **A page is not one page to axe; it is one page per state.**

Both are `<h2>` now. The event card keeps `<h3>` on **Home**, where it
sits under a section `<h2>` -- the same split the announcement card
already carries -- and both stylesheets match both tags, verified
pixel-identical (16px / 600 / `rgb(30,41,59)` / 0 top / 5px bottom).

### What was measured, and what was not

Driven in Chromium against the shipped production bundle, network
stubbed, with deliberately pathological fixtures (a 63-character
unbreakable title, a 40-character category, a 400-character body, a
97-character location):

| Check | Result |
|---|---|
| Overflow + clipping + 24px targets + one `<h1>` + equal card heights per row, 5 page states x 6 widths (320–1440) | **0 failures across 30** |
| axe-core 4.13 (A + AA + best practice), 6 page states x 2 widths | **0 violations** |
| Jest | 28 suites, **619 tests** |
| Production build | clean, no ESLint warnings, 220 kB gzipped |

Driven, not inspected: the switcher by mouse **and by Enter**, a day
cell selected by keyboard, an announcement card followed to its detail
page, and the detail page's body length read back.

⚠️ **`/` was re-measured as a regression check**, because the
announcement and event card rules live in `Home.css` and are shared. Its
event card is byte-identical at 588x102.

### ✅ The event detail page's empty Time row — fixed in a follow-up

Recorded here as out of scope and then fixed on its own:
`EventDetails.jsx` rendered
`<p><strong>Time:</strong> {event.event_time}</p>` **unconditionally**,
so on every live event the page printed "Time:" followed by nothing —
which reads as a value that failed to load rather than one that was
never recorded.

⚠️ **The whole row is omitted, not just its value.** A label with an
empty value beside it is the defect; a label with "—" after it would be
asserting the barangay recorded something.

It calls the same `eventTimeLabel` the list card uses, so the two
surfaces cannot disagree about whether a row has a time or how it
reads — and it therefore also does **not** dig one out of `location`.
`event_time` is `time without time zone`, so the database itself
refuses anything that is not a time; the empty-string and
whitespace cases the tests cover can only reach the component from a
client, never from the column.

⚠️ **The value is now formatted** (`14:00:00` → `2:00 PM`) rather than
printed raw, which the list card already did and which *No raw database
value is shown to a user* requires. That is slightly beyond "omit the
row when empty" — one line to revert if the raw form is wanted.

`EventDetails.test.js`, 8 tests, run **both directions**: with the
condition removed, **5 of 8 fail**; the other three pass trivially
because they cover the title, date, description and location, which the
change does not touch.

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

### One word per thing

Two label constants exist because the app had been using several words
for one person in one product:

| Constant | Value | Replaces |
|---|---|---|
| `PUNONG_BARANGAY_LABEL` | "Punong Barangay" | "Kapitan" in the status heading and its toast, and "Kapitan's Office" on the public page. It named the sidebar tab too, until that tab was folded into the overview — it now names the **compact status row** there |
| `HEALTH_NURSE_ROLE` | "Public Health Nurse" | "Head Barangay Nurse" in her own Settings, and the hard-coded copies on the sidebar and both public pages |

**Presentation only, in both cases.** `kapitan_status`,
`kapitan_availability`, the `kapitan` tab id, `isKapitan`, every
`.kapitan-*` class and all database values keep their names — renaming
those buys nothing a reader sees and costs a migration.

"Punong Barangay" won because the officials directory, the public cards
and `barangay_officials.position` already used it, and the position is
what drives the Kapitan/Treasurer/Secretary permission gates. "Public
Health Nurse" won because it was already the wording on the two pages
residents actually read. Her Settings card previously introduced her as
"Barangay Health Nurse / Head Barangay Nurse" — a name and a title that
were nearly the same words and disagreed with the sidebar.

The nurse is identified **by role, not by person** — the system
previously carried an invented name and a stock photo of an unrelated
person, both presented as barangay staff. Replace with the real name and
photo together when the barangay confirms them.

⚠️ **One role string on screen, not two.** `HEALTH_NURSE_NAME`
("Barangay Health Nurse") and `HEALTH_NURSE_ROLE` ("Public Health
Nurse") were being rendered one above the other on the Health Center
page, the public Officials card **and** her own Settings card — two
near-identical strings stacked, which reads as a fault. That is the same
defect `HEALTH_NURSE_ROLE` was introduced to fix, relocated rather than
removed. All three now show the role with "Barangay Health Center"
beneath it.

`HEALTH_NURSE_NAME` is **still used and must not be deleted**: it is
written to `nurse_availability.nurse_name` and is what `PersonAvatar`
derives her initials from. It is no longer displayed as a label.

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
- ~~**In-app notifications**~~ — **built.** Migration 022, the bell on
  the Resident and Official portals, and the resident sidebar badges
  repointed to one definition of unread. See *Notifications*. What is
  deliberately **not** built: browser push, Web Push, service workers,
  VAPID, notification email, any new SMS, a nurse bell, Realtime, and a
  retention policy — each noted where it belongs.
- **Broadcast SMS by age group** — discussed, not built. Blocked on
  `profiles` having no birthdate, and on cost: ~₱1/SMS against 13,000+
  residents.
- **Auto-expiry for stale pending reservations.** An abandoned request
  blocks its slot until an official declines it.
- ~~**Reservation hours and the exception workflow — PR #23**~~ —
  **built.** Migration 020 and `src/utils/reservationWindow.js`; see
  *The office-hours exception* under *Court reservations*. It is a
  controlled exception workflow, as recorded: a request outside 5–10 PM
  is something an official decides on with the reason recorded, and no
  activity category approves anything. An exception may run through noon
  and for up to 8 hours, per the barangay's 2026-09-30 decision, and
  migration 021 made the ordinary 4-hour maximum authoritative in the
  database. What is deliberately **not** built, decided 2026-10-01:
  there is no re-send or re-decide path, exceptions are not supported
  beyond 8 hours (the CHECK stays `1..8`), and noon is a coverable hour
  but not a startable one — all noted where they belong.
- **`profile_id` foreign key** replacing the `full_name` matching above.
  ⚠️ This cost the project a real outage of one official's permissions
  on 2026-10-01: display_order 10 was renamed to `Jeffrey Cataylo
  Lastimoso`, and `Jeffrey Feria Duran`'s account stopped matching any
  active directory row — he silently lost his position permissions and
  his portrait. **The data was corrected in migration 027** once the
  barangay confirmed he is the real Kagawad, but the mechanism that
  allowed it is still there. The foreign key is what actually fixes it;
  until then the rename warns, and `officialPhotos.test.js` guards the
  eleven canonical keys.
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
- **Thin automated test coverage.** 627 tests in twenty-nine suites: one
  smoke test over `<App />`, which fails without `.env` because
  `supabaseClient.js` throws at import time, and 626 tests over the
  resident workflow rules, the display labels, the booking window, the
  month grid and its three feature layers, the document-request filter,
  the ⋮ menu's keyboard and authorization behaviour, the modal
  accessibility hook, the public navbar and the confirmation dialog.
  No integration or end-to-end tests,
  and **no test touches the database** — the reservation-window tests
  mirror migration 020's SQL cases rather than running them, so the two
  can still drift if only one is edited.
- **Desktop at 1024px with the sidebar expanded still scrolls the widest
  table.** Re-measured in X2 and unchanged — see *Responsive layout
  (X2)*, which records it as the one deliberate internal scroll. 1024 minus a 260px sidebar minus padding leaves ~650px, and
  eleven columns of real reservation data need ~784px even with the Email
  and Purpose caps. `.table-wrapper` scrolls, and its scrollbar is now
  styled to be visible rather than an invisible overlay, so a column that
  is off the end reads as scrollable rather than missing. Collapsing the
  sidebar fits it (838px). 1280px and above fit either way.
- **`kapitan_availability` has no administrative UI.** The weekly
  consultation schedule shown on the public Officials page is read from
  that table by `src/pages/Officials.jsx` and by nothing else, so it can
  only be changed in SQL. Recorded as an observation, not built: nobody
  has asked for the screen, and inventing one would be a feature rather
  than a fix.
- **An InfinityFree deployment** may still be serving an old broken build.
- **No 404 page.** `path="*"` in `App.js` renders `Home`, so a mistyped
  URL looks like the homepage instead of reporting an error. ⚠️ This is
  also why `constants/eServices.js` must never list a service before
  its route exists: a premature entry does not 404, it silently lands
  on the homepage and looks like the service is broken.
- **`nurse_availability` has no uniqueness on `day_of_week`**, which is
  how the live table ended up with two Friday rows. `clinicSchedule.js`
  renders them as ONE 8-to-5 day with a lunch break, because both rows
  record the 12–1 break that exactly fills the gap between them — but
  nothing stops a third row, and a third would not be joined (the rule
  takes exactly two sessions), so it would reappear as a second block.
  A unique index cannot simply be added — it would fail on the
  existing data, and a clinic day may legitimately be split, which is
  exactly why `official_availability` has that constraint and this
  table does not.
- **Friday's two clinic rows are stored 24-hour** (`08:00`) while every
  other row is a display string (`8:00 AM`). `clinicHours.toMinutes`
  accepts both, so nothing breaks — which is why nobody noticed.
- **One dead database function**, `tmp_cleanup_probe_row`, left by
  migration 026's verification because this connector gates
  `DROP FUNCTION`. Neutralised; needs one line in the SQL Editor.
- **No public waste-schedule route.** The collection schedule is a
  section of the Home page and nothing else. Home now carries a derived
  *Next collection* summary with the full weekly grid behind a
  disclosure, which is why there is no *"View Full Waste Schedule"*
  link: `path="*"` renders `Home`, so one would land a resident back
  where they started. A dedicated page is an unbuilt feature, not a
  defect.
- **`waste_schedule` records a weekday name and nothing else** — no
  date, no fortnightly or monthly pattern, no holiday exception. So
  `nextCollection` can only answer "which weekday is soonest", and a row
  whose `day_of_week` is not a weekday name is excluded from the summary
  and counted in a note rather than placed on some day anyway.
- **`events.event_time` is NULL on every row**, and three legacy rows
  carry their time inside `location` instead
  (`"2:00 PM - Main Covered Court"`). Both the list card and the detail
  page render a Time only when the column holds one, and neither parses
  it out of `location`, so today no event shows a separate time
  anywhere. The legacy strings are left exactly as somebody typed them;
  moving them into `event_time` is a data correction for the barangay
  to make, not a display function's guess.
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
