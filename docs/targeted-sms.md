# Targeted resident SMS (iProgSMS)

## Rollout status

Prepared only: `058_targeted_sms.sql` and `supabase/functions/send-sms-broadcast/index.ts`.
No migration has been applied, no function deployed, no live SMS sent by this implementation.
The existing reservation SMS function is unchanged.

After review, the project owner must manually apply **058** after 057 and deploy the **send-sms-broadcast** Edge Function with its `_shared/smsProvider.js` dependency. Do not edit/reapply historical migrations.

Server environment:

- `IPROG_SMS_API_TOKEN`: existing secret name; server only. Never put its value in React, tables, source control, URLs or logs.
- `SMS_BROADCASTS_LIVE_ENABLED`: defaults disabled unless exactly `true`. Enable only after the owner approves rollout and a controlled test using a project-owned phone.
- Standard Supabase Edge runtime secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The service key is used only server-side to execute private worker RPCs; it is never sent to React.

Dry runs work through guarded database RPCs without the sender function or provider token. Publishing with the SMS checkbox off continues using the existing content writes. An unchanged/default audience requires no SMS RPC write. Audience-setting failures after a successful publication are reported separately and never undo or misreport the published source.

## Existing architecture and authorization

The authoritative population is `barangay_residents`, not the Voter Reference List or online-account population. Active directory residents can participate without `profile_id`. No name matching, voter joins, profile creation, inferred medical eligibility, complaints, or incidents are used.

Migration 036 allows the `official` profile role to manage announcements/events and the `nurse` role to manage health events; existing program management and the 017 Nurse audit rules use that same Nurse role. The new guard mirrors those permissions. It deliberately does not use Secretary/Punong-only resident-record administration permissions to grant Nurses general directory access.

New tables have RLS enabled, no policies and no direct PUBLIC/anon/authenticated/service-role privileges. Guarded RPCs return counts/configuration/history, never recipient lists or bulk phones. The worker RPCs grant EXECUTE only to service_role and recheck the verified initiating actor/source role. Edge authentication uses `auth.getUser()`, not a browser flag or publishable key alone.

## Audiences

- All Residents: active directory records, including missing DOB.
- Senior Citizens (60+): age >=60 from recorded DOB at the current **Asia/Manila calendar date**; exactly 60 included, tomorrow's birthday excluded, NULL/future DOB excluded. This user-confirmed rule is SMS audience selection only, not legal benefit eligibility, citizenship proof or OSCA registration.
- Age Range: explicit inclusive minimum/maximum ages (0–150 validation bounds), using PostgreSQL calendar `age(date,birth_date)` rather than birth year alone.
- Specific Purok: exact stored value selected from distinct active directory values. No invented Purok list or fuzzy matching.

Missing/invalid DOB exclusions are shown separately for age audiences. Missing phones, invalid phones and duplicate normalized destinations are counted separately. Only structurally recognized `09XXXXXXXXX`, `+639XXXXXXXXX` and `639XXXXXXXXX` forms normalize to `639XXXXXXXXX`; whitespace/parentheses/hyphens are allowed, arbitrary letters are not discarded. Format validity is not evidence a number is active or owned by the resident.

The pre-existing proposed demo seed remains separate and unchanged: all 30 demo phone fields are NULL. It is not applied by this work. No real or fabricated phones are inserted into the directory by the SMS implementation.

## Four-module workflows

Announcements, Events, Health Events and Medical Programs share `SmsComposer` and `SmsHistory`.

1. Choose an SMS audience. Existing Health Event `target_audience` remains a public descriptive note, explicitly labeled as not used for SMS selection. It is never parsed into eligibility.
2. SMS is off by default. Preview the exact server-built public-content message and counts; no provider call occurs.
3. Check the explicit message/destination confirmation, then Save/Publish & Send. Source validation/publication happens first. Only successful source persistence can create the broadcast. SMS failure does not undo publication.
4. Existing content edits never resend automatically. Separately enable/preview/confirm an update. Published-source SMS management supports manual reminders for Events/Health Events/Programs and schedule updates for Programs. There are no recurring jobs or scheduled sends.
5. Dry runs on saved content create a distinct history snapshot labeled **Dry run - no SMS sent**. New drafts can preview without sending; save first to record a dry run.
6. History shows accepted, failed, unknown/in-flight, skipped, pending and dry-run counts without phone numbers. The initiating user can resume the same queued broadcast; other authorized staff can view source history.

