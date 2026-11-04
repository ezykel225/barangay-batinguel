# Community Credit frontend and release checks

`CreditGauge` is shared by Resident Portal, the official resident score overview,
and Unified Resident Profile through `CreditProfile`. Its score is the profile
RPC's `current_score`; missing values never become a sample score. SVG arc
geometry is bounded for display without changing the displayed server value.

Only `policy_model = participation_v2` is labeled V2. Missing model metadata is
treated as the legacy V1 response. Unlinked, unconfigured, unenrolled and denied
states do not invent scores or records. The official overview waits for a
resident selection rather than inventing an aggregate or sample score.

The new official workflows call migration-067 RPCs for policy/rule preparation
and independent approval, activity creation, verification, award, reversal,
re-award and correction review. No V2 activation RPC is exposed. Existing V1
controls remain available for V1, and cannot activate a V2 draft. Server-side
authorization, independent approval, eligibility and cap checks remain decisive.
Request-based workflows retain their request UUID on unchanged retries.
Resolving a correction request does not automatically change points.

V2 RPCs may be absent from the current database. In that case the interface
reports that workflows are unavailable and retains the working V1 score/ledger.
Do not apply migrations or activate V2 merely to make this page render.

## Release checklist

- [ ] Verify real authenticated Resident, records-administrator and unauthorized-account views.
- [ ] Verify Community Credit at 320, 375, 414, 768, 1024, 1280, 1440 and 1920px.
- [ ] Check SVG, tables, workflow forms, keyboard focus, touch controls and error states.
- [ ] Exercise V2 writes only in an authorized isolated environment, with synthetic fixtures.
- [ ] Complete a separate project-wide responsive pass before release: all retained public pages,
  Resident Portal/navigation, every active Official Dashboard tab, Unified Resident Profile,
  Document Requests, Complaints/KP, Incidents/Blotter, Tanod Operations, Community Credit,
  Safety Map/Analytics, Announcements, Events, Officials, and shared components.
- [ ] At every required width, verify no unintended page overflow, clipping, overlapping content,
  inaccessible actions, unusable tables/charts/maps, or oversized dialogs/forms.
- [ ] Verify keyboard/focus behavior, touch access, feature parity and unchanged permissions.
- [ ] Obtain separate authorization before production changes, merges or deployment.

Real-browser viewport checks remain pending when browser automation is blocked;
passing Jest or a build is not evidence of rendered responsiveness.
