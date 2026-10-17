# Professor demo script — 10 steps, about 8–10 minutes

Data must be entered first: **`docs/DEMO-CHECKLIST.md`**. Nothing is seeded.

Have three browser profiles or windows ready — **Punong Barangay**,
**Barangay Secretary**, **resident** — plus one **signed-out** window for the
public steps. Switching accounts live is what eats the clock.

---

### 1 · A resident files a complaint — ~1 min
`/resident?tab=complaints` → **File a Complaint**. Category, what happened,
roughly where, one respondent.

> "Nothing on this form asks for a status, a reference or a case number.
> The server owns all of those — the resident cannot set them."

Read out the `CMP-` reference it returns.

### 2 · The Secretary prepares the review — ~1 min
Official Portal → **Complaints** → the complaint → **KP review screening**.
Answer the six questions; recommend **Proceed with the barangay KP process**.

> "Six questions a human answers. There is no function anywhere — in the
> database or the app — that turns these answers into a decision. The
> checklist is marked provisional on screen, because the barangay has not
> confirmed its own KP procedure."

Point at the complaint's status: now **Under barangay review**.

### 3 · The Secretary cannot confirm her own work — ~30 sec
Still as the Secretary: there is **no Confirm control**.

> "Separation of duties, and it is not just the button being hidden — the
> database refuses it too. One person prepares, a different person confirms."

### 4 · The Punong Barangay confirms — ~45 sec
Switch. Same complaint → **Confirm** → **Proceed with the barangay KP
process**. Status becomes **Reviewed by the barangay**.

> "'Reviewed' — not 'approved', not 'eligible'. The resident is told the
> stage, never the decision. A person tells them the outcome."

### 5 · The KP case opens, and only now — ~45 sec
The **Open a KP case** form has appeared.

> "Before that confirmation this was a sentence, not a form. The database
> checks the confirmed outcome itself, so a crafted request is refused the
> same way."

Open it. Read out the `KP-` reference.

### 6 · A hearing, and the summons — ~1 min 30
Schedule a **Mediation** → record **attendance** → record **minutes** →
record **one outcome** (tick *concludes the case*). Then open the **summons
/ hearing notice** and print to PDF.

> "Factual case data only — the parties, the proceeding, the date, the
> place. No statutory wording, no seal of office, no signature, and it says
> SYSTEM TEMPLATE on the page and on the paper, because the barangay has not
> supplied its real form."

### 7 · An incident becomes a blotter entry — ~1 min
Official Portal → **Incidents & Blotter** → **Record an incident**. Attribute
a Tanod.

> "One action, two records: the incident and its blotter entry, created
> together so neither can exist without the other. And the types are
> deliberately neutral — 'Physical altercation', not 'Assault'. This records
> what was reported; it classifies no crime."

Point at the `INC-` and `BLT-` references on the row.

### 8 · The Tanod roster — ~45 sec
**Tanod Operations**: two members, two patrol assignments.

> "A Tanod is a record, not an account. No email, no password, no login, and
> no location tracking — the page says both of those in as many words."

### 9 · The official safety map — ~1 min
**Safety Map & Analytics**.

> "Precise points, and the popup carries the location the officer typed.
> This is operational, and it is officials-only — an anonymous request for
> this data is refused by the database, not by hiding the tab."

Then the analytics: counts by type, by month, repeated locations, coverage
gaps.

> "Counts, never rates. There is no population figure anywhere in this
> database, so a 'crime rate' would be a number we invented."

### 10 · The public Community Safety Map — ~1 min 30
**Sign out.** Public navbar → **Community Safety**.

> "Same incidents. Completely different data."

Three things to point at, in this order:

1. **The circles are fewer than the incidents.** Coordinates are grouped
   into areas about 220 m across, and an area is published **only when two
   or more incidents fall in it** — so a single incident at a sensitive
   location can never be pointed to. The page says so itself.
2. **The circle is at the area's centre, not at an incident.** Not even the
   average of the points, which would itself be a precise location.
3. **The counts do not match, and the page explains why** rather than hiding
   the gap: *"N of M recorded incidents fall in an area shown below."*

Then what is absent:

> "No narrative. No names. No contact numbers. No street names — because the
> location note is free text an officer typed, and it can name a household.
> No status. Nothing about a Tanod or a patrol. And that is not this page
> filtering them out: the database functions it calls do not return them, so
> there is no edit to this page that could expose one."

Close on the heading:

> "'Recorded incident concentration' — not a crime rate, not a ranking of
> dangerous places, and not a prediction. The page says that too."

---

## If you have a spare minute

- **`/track-complaint`**, signed out: the `CMP-` reference **and** the
  contact number. A wrong contact gives the identical empty answer a wrong
  reference does — so it cannot be used to find out whose complaints exist.
- Sign in as an ordinary **Kagawad**: the complaint **queue** is visible,
  the **detail** is one neutral sentence that names no position. And on
  Incidents & Blotter the records actions are **absent**, not greyed out.
