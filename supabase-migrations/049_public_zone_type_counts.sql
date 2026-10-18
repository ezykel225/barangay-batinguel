-- Counts only for cells already published by the unchanged 045 reader.
-- Singleton category names never leave this function: NULL denotes the
-- combined "Other recorded incidents" bucket, including singleton 'other'.
create or replace function public.public_safety_zone_type_counts(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (zone_key text, incident_type text, total integer)
language sql stable security definer set search_path to '' as $function$
  WITH published AS (
    SELECT z.zone_key FROM public.public_safety_zones(p_from, p_to) z
  ), source AS (
    SELECT public.public_safety_coarsen(i.latitude)::text || ','
             || public.public_safety_coarsen(i.longitude)::text AS zone_key,
           i.incident_type
    FROM public.incidents i
    WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
      AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
      AND (p_to IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  ), type_counts AS (
    SELECT s.zone_key, s.incident_type, count(*) AS type_total
    FROM source s JOIN published p ON p.zone_key = s.zone_key
    GROUP BY s.zone_key, s.incident_type
  ), safe_buckets AS (
    SELECT t.zone_key,
           CASE WHEN t.type_total >= 2 THEN t.incident_type ELSE NULL END AS incident_type,
           t.type_total
    FROM type_counts t
  )
  SELECT b.zone_key, b.incident_type, sum(b.type_total)::int AS total
  FROM safe_buckets b
  GROUP BY b.zone_key, b.incident_type
  ORDER BY b.zone_key ASC, b.incident_type COLLATE "C" ASC NULLS LAST;
$function$;

revoke execute on function public.public_safety_zone_type_counts(date, date) from public;
grant execute on function public.public_safety_zone_type_counts(date, date) to anon, authenticated;