Message bodies use only public title/description or date/location/schedule fields, cap source text length and append a website-details prompt. No additional barangay account header is prepended. Provider-side headers/encoding can increase segments/credits; no exact credit quote is claimed. Public source visibility is unchanged by the SMS audience.

## Storage and safe retries

- `sms_source_rules`: one private audience rule per source type/ID.
- `sms_broadcasts`: immutable request key, source, action, audience, exact message, preview token, initiator, mode and creation time.
- `sms_broadcast_recipients`: resident FK, normalized destination snapshot, status, sanitized reason, provider message ID, attempted/completed times.

The four pre-existing source tables have different legacy identity/schema histories. Their polymorphic source key is stored as text, validated against a fixed server-side table whitelist (`id::text`); it is not a pretend cross-table FK. Recipient and actor relationships use real UUID FKs with RESTRICT. Source deletion cannot cascade through SMS audit snapshots.

Preview tokens cover the normalized audience, Manila day, exact message and ordered recipient snapshot. Changed content/recipient data requires preview and confirmation again. Preparation creates broadcast, recipients, saved rule and high-level activity atomically. A stable request UUID handles browser retries; live initial notifications also have a source-level unique constraint. Reusing a request UUID with different content parameters is rejected.

Phone duplicates are ranked by resident UUID; a destination appears at most once per broadcast. Limits are 2,000 eligible residents per broadcast and five durable claims per worker invocation. Larger audiences must be narrowed explicitly.

A worker claim commits `attempting` **before** contacting iProg. Only pending recipients can be claimed (`FOR UPDATE SKIP LOCKED`). Before subsequent batches/resumes, changed eligibility/phone data is excluded; new residents are never silently added to a confirmed snapshot. Changed source message text stops processing for review.

**Exactly-once delivery cannot be guaranteed across a remote provider without provider-supported idempotency.** This implementation favors avoiding duplicate charges/messages: timeout, malformed response, persistence failure, or a crashed worker can leave an unknown/attempting result that is never automatically resent. Review with the provider before intentionally creating another notification. There is no automatic retry of failed/unknown recipients.

The iProg request is POST JSON to `https://iprogsms.com/api/v1/sms_messages` with token, phone_number and message in the body only. A valid HTTP success plus application status 200 and a message_id means **accepted/queued**, not delivered. Explicit rejection is failed; ambiguous outcomes are unknown. Raw provider replies/status URLs are neither persisted nor returned/logged. Delivery callbacks/polling are not implemented, and the UI does not claim delivery.

High-level initiation/completion uses existing `activity_log` action `edited` and the existing source entity vocabulary, preserving the actual 017 actor-stamping rules. No per-recipient activity spam is added. If a worker crashes, there may be no completion event; durable recipient status remains the review evidence. Zero-destination and dry-run histories require no provider invocation.

## Verification and manual review

- `npm test -- --watchAll=false --runInBand src/sms`
- `node scripts/test-targeted-sms.cjs` with `PGLITE_TEST_MODULE` pointing to the existing isolated PGlite runtime.
- `node scripts/test-sms-edge.cjs` parses/executes the actual Edge handler with injected authentication, database and provider mocks. No Deno deployment or network call occurs.
- `npm test -- --watchAll=false`, `npm run build`, `git diff --check`.

SQL tests execute 058 against minimal local source/profile fixtures, the actual 054 table definition and actual 017 activity actor trigger. Fixtures include UUID and numeric legacy source IDs. They cover access denial, all/Senior/age/Purok audiences, normalization, deduplication, no-op request retries, stale previews, initial uniqueness, worker claims, unknown outcomes, revalidation and atomic audit rollback. This is not a claim of live PostgREST/Edge deployment verification.

Not added: automatic/recurring reminders, delivery webhooks, legal-benefit determinations, pregnancy/diagnosis targeting, targeted in-app bell expansion, or general Nurse directory access. Existing in-app/public content behavior remains intact.
