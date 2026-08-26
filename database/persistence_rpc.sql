-- Atomic authenticated persistence function for GreenRoute trip history.
-- Runs with caller privileges (SECURITY INVOKER) so RLS still applies.

create or replace function public.save_optimization_run(
  p_origin_label text,
  p_destination_label text,
  p_origin_lon double precision,
  p_origin_lat double precision,
  p_destination_lon double precision,
  p_destination_lat double precision,
  p_vehicle_key text,
  p_load_kg numeric,
  p_fuel_price_per_litre numeric,
  p_departure_time timestamptz,
  p_routing_mode text,
  p_selected_strategy text,
  p_candidates jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run_id uuid;
  v_candidate jsonb;
  v_geometry extensions.geometry(linestring, 4326);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_selected_strategy not in ('fastest', 'balanced', 'greenest') then
    raise exception 'Invalid selected strategy';
  end if;

  insert into public.optimization_runs (
    user_id, origin_label, destination_label, origin, destination,
    vehicle_key, load_kg, fuel_price_per_litre, departure_time,
    routing_mode, selected_strategy
  ) values (
    v_user_id,
    p_origin_label,
    p_destination_label,
    extensions.st_setsrid(extensions.st_makepoint(p_origin_lon, p_origin_lat), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_destination_lon, p_destination_lat), 4326)::extensions.geography,
    p_vehicle_key,
    p_load_kg,
    p_fuel_price_per_litre,
    p_departure_time,
    p_routing_mode,
    p_selected_strategy
  ) returning id into v_run_id;

  for v_candidate in select value from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    v_geometry := null;
    if jsonb_typeof(v_candidate->'coordinates') = 'array' and jsonb_array_length(v_candidate->'coordinates') >= 2 then
      v_geometry := extensions.st_setsrid(
        extensions.st_geomfromgeojson(
          jsonb_build_object('type', 'LineString', 'coordinates', v_candidate->'coordinates')::text
        ),
        4326
      )::extensions.geometry(linestring, 4326);
    end if;

    insert into public.route_candidates (
      optimization_run_id, provider_candidate_id, route_geometry,
      distance_km, duration_minutes, traffic_delay_minutes,
      fuel_litres, fuel_cost, co2_kg, balanced_score, recommended_as
    ) values (
      v_run_id,
      v_candidate->>'candidate_id',
      v_geometry,
      (v_candidate->>'distance_km')::numeric,
      (v_candidate->>'duration_minutes')::numeric,
      coalesce((v_candidate->>'traffic_delay_minutes')::numeric, 0),
      (v_candidate->>'fuel_litres')::numeric,
      (v_candidate->>'fuel_cost')::numeric,
      (v_candidate->>'co2_kg')::numeric,
      nullif(v_candidate->>'balanced_score', '')::numeric,
      coalesce(array(select jsonb_array_elements_text(v_candidate->'recommended_as')), '{}'::text[])
    );
  end loop;

  return v_run_id;
end;
$$;

revoke all on function public.save_optimization_run(text,text,double precision,double precision,double precision,double precision,text,numeric,numeric,timestamptz,text,text,jsonb) from public, anon;
grant execute on function public.save_optimization_run(text,text,double precision,double precision,double precision,double precision,text,numeric,numeric,timestamptz,text,text,jsonb) to authenticated;
