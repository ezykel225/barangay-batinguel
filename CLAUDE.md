# Barangay Batinguel E-Services

Capstone project (CAPRES 2) — a web-based integrated system for Barangay
Batinguel, Dumaguete City, Negros Oriental.

Full title: *BARANGAY BATINGUEL E-SERVICES: A Web-Based Integrated System
for Barangay Services, Official Information, and Health Center Management.*

---

## Tech stack

- **React 19** (Create React App — `npm start`, not Vite)
- **React Router v6**
- **Supabase** — Postgres, Auth, Storage, Edge Functions
- `react-hot-toast` for notifications, `react-icons/fa` for icons
- Styling is hand-written CSS, one file per component

**Tailwind is configured but unused.** `tailwind.config.js` exists and
`src/index.css` has the `@tailwind` directives, but there is not a single
Tailwind utility class in the JSX — the apparent matches are all custom
class names containing the word "grid". It can be removed.

**Supabase project ref:** `mpcyqwasurhtdztzobwg`

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
  constants/            Barangay facts, medicine categories, page content
  utils/                Photo lookup, storage paths, clinic-hour parsing
supabase-migrations/    Numbered SQL recording every schema/RLS change
supabase/functions/     Edge Function source (notify-reservation-sms)
```

`supabase-migrations/` is a **record**, not a runner. Editing a file
there changes nothing — migrations are applied by pasting them into the
Supabase SQL Editor. "I edited the migration" and "the database changed"
are two separate steps, and forgetting the second is an easy mistake.

Each file's header records whether it has been applied, when, and how it
was verified. Those headers are the only place several non-obvious
decisions are written down; read them before changing anything nearby.

---

## User roles

Three roles, stored in `profiles.role`:

| Role | How created | Lands on |
|---|---|---|
| `official` | Manually by devs (service_role) | `/official` dashboard |
| `nurse` | Manually by devs (service_role) | `/nurse` dashboard |
| `resident` | Self-signup at `/signup` | `/` (Home) — **not** the dashboard |

There is no admin role — that was considered and dropped. Two old
policies on `kapitan_status` and `kapitan_availability` still reference
`role = 'admin'`; it is a dead condition, harmless but worth knowing
before someone assumes the role exists.

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

14 migrations, all applied. Tables: `profiles`, `reservations`,
`document_requests`, `announcements`, `events`, `barangay_officials`,
`residents_registry`, `waste_schedule`, `activity_log`,
`kapitan_status`, `kapitan_availability`, `nurse_availability`,
`medical_programs`, `health_events`, `medicine_stock`.

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
- **`activity_log`** has no UPDATE or DELETE policy on purpose.

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
- Dashboard, announcements, events, reservations, document requests
- Waste management, Kapitan status, officials directory
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

- **SMS notifications.** `supabase/functions/notify-reservation-sms` is
  written, deployed and secured — officials only, and the message is
  built from the reservation row rather than the request body, so a
  caller can neither choose the recipient nor write the text. It needs an
  `IPROG_SMS_API_TOKEN` secret; until then it returns
  `{ sent: false, reason }` and the dashboard tells the official to phone
  the resident instead. **Never tested against the live provider** — the
  phone format (`639XXXXXXXXX`) and content type follow IPROG's docs, not
  an observed response.
- **Broadcast SMS by age group** — discussed, not built. Blocked on
  `profiles` having no birthdate, and on cost: ~₱1/SMS against 13,000+
  residents.
- **Auto-expiry for stale pending reservations.** An abandoned request
  blocks its slot until an official declines it.
- **`profile_id` foreign key** replacing the `full_name` matching above.

## Known gaps

- **The activity log can be forged.** Any signed-in user may insert a row
  with their own `actor_id` but arbitrary `actor_name` and `action`.
  They cannot read it back, but they can pollute it.
- **Leaked-password protection is Pro-only** on Supabase and cannot be
  enabled on this project. The dashboard toggle appears to turn on and
  the save is rejected — don't trust a screenshot of it.
- **Source maps ship to production** (~7 MB), so the original JSX is
  publicly reconstructable. `GENERATE_SOURCEMAP=false` in Vercel fixes it.
- **`public/logo.png` is 984 KB and referenced by nothing.**
- **No automated tests** beyond one smoke test, which fails without
  `.env` because `supabaseClient.js` throws at import time.
- **An InfinityFree deployment** may still be serving an old broken build.

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
- `git pull` before starting. Stale local code has looked like a bug more
  than once.
