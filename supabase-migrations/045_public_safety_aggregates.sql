-- ============================================================================
-- 045_public_safety_aggregates.sql
--
-- Final Integration — the PUBLIC Community Safety Map's data surface.
--
-- STATUS: APPLIED 2026-10-17, through the Supabase connector.
-- Verified by calling every function as `anon`, as a resident, as the nurse
-- and as each official, inside blocks that always end in RAISE EXCEPTION.
-- Results in CLAUDE.md under *Public Community Safety Map (Final
-- Integration)*.
--
-- ─── ⚠️ THESE ARE THE ONLY FUNCTIONS IN THIS PROJECT THAT READ `incidents`
--         WITHOUT AN OFFICIAL GATE ───────────────────────────────────────────
--
-- Every other reader of `incidents` opens with
-- `WHERE public.current_official_is_active()`. The four below deliberately do
-- not, because the whole point is that a resident or a passer-by can read
-- them with no account at all. That makes their RETURN TYPES the entire
-- security boundary, and it is why each one returns integers and derived
-- numbers and NOTHING ELSE.
--
-- What a caller of these functions can NEVER obtain, by construction rather
-- than by filtering:
--
--   * an incident narrative          -- no function here selects `narrative`
--   * an incident reference          -- nor `reference`
--   * a location LABEL               -- nor `location_text`, see below
--   * a free-text area note          -- nor `area_note`
--   * who recorded it                -- nor `recorded_by`
--   * when exactly it happened       -- the finest time grain is a MONTH
--   * an incident's own id           -- nothing here returns a uuid
--   * a status                       -- deliberately omitted, see below
--   * an EXACT coordinate            -- see the aggregation rule below
--   * anything about a complaint, a KP screening, a KP case or a hearing
--   * anything about a Tanod, a patrol area or a patrol schedule
--   * anything about the blotter
--
-- ⚠️ `incident_map_points()` IS NOT REUSED AND MUST NOT BE. That function
-- returns the exact latitude and longitude, the reference, the type, the
-- location text and the timestamp of ONE incident. It is the Official
-- Portal's map and it stays gated on `current_official_is_active()`. The
-- public surface is a SEPARATE set of functions with a separate shape,
-- because the privacy difference is a difference of COLUMNS, and RLS cannot
-- restrict columns -- the same reason `complaint_queue()` is a function.
--
-- ─── ⚠️ THE AGGREGATION RULE, AND WHY IT IS THIS ONE ────────────────────────
--
-- There are NO official Purok polygons. P2 established that the barangay's
-- own purok names are unconfirmed and that the live data holds 17 off-list
-- spellings, so there is nothing canonical to aggregate INTO. Inventing
-- boundaries and publishing counts against them would publish a shape this
-- project made up, presented to a resident as a barangay subdivision.
--
-- So the aggregation is a plain COORDINATE GRID, which asserts nothing about
-- the barangay's geography:
--
--   1. Each incident's latitude and longitude are floored onto a
--      0.002-degree grid. At this latitude that is a cell roughly 220 m by
--      220 m -- a neighbourhood block, not a household.
--
--   2. ⚠️ THE PUBLISHED COORDINATE IS THE CELL'S CENTRE, NEVER THE MEAN OF
--      THE INCIDENTS IN IT. A mean is a derived precise location: two
--      incidents 30 m apart would publish a point 15 m from both. The cell
--      centre reveals only "somewhere in this square", which is the whole
--      claim being made.
--
--   3. ⚠️ A CELL IS PUBLISHED ONLY WHEN IT HOLDS AT LEAST TWO INCIDENTS.
--      A single incident rendered as a point IS that incident's location,
--      coarsened. Two or more in one cell cannot be told apart, so the
--      point stops being about any one of them. This is what makes a lone
--      sensitive incident unpublishable rather than merely blurred.
--
--   4. The threshold lives in exactly ONE place -- the HAVING clause of
--      `public_safety_zones` -- and `public_safety_overview` COUNTS THAT
--      FUNCTION'S ROWS rather than re-deriving it, so the two can never
--      disagree about which cells are public.
--
-- ⚠️ `location_text` IS NOT PUBLISHED, and that is a deliberate departure
-- worth reading. It is FREE TEXT an official typed at the counter, so it may
-- read "Rizal Street" or it may read "beside the Dela Cruz house". A column
-- that MAY name a private household cannot be assumed safe to publish, and
-- no amount of counting fixes a label that identifies somebody. The public
-- surface therefore reports HOW MANY zones have repeat incidents and never
-- which places they are; the grid cell is the privacy-safe form of the same
-- fact. The Official Portal keeps the labels.
--
-- ⚠️ `status` IS NOT PUBLISHED either. `recorded`/`responding`/`resolved`
-- describes what the barangay is DOING about an incident, which is
-- operational rather than a safety fact a resident needs from a map. It
-- carries no identity and could be added later; it is left out to keep the
-- public surface as small as it can be and still be useful.
--
-- ⚠️ NO TANOD DATA IS PUBLISHED AT ALL -- not a roster, not a name, not a
-- patrol area, not a schedule, not a count of either. The Official Portal
-- compares patrol coverage against incident concentration; publishing even
-- the areas would say where a patrol is and is not, which is an operational
-- fact about the barangay's own people.
--
-- ─── WHAT IS PUBLISHED ──────────────────────────────────────────────────────
--
--   public_safety_overview(from, to)      total / mapped / zone counts
--   public_safety_type_counts(from, to)   the seven operational categories
--   public_safety_zones(from, to)         grid cells with >= 2, centres only
--   public_safety_monthly(from, to)       one row per calendar month
--
-- ⚠️ `incident_type` IS an operational category and not an offence code --
-- 044's own rule, and the frontend labels say so in words. A count of
-- "Physical altercation" carries no location, no date finer than the
-- requested period and no person, so it cannot be joined back to an
-- incident. The three published surfaces are deliberately NOT joinable:
-- the type counts carry no place, the zones carry no type and no date, and
-- the monthly totals carry no place and no type.
--
-- ─── EXECUTE GRANTS ─────────────────────────────────────────────────────────
--
-- Migration 038's lesson applied at creation: PostgreSQL's own function
-- default adds a bare PUBLIC entry on top of `pg_default_acl`'s named
-- grants, so revoking the named roles alone would leave
-- `has_function_privilege('anon', ...)` TRUE through PUBLIC. Every revoke
-- below names `public` explicitly, and the named grants are then added back
-- for the two roles that need them.
--
-- `public_safety_coarsen` is granted to NO client role. It is called only
-- from inside the SECURITY DEFINER functions above it, and migration 034
-- measured that a nested call inside a SECURITY DEFINER function is checked
-- as the DEFINER rather than as the original caller -- the same fact 044's
-- three reference helpers rely on.
-- ============================================================================


