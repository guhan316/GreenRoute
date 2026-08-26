-- GreenRoute PostgreSQL/PostGIS foundation (Supabase)
-- Public tables use explicit grants plus RLS. PostGIS stays in the extensions schema.

create extension if not exists postgis with schema extensions;

create table if not exists public.vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  fuel_type text not null default 'diesel',
  max_payload_kg numeric not null check (max_payload_kg > 0),
  kerb_weight_kg numeric not null check (kerb_weight_kg > 0),
  base_mileage_kmpl numeric not null check (base_mileage_kmpl > 0),
  max_speed_kmph integer not null check (max_speed_kmph > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emission_factors (
  id uuid primary key default gen_random_uuid(),
  fuel_type text not null,
  kg_co2e_per_litre numeric not null check (kg_co2e_per_litre > 0),
  source_name text not null,
  source_url text,
  methodology_status text not null default 'prototype' check (methodology_status in ('prototype','validated')),
  valid_from date,
  valid_to date,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists emission_factors_active_fuel_idx
  on public.emission_factors(fuel_type, methodology_status, valid_from);

create table if not exists public.optimization_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_label text not null,
  destination_label text not null,
  origin extensions.geography(point, 4326) not null,
  destination extensions.geography(point, 4326) not null,
  vehicle_key text not null,
  load_kg numeric not null check (load_kg > 0),
  fuel_price_per_litre numeric not null check (fuel_price_per_litre > 0),
  departure_time timestamptz,
  routing_mode text not null default 'demo' check (routing_mode in ('demo','live')),
  selected_strategy text check (selected_strategy in ('fastest','balanced','greenest')),
  created_at timestamptz not null default now()
);

create table if not exists public.route_candidates (
  id uuid primary key default gen_random_uuid(),
  optimization_run_id uuid not null references public.optimization_runs(id) on delete cascade,
  provider_candidate_id text,
  route_geometry extensions.geometry(linestring, 4326),
  distance_km numeric not null check (distance_km > 0),
  duration_minutes numeric not null check (duration_minutes > 0),
  traffic_delay_minutes numeric not null default 0 check (traffic_delay_minutes >= 0),
  fuel_litres numeric not null check (fuel_litres > 0),
  fuel_cost numeric not null check (fuel_cost >= 0),
  co2_kg numeric not null check (co2_kg >= 0),
  balanced_score numeric,
  recommended_as text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.brsr_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  trip_count integer not null default 0 check (trip_count >= 0),
  distance_km numeric not null default 0 check (distance_km >= 0),
  fuel_litres numeric not null default 0 check (fuel_litres >= 0),
  co2_kg numeric not null default 0 check (co2_kg >= 0),
  co2_saved_kg numeric not null default 0 check (co2_saved_kg >= 0),
  green_route_share numeric not null default 0 check (green_route_share between 0 and 1),
  methodology_note text,
  generated_at timestamptz not null default now()
);

create index if not exists optimization_runs_user_created_idx on public.optimization_runs(user_id, created_at desc);
create index if not exists optimization_runs_origin_gix on public.optimization_runs using gist(origin);
create index if not exists optimization_runs_destination_gix on public.optimization_runs using gist(destination);
create index if not exists route_candidates_run_idx on public.route_candidates(optimization_run_id);
create index if not exists route_candidates_geom_gix on public.route_candidates using gist(route_geometry);
create index if not exists brsr_report_user_period_idx on public.brsr_report_snapshots(user_id, period_start, period_end);

alter table public.vehicle_profiles enable row level security;
alter table public.emission_factors enable row level security;
alter table public.optimization_runs enable row level security;
alter table public.route_candidates enable row level security;
alter table public.brsr_report_snapshots enable row level security;

revoke all on public.vehicle_profiles from anon, authenticated;
revoke all on public.emission_factors from anon, authenticated;
revoke all on public.optimization_runs from anon, authenticated;
revoke all on public.route_candidates from anon, authenticated;
revoke all on public.brsr_report_snapshots from anon, authenticated;

grant select on public.vehicle_profiles to anon, authenticated;
grant select on public.emission_factors to authenticated;
grant select, insert, update, delete on public.optimization_runs to authenticated;
grant select, insert, update, delete on public.route_candidates to authenticated;
grant select, insert, update, delete on public.brsr_report_snapshots to authenticated;

create policy vehicle_profiles_read on public.vehicle_profiles for select to anon, authenticated using (true);
create policy emission_factors_read on public.emission_factors for select to authenticated using (true);

create policy optimization_runs_select_own on public.optimization_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy optimization_runs_insert_own on public.optimization_runs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy optimization_runs_update_own on public.optimization_runs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy optimization_runs_delete_own on public.optimization_runs for delete to authenticated using ((select auth.uid()) = user_id);

create policy route_candidates_select_own on public.route_candidates for select to authenticated
using (exists (select 1 from public.optimization_runs r where r.id = optimization_run_id and r.user_id = (select auth.uid())));
create policy route_candidates_insert_own on public.route_candidates for insert to authenticated
with check (exists (select 1 from public.optimization_runs r where r.id = optimization_run_id and r.user_id = (select auth.uid())));
create policy route_candidates_update_own on public.route_candidates for update to authenticated
using (exists (select 1 from public.optimization_runs r where r.id = optimization_run_id and r.user_id = (select auth.uid())))
with check (exists (select 1 from public.optimization_runs r where r.id = optimization_run_id and r.user_id = (select auth.uid())));
create policy route_candidates_delete_own on public.route_candidates for delete to authenticated
using (exists (select 1 from public.optimization_runs r where r.id = optimization_run_id and r.user_id = (select auth.uid())));

create policy brsr_reports_select_own on public.brsr_report_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy brsr_reports_insert_own on public.brsr_report_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
create policy brsr_reports_update_own on public.brsr_report_snapshots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy brsr_reports_delete_own on public.brsr_report_snapshots for delete to authenticated using ((select auth.uid()) = user_id);

create view public.user_sustainability_summary
with (security_invoker = true)
as
with selected_routes as (
  select
    r.id as run_id,
    r.user_id,
    r.selected_strategy,
    selected.distance_km,
    selected.fuel_litres,
    selected.fuel_cost,
    selected.co2_kg,
    fastest.fuel_cost as fastest_fuel_cost,
    fastest.co2_kg as fastest_co2_kg
  from public.optimization_runs r
  left join lateral (
    select c.* from public.route_candidates c
    where c.optimization_run_id = r.id and r.selected_strategy = any(c.recommended_as)
    limit 1
  ) selected on true
  left join lateral (
    select c.* from public.route_candidates c
    where c.optimization_run_id = r.id and 'fastest' = any(c.recommended_as)
    limit 1
  ) fastest on true
)
select
  user_id,
  count(*)::integer as trip_count,
  coalesce(sum(distance_km), 0)::numeric as selected_distance_km,
  coalesce(sum(fuel_litres), 0)::numeric as selected_fuel_litres,
  coalesce(sum(co2_kg), 0)::numeric as selected_co2_kg,
  coalesce(sum(greatest(fastest_co2_kg - co2_kg, 0)), 0)::numeric as co2_saved_kg,
  coalesce(sum(greatest(fastest_fuel_cost - fuel_cost, 0)), 0)::numeric as fuel_cost_saved,
  count(*) filter (where selected_strategy = 'greenest')::integer as greenest_trip_count
from selected_routes
group by user_id;

revoke all on public.user_sustainability_summary from anon, authenticated;
grant select on public.user_sustainability_summary to authenticated;

insert into public.vehicle_profiles (key, label, fuel_type, max_payload_kg, kerb_weight_kg, base_mileage_kmpl, max_speed_kmph)
values
  ('tata_ace', 'Tata Ace / Mini Truck', 'diesel', 1000, 1100, 16.0, 70),
  ('lcv', 'Light Commercial Vehicle', 'diesel', 4000, 2800, 10.5, 80),
  ('medium_truck', 'Medium Truck', 'diesel', 9000, 6000, 6.5, 75),
  ('heavy_truck', 'Heavy Truck', 'diesel', 16000, 9500, 4.5, 70),
  ('trailer', 'Trailer', 'diesel', 28000, 14500, 3.4, 65)
on conflict (key) do update set
  label = excluded.label,
  fuel_type = excluded.fuel_type,
  max_payload_kg = excluded.max_payload_kg,
  kerb_weight_kg = excluded.kerb_weight_kg,
  base_mileage_kmpl = excluded.base_mileage_kmpl,
  max_speed_kmph = excluded.max_speed_kmph,
  updated_at = now();
