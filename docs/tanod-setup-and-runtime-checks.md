# Tanod portal: manual setup and runtime verification

Migrations 052 and 053 are local drafts. No database changes or account provisioning
were performed by this implementation. Preserve the already-applied 001–051 files.

## Manual setup

Before applying 052 to any externally reachable environment, authorized staff must
review existing roster display names and active assignment `area_label` values for
public use. These labels were previously internal. Remove any household addresses,
routes, personal contacts or internal notes through authorized administration before
publication. The public reader becomes callable immediately when 052 is applied.

This is a required manual publication gate, not automatic sanitization. Review every
`tanod_members.full_name` and every distinct assignment `area_label`, including inactive
and future assignments that might later become visible. Do not apply 052 until the
values are approved for public display. No migration rewrites names or labels.

Run this read-only query manually as authorized administration before applying 052.
Its UUIDs/statuses are administrator audit context only, never public RPC fields:

```sql
WITH names AS (
  SELECT 'Tanod name'::text AS review_kind, t.full_name AS public_value,
         jsonb_build_object(
           'tanod_id', t.id, 'member_active', t.active,
           'display_order', t.display_order
         ) AS administrator_context
  FROM public.tanod_members t
), areas AS (
  SELECT 'Assignment area'::text AS review_kind, a.area_label AS public_value,
         jsonb_build_object(
           'assignments', jsonb_agg(jsonb_build_object(
             'assignment_id', a.id, 'tanod_id', t.id,
             'member_name', t.full_name, 'member_active', t.active,
             'assignment_active', a.active, 'assignment_date', a.assignment_date,
             'start_time', a.start_time, 'end_time', a.end_time
           ) ORDER BY a.assignment_date, a.id)
         ) AS administrator_context
  FROM public.tanod_assignments a
  JOIN public.tanod_members t ON t.id = a.tanod_id
  GROUP BY a.area_label
)
SELECT * FROM (
  SELECT * FROM names
  UNION ALL
  SELECT * FROM areas
) review
ORDER BY review_kind, public_value, administrator_context::text;
```

Installation order is mandatory: **001–051 → 052 → 053**. The fail-fast blocks validate
051's private incident-case link schema/security; 053 also checks 052's role constraint,
private table schemas/keys/defaults, open-attendance uniqueness and identity resolver
security/ACLs. Missing or incompatible prerequisites raise before schema mutations;
they are never silently recreated. Resolve prerequisite drift through reviewed
administration rather than removing the guards. SQL source tests are static contracts,
not PostgreSQL execution tests; validate installation in staging before production.

1. Review and apply **052_tanod_accounts_and_duty.sql**, then
   **053_tanod_incident_access.sql**, first in a staging copy with migrations through 051.
2. Using trusted Supabase administration, create/invite a **new dedicated Auth user**.
   Do not reuse an official, nurse or resident account. Do not put credentials in React.
3. As trusted administration, create the matching `public.profiles` row with its
   `id` equal to that Auth user's UUID, required profile fields, and `role = 'tanod'`.
   Check the actual profile schema/defaults in the dashboard before provisioning.
   Signup metadata alone does not create a Tanod profile; the resident signup trigger
   and resident-only profile INSERT policy deliberately remain unchanged.
4. Sign into the app as the active linked **Barangay Secretary or Punong Barangay**.
   In Tanod Operations → Tanod account links, select the existing roster member and
   explicitly link the provisioned profile UUID. Names/emails do not establish identity.
5. Schedule a timed assignment using existing Tanod Operations controls. Times are
   interpreted in Asia/Manila; an end time at/before the start belongs to the next day.
   Assignments without times remain visible but cannot be checked in. Replace/cancel
   an untimed schedule through existing staff controls if times are needed.
6. Use general, public-safe patrol area labels only: no household addresses,
   personal contacts, patrol routes or internal notes. Active current/upcoming
   assignment names/general areas/times are intentionally published by the new reader.
7. The Tanod uses the existing `/login` → Barangay Personnel tab, then `/tanod`.
   The audience tab does not select or elevate the account's stored role.

## Expected access and privacy

- Active linked Tanod: own shifts/attendance and latest 100 own/relevant attributed
  incident summaries. "Assigned" reuses existing `responded`/`attended` attribution;
  it is not a new dispatch or sensitive-case assignment mechanism.
