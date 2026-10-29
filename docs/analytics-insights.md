# Analytics & Insights

Phase 4 provides deterministic, read-only analytics for active linked officials. Analytics identify factual patterns in verified linked barangay records, such as frequency, role, outcome, category, location and time. They do not predict future behavior or determine wrongdoing.

## Matter counting

- An incident and its linked blotter entry are one matter: `incident:<incident_uuid>`.
- A complaint and its linked KP case are one matter chain: `complaint:<complaint_uuid>`.
- Relationships through `incident_case_links` remain visible, but do not turn related rows into extra matters.
- Person attribution requires an explicit resident UUID or external-person UUID. Names, telephone numbers, addresses and narrative text are never used to infer identity.

## Definitions and filters

Roles and outcomes retain their recorded meanings. In particular, `closed` means procedural closure and is not substantiation. Date, category and general-area filters are applied server-side. The Safety Map sends its active date and incident-type filters to the analytics RPC so the map and adjacent insights describe the same incident set.

Person analytics show distinct linked matters, roles, outcomes, recorded categories and general areas, weekdays, four-hour time buckets, monthly trends, and comparable twelve-month counts. Each important breakdown can reveal its contributing matter references. Coverage text states that results are based on verified links; unlinked historical records are not silently treated as zero or assigned to a person.

Time windows are defined by the server as all records, last 30 days, last 90 days, last 12 months, previous 12 months, or a custom Manila calendar-date range. Current and previous twelve-month windows meet at an exclusive boundary and do not overlap. Incident timestamps use `incidents.occurred_at`; complaint/KP matters use `complaints.created_at`; enrollment uses `community_credit_enrollments.started_at`. A matter before enrollment is historical, while a matter at or after enrollment is post-enrollment.

Every person breakdown and historical-review notice carries authoritative matter keys and display references for drill-down. Explicit `incident_case_links` remain two authoritative matter keys but include related incident, complaint and KP references so the relationship is visible without collapsing the records.

## Historical Records Review

For an enrolled Batinguel resident, only distinct pre-enrollment matters with an incident `respondent`/`subject` role or an explicitly linked complaint `respondent` role qualify. Victim, witness, reporting-party and complainant roles do not qualify. The Historical Records Review card is absent for zero through five matters and appears only when the count is greater than five. These historical records do not affect the resident's starting Community Credit score of 100. The query creates no credit event and performs no score or enrollment mutation. External people do not receive Community Credit review analytics.

## Privacy and authorization

Individual, repeat-person and repeated-dispute analytics are exposed only through `SECURITY DEFINER` RPCs with an empty search path and the existing active-official guard. Base-table grants are not expanded. Anonymous users, residents, unlinked officials and archived officials cannot enumerate these analytics. The public Community Safety surface remains aggregate and contains no person analytics, names, scores, parties or histories.

## Community Credit scope

The reports workspace shows only active-policy facts: enrolled residents, starting/current score distributions, residents with events, and event totals. Retired policy periods are excluded. It does not show invented deduction, repair or appeal metrics. The approved 100 / 0 / 100 model is unchanged. Incident category and area filters are explicitly scoped to incident analytics; complaint/KP and Community Credit sections say that those filters do not apply.

## Why this is analytics, not prediction

All outputs are counts, distributions, comparisons and links to the underlying recorded matters. There is no model, risk score, guilt probability, clustering, diagnosis, sentiment analysis or forecast. Neutral indicators invite record review; they never label a person dangerous, suspicious or likely to offend.
