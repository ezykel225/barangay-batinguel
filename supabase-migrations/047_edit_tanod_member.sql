-- Edit roster details in place; active state and related records are untouched.
create or replace function public.update_tanod_member(
  p_tanod_id uuid, p_full_name text,
  p_area_note text DEFAULT NULL, p_display_order integer DEFAULT 0)
returns void language plpgsql security definer set search_path to '' as $function$
DECLARE v_uid uuid := auth.uid(); v_name text := btrim(COALESCE(p_full_name, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to do that.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.current_official_may_administer_records() THEN
    RAISE EXCEPTION 'Only the Barangay Secretary or the Punong Barangay can manage the Tanod roster.' USING ERRCODE = 'P0001';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'A Tanod needs a name.' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.tanod_members
  SET full_name = v_name,
      area_note = NULLIF(btrim(COALESCE(p_area_note, '')), ''),
      display_order = COALESCE(p_display_order, 0),
      updated_at = now()
  WHERE id = p_tanod_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That Tanod is not on the roster.' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

revoke execute on function public.update_tanod_member(uuid, text, text, integer) from public, anon;
grant execute on function public.update_tanod_member(uuid, text, text, integer) to authenticated;