- Incident submission uses `record_incident` and its normal blotter/history inserts.
  The server derives Tanod ID, reporter, source and attribution; no new incident table.
- Operational follow-ups are append-only with server actor/time. A Tanod sees only
  their own notes on incidents still in scope. Records staff can read these notes
  from the existing incident detail screen.
- KP linkage is a boolean only. Full KP status, minutes, screening, settlement and
  CTFA authority remain restricted. Complaint evidence remains inaccessible.
- The public duty reader returns only display name, general assigned area, scheduled
  shift start/end and scheduled/currently-on-duty state. It never returns UUIDs,
  exact coordinates, internal notes, contact information or case/incident details.
- Public duty information is current/upcoming, independent of historical map filters.
  A schedule alone is never displayed as checked in. Expired shifts are not public
  "currently on duty" even if a checkout was missed.
- Removing a link, changing the stored role or standing down the member prevents
  subsequent operational RPC access. Standing down does not delete history.
- Missed checkouts remain auditable and are not auto-completed. An active member
  must check out the outstanding attendance before checking in to another shift.
  Inactive/unlinked attendance requiring correction needs trusted administrative
  review; no automatic cleanup, invented attendance or continuous GPS is provided.

## Runtime attack matrix (staging only, normal authenticated sessions)

Use dedicated test accounts A/B with different linked roster IDs, an unlinked Tanod,
an inactive Tanod, ordinary official, Secretary, Punong Barangay, nurse and resident.
Do not impersonate auth identities in SQL Editor or print/copy access tokens.
The automated Jest SQL contracts are static checks, **not** PostgreSQL role execution.

| Test | Expected |
| --- | --- |
| Each account signs in using either audience tab | Stored role determines its portal; resident defaults to `/resident`, permitted resident `next` links still work |
| Tanod opens `/official`, `/nurse`, `/resident`; other roles open `/tanod` | Redirect to that account's own portal; no target content |
| Public signup requests metadata role `tanod`; own profile INSERT/UPDATE attempts promotion | No Tanod profile from signup; direct promotion rejected |
| A/B call identity/duty/reports | Own linked identity only; readers accept no Tanod/profile selector |
| Unlinked/inactive/non-Tanod call any Tanod-only mutation | Rejected, no new records |
| A checks in with B's assignment ID | Rejected |
| A checks in without times, outside the shift or on an inactive assignment | Rejected |
| A checks in twice, including concurrent requests or a second overlapping shift | One attendance at most; rejected duplicate adds no audit event |
| A checks out B's attendance, repeats checkout, or submits a client timestamp | Rejected; normal own checkout uses server time |
| A submits an incident with B's Tanod ID or non-reporting attribution | Rejected atomically, no incident/blotter/history partial insert |
| A submits normally | Generated reference, correct recorder/Tanod/source, one blotter and initial history |
| A/B view attributed incidents and try unrelated incident UUIDs in follow-up RPCs | Only own or response/attendance-attributed summaries; unrelated follow-up rejected |
| A posts a valid note, blank/oversized note, then attempts UPDATE/DELETE | Valid append stamped with A and server time; invalid/rewrite requests rejected |
| Tanod directly calls roster/area management, account linking, official incident status, complaint/evidence, screening, KP, clearance approval, registry or nurse administration APIs | Rejected/empty protected read according to the existing contract; no privilege escalation |
| Secretary/Punong link profile already linked to another member, or a non-Tanod profile | Rejected; existing link/history preserved |
| Stand down/unlink A while signed in, then repeat reads/writes and refresh public page | Operational access denied; public page never calls the inactive member currently on duty |
| Anonymous/resident calls public duty RPC | Only five approved columns; no table privileges or private reader execution |
| Scheduled without check-in; checked-in current shift; completed/expired shift | Scheduled; currently on duty; never incorrectly currently on duty |
| Switch Community Safety months | Existing incident aggregates/privacy remain unchanged; duty stays current |
| Phone width, keyboard and permission denial | Four usable tabs, visible focus, no overflow, explicit one-time GPS click and manual fallback |

Verify catalog RLS, ACLs, empty SECURITY DEFINER search paths and authenticated/anon
function grants after application. Also inspect any pre-existing live policies not
represented in the migration files. No incident evidence upload or legal-case powers
are enabled for Tanods. No SMS/email delivery or background location tracking is added.