-- ─── The grid ───────────────────────────────────────────────────────────────
--
-- ⚠️ THE GRID SIZE LIVES HERE AND NOWHERE ELSE. Both the cell key and the
-- published centre come out of this one function, so a cell's identity and
-- its coordinate cannot drift apart. Returns the CENTRE of the cell the
-- value falls in: floor to the grid, then add half a cell.
create or replace function public.public_safety_coarsen(p_value numeric)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  SELECT round((floor(p_value / 0.002) * 0.002) + 0.001, 6);
$function$;

comment on function public.public_safety_coarsen(numeric) is
  'Final Integration: rounds one coordinate onto the 0.002-degree public '
  'safety grid and returns the CENTRE of that cell, never the input. The '
  'grid size lives only here.';


-- ─── Published zones ────────────────────────────────────────────────────────
--
-- ⚠️ NO `current_official_is_active()` GATE, DELIBERATELY -- this is the
-- public surface. The security property is the return type: a derived cell
-- key, the cell's centre, and a count. No reference, no type, no date, no
-- label, no id.
--
-- ⚠️ `HAVING count(*) >= 2` IS THE PRIVACY THRESHOLD AND ITS ONLY HOME.
-- A cell holding one incident is that incident's location and is never
-- returned.
create or replace function public.public_safety_zones(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (zone_key text, center_latitude numeric,
               center_longitude numeric, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT
    public.public_safety_coarsen(i.latitude)::text || ','
      || public.public_safety_coarsen(i.longitude)::text,
    public.public_safety_coarsen(i.latitude),
    public.public_safety_coarsen(i.longitude),
    count(*)::int
  FROM public.incidents i
  WHERE i.latitude IS NOT NULL
    AND i.longitude IS NOT NULL
    AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY 1, 2, 3
  HAVING count(*) >= 2
  ORDER BY count(*) DESC, 1 ASC;
$function$;


-- ─── Period overview ────────────────────────────────────────────────────────
--
-- ⚠️ `mapped_incidents` and `zone_count` BOTH read `public_safety_zones`
-- rather than re-deriving the threshold, so the number the page prints and
-- the cells the map draws come from one definition. The same rule
-- `useNotifications` follows for unread and the safety-map caption follows
-- for "plotted".
create or replace function public.public_safety_overview(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (total_incidents integer, mapped_incidents integer,
               zone_count integer)
language sql stable security definer set search_path to '' as $function$
  SELECT
    (SELECT count(*)::int
       FROM public.incidents i
      WHERE (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
        AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)),
    (SELECT coalesce(sum(z.total), 0)::int
       FROM public.public_safety_zones(p_from, p_to) z),
    (SELECT count(*)::int
       FROM public.public_safety_zones(p_from, p_to) z);
$function$;


-- ─── Broad type counts ──────────────────────────────────────────────────────
--
-- ⚠️ NO LOCATION AND NO DATE in the output, which is what keeps this
-- unjoinable to the zones. `incident_type` is 044's closed operational
-- vocabulary, not free text and not an offence code.
create or replace function public.public_safety_type_counts(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (incident_type text, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT i.incident_type, count(*)::int
  FROM public.incidents i
  WHERE (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY i.incident_type
  ORDER BY count(*) DESC, i.incident_type ASC;
$function$;


-- ─── Monthly totals ─────────────────────────────────────────────────────────
--
-- ⚠️ A MONTH IS THE FINEST TIME GRAIN THIS SURFACE PUBLISHES. A day would
-- narrow an incident to one date, which with a zone would be most of the way
-- to identifying it. The month key is computed in Asia/Manila, as every
-- other date rule in this project is.
create or replace function public.public_safety_monthly(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (month_key text, total integer)
language sql stable security definer set search_path to '' as $function$
  SELECT to_char((i.occurred_at AT TIME ZONE 'Asia/Manila'), 'YYYY-MM'), count(*)::int
  FROM public.incidents i
  WHERE (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
    AND (p_to   IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  GROUP BY 1
  ORDER BY 1 ASC;
$function$;


-- ─── Grants ─────────────────────────────────────────────────────────────────

revoke execute on function public.public_safety_coarsen(numeric)          from public, anon, authenticated;
revoke execute on function public.public_safety_zones(date, date)         from public;
revoke execute on function public.public_safety_overview(date, date)      from public;
revoke execute on function public.public_safety_type_counts(date, date)   from public;
revoke execute on function public.public_safety_monthly(date, date)       from public;

grant execute on function public.public_safety_zones(date, date)          to anon, authenticated;
grant execute on function public.public_safety_overview(date, date)       to anon, authenticated;
grant execute on function public.public_safety_type_counts(date, date)    to anon, authenticated;
grant execute on function public.public_safety_monthly(date, date)        to anon, authenticated;
