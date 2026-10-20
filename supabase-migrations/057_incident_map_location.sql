-- NOT APPLIED. Authorized coordinate corrections for existing incidents only.
-- Requires 044 incident/blotter foundation; no table grants or map-query changes.
begin;
create function public.set_incident_map_location(
  p_incident_id uuid, p_latitude numeric, p_longitude numeric)
returns table(latitude numeric, longitude numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_old_lat numeric; v_old_lng numeric;
  v_lat numeric(9,6); v_lng numeric(9,6);
  v_blotter_id uuid;
begin
  if v_uid is null or not public.current_official_may_administer_records() then
    raise exception 'Only the Barangay Secretary or the Punong Barangay can change an incident map location.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'Both map coordinates are required.' using errcode = '22023';
  end if;
  if not (p_latitude between -90 and 90) or not (p_longitude between -180 and 180) then
    raise exception 'Map coordinates are outside the valid range.' using errcode = '22023';
  end if;
  -- Compare the same precision stored by the table, including retries.
  v_lat := p_latitude; v_lng := p_longitude;
  select i.latitude, i.longitude into v_old_lat, v_old_lng
    from public.incidents i where i.id = p_incident_id for update;
  if not found then
    raise exception 'That incident does not exist.' using errcode = 'P0002';
  end if;
  if v_old_lat is not distinct from v_lat and v_old_lng is not distinct from v_lng then
    return query select v_lat::numeric, v_lng::numeric;
    return;
  end if;
  select b.id into v_blotter_id from public.blotter_entries b where b.incident_id = p_incident_id;
  if not found then
    raise exception 'That incident has no blotter entry.' using errcode = 'P0002';
  end if;
  update public.incidents i set latitude = v_lat, longitude = v_lng, updated_at = now()
    where i.id = p_incident_id;
  insert into public.blotter_entry_history(blotter_entry_id, action, note, actor_profile_id)
    values(v_blotter_id, 'amended',
      case when v_old_lat is null then 'Incident map location added.' else 'Incident map location updated.' end,
      v_uid);
  return query select v_lat::numeric, v_lng::numeric;
end;
$$;
revoke all on function public.set_incident_map_location(uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.set_incident_map_location(uuid,numeric,numeric) to authenticated;
commit;
