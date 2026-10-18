-- Preserve the reader signature. top_type is display data: a canonical key for
-- one winner, or sorted canonical keys separated by ' / ' for tied winners.
create or replace function public.incident_location_frequency(
  p_from date DEFAULT NULL, p_to date DEFAULT NULL)
returns table (location_key text, location_label text, total integer,
               with_coordinates integer, centroid_latitude numeric,
               centroid_longitude numeric, top_type text)
language sql stable security definer set search_path to '' as $function$
  WITH source AS (
    SELECT lower(btrim(regexp_replace(i.location_text, '\s+', ' ', 'g'))) AS location_key,
           i.location_text, i.latitude, i.longitude, i.incident_type
    FROM public.incidents i
    WHERE public.current_official_is_active()
      AND (p_from IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date >= p_from)
      AND (p_to IS NULL OR (i.occurred_at AT TIME ZONE 'Asia/Manila')::date <= p_to)
  ), type_counts AS (
    SELECT location_key, incident_type, count(*) AS type_total
    FROM source
    GROUP BY location_key, incident_type
  ), winners AS (
    SELECT t.location_key, t.incident_type
    FROM type_counts t
    WHERE t.type_total = (
      SELECT max(c.type_total) FROM type_counts c WHERE c.location_key = t.location_key
    )
  ), top_types AS (
    SELECT location_key,
           string_agg(incident_type, ' / ' ORDER BY incident_type COLLATE "C") AS top_type
    FROM winners
    GROUP BY location_key
  )
  SELECT s.location_key, min(s.location_text) AS location_label,
         count(*)::int AS total, count(s.latitude)::int AS with_coordinates,
         round(avg(s.latitude), 6) AS centroid_latitude,
         round(avg(s.longitude), 6) AS centroid_longitude, t.top_type
  FROM source s
  JOIN top_types t ON t.location_key = s.location_key
  GROUP BY s.location_key, t.top_type
  ORDER BY count(*) DESC, s.location_key ASC;
$function$;

revoke execute on function public.incident_location_frequency(date, date) from public, anon;
grant execute on function public.incident_location_frequency(date, date) to authenticated;
