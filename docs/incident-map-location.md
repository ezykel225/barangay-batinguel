# Existing incident map location

Migration `057_incident_map_location.sql` is prepared, **not applied**. After reviewing it, apply it manually through the normal migration process before using Add/Edit map location. No changes to migrations 001–056 are required.

`set_incident_map_location(p_incident_id uuid, p_latitude numeric, p_longitude numeric)` returns only the stored latitude/longitude. It checks the existing linked Secretary/Punong records-administration helper, locks the incident, requires a valid coordinate pair, and updates only latitude, longitude and updated_at. The existing references, narrative, location description, area note, status, attribution and blotter snapshot are preserved. It cannot clear coordinates.

An actual change appends an `amended` blotter-history entry in the same transaction. Audit failure rolls back the update. Repeating the same stored six-decimal coordinates does not change updated_at or append history. No client table privileges or public map queries are changed.

The existing Incident Details dialog contains an inline Leaflet picker. Clicking the map, selecting its center after keyboard panning, or optional one-shot device GPS only changes the draft. Save confirms it; Cancel discards it. The incident queue/detail are refetched with current filters and valid pagination preserved. The existing Safety Map includes the same incident on its next normal fetch/remount; no realtime synchronization is added. Public map aggregation/privacy remains unchanged.

## Validation

- Jest: `npm test -- --watchAll=false --runInBand src/incidents src/safetymap`
- Build: `npm run build`
- Isolated PostgreSQL/WASM: set `PGLITE_TEST_MODULE` to an installed `@electric-sql/pglite` module directory, then run `node scripts/test-incident-map-location.cjs`.

The SQL test script never connects to Supabase or reads .env. It executes actual 044 incident table definitions/privacy grants, the 031 linked-position helper, 044 records helpers/map reader, and 057 against minimal local identity fixtures. It covers authorized/denied callers, validation, preservation, retries, audit rollback and next-query map inclusion. This is an isolated database test, not a live PostgREST deployment check.
