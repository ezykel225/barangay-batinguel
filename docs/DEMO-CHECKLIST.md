# Professor demo — manual data checklist

⚠️ **Nothing here is seeded automatically, and nothing in this repository
seeds it.** Final Integration added no demo data: all six incident/Tanod
tables and all four KP tables hold **0 rows**, and every database probe run
during the phase was inside a transaction that aborts. Entering this data is
your decision, through the real UI, as the real officials.

⚠️ **Use fictional, generic, non-sensitive names and places.** Nothing below
should name a real resident, a real household or a real address. "Juan Dela
Cruz", "Maria Santos", "Rizal Street", "Main Road", "Near the covered court"
are all fine.

⚠️ **There are no delete buttons for any of this, and that is deliberate** —
this project does not delete records, and no bypass was added for demo
cleanup. Everything you enter below stays. Keep it generic for that reason
as much as for privacy.

---

## Before you start

| | |
|---|---|
| Confirm the deploy preview is on this branch | the Community Safety entry should be in the public navbar |
| Sign-ins you will need | the **Punong Barangay**, the **Barangay Secretary**, and one **resident** account |
| ⚠️ The existing complaint `CMP-2026-FFZYAX` **cannot** be used for the KP demo | it is already screened `close_without_kp_process`, and `open_kp_case` requires `proceed_to_kp_process`. A confirmed screening is immutable. **File a fresh complaint** for flow A |

---

## Flow A — complaint → screening → KP case → hearing → summons

### 1. One complaint that will proceed to KP (as the resident)

- `/resident?tab=complaints` → **File a Complaint**
- Category: **Noise** (or Boundary dispute)
- What happened: two or three generic sentences. No real names.
- Where: something broad — *"Near the covered court"*
- Add **one respondent**, a fictional name, and a contact number
- ⚠️ **Write down the `CMP-` reference**, and the resident's own contact
  number: you need both for the public tracking page in step 9

### 2. The screening (as the **Barangay Secretary**)

- Official Portal → **Complaints** → open the complaint
- In **KP review screening**, answer the six questions. For a case that
  should proceed, answer **No** to the four exclusion questions; leave one
  as **Unknown / needs verification** if you want to show the third answer
- Recommendation: **Proceed with the barangay KP process**
- Save. The complaint moves to **Under barangay review**

⚠️ The Secretary **cannot** confirm her own screening — the Confirm control
is not rendered for her, and the database refuses it. That is the demo
point, not a bug.

### 3. The confirmation (as the **Punong Barangay**)

- Same complaint → **Confirm**, outcome **Proceed with the barangay KP
  process**
- The complaint moves to **Reviewed by the barangay**

### 4. Open the KP case (as the **Punong Barangay**)

- The **Open a KP case** form appears only now. Before confirmation the
  panel shows a sentence instead of a form.
- Add a short opening note

### 5. One hearing, and the summons

- **Schedule a proceeding**: Mediation, a date about a week out, 10:00 AM,
  Barangay Hall
- The case moves from **Open** to **In process**
- Record **attendance** for both parties, then **minutes**
- Record **one outcome**. ⚠️ **If you want to show a CONCLUDED case, tick
  "this concludes the case" when you record the outcome** — an outcome
  cannot be re-recorded afterwards, so a case left in process can only be
  concluded through another hearing. This is recorded under *Known gaps*.
- Open the **summons / hearing notice** preview and print it (or Save as
  PDF). ⚠️ It is a **SYSTEM TEMPLATE** and says so on the page and on the
  paper — the barangay has supplied no real form

---

## Flow B — incident → blotter → Tanod → maps → analytics

### 6. Two Tanod members (as the **Secretary** or **Punong Barangay**)

- Official Portal → **Tanod Operations** → add two, e.g. *Pedro Reyes* and
  *Ana Cruz*, with broad area notes
- ⚠️ A Tanod is a **record, not an account**. The page says so: no email,
  no password, no login, and nobody is tracked

### 7. Two patrol assignments

- Same tab → schedule one **roving** and one **static** assignment for
  today, with area labels like *Rizal Street* and *Main Road*
- ⚠️ Use the **same wording** as the incident locations in step 8 if you
  want the coverage comparison to line up — the areas are free text on both
  screens, which is exactly why the page carries a caveat about it

### 8. Three to five incidents (Official Portal → **Incidents & Blotter**)

⚠️ **At least two must share a location label and sit close together**, or
the hotspot analytics and the public map will have nothing to show. The
public map needs **two or more incidents within about 220 m** before it will
draw a circle at all.

| # | Type | Location | Coordinates | Note |
|---|---|---|---|---|
| 1 | Traffic accident | Rizal Street | pick a point | attribute **Tanod 1** |
| 2 | Disturbance | Rizal Street | **very close to #1** | ← this pair makes a hotspot and one public circle |
| 3 | Physical altercation | Main Road | a point ~1 km away | alone, so the public map **suppresses** it |
| 4 | Public safety hazard | Main Road | **close to #3** | optional — a second public circle |
| 5 | Other | anywhere | **leave coordinates blank** | counted everywhere, plotted nowhere |

Each one creates its **blotter entry in the same action** — the `BLT-`
reference appears on the row.

### 9. What to show, in order

| Surface | What it should show |
|---|---|
| **Incidents & Blotter** | all 5, each with an `INC-` and a `BLT-` reference |
| **Safety Map & Analytics** (official) | **precise** points, with the location label in each popup |
| ...its analytics | counts by type, by month, repeated locations, coverage gaps |
| **`/community-safety`** (public, sign out first) | **1–2 circles**, not 5 — and the circle sits at an area centre, not on an incident |
| ...its counts | *Incidents recorded* = 5, *Areas shown* = 1 or 2, *Incidents inside those areas* = 2 or 4 |
| ...the gap | the page explains in words why some are not shown |
| **`/track-complaint`** | the `CMP-` reference **plus the contact number** from step 1 |

---

## What the demo should NOT be able to show

Worth having ready, because these are the design points:

- Sign out and open `/community-safety`: **no narrative, no reference, no
  street name, no status, no Tanod, no complaint** — and incident #3,
  alone at its location, has no circle at all
- Sign in as an ordinary **Kagawad** and open Complaints: the **queue** is
  there, the **detail** is one neutral sentence
- The same Kagawad on Incidents & Blotter: the queue is there, the records
  actions are **absent** rather than greyed out
