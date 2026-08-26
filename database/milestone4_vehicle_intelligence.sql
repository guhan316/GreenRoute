-- GreenRoute Milestone 4: precise fleet identity + vehicle catalog

create table if not exists public.vehicle_catalog (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null,
  model text not null,
  category text not null check (category in ('mini_truck','pickup','lcv','mdcv','hcv','tractor_trailer')),
  fuel_types text[] not null default '{}',
  payload_min_kg numeric check (payload_min_kg is null or payload_min_kg > 0),
  payload_max_kg numeric check (payload_max_kg is null or payload_max_kg > 0),
  production_start_year integer,
  production_end_year integer,
  is_current boolean not null default true,
  source_url text,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer, model)
);

alter table public.vehicle_catalog enable row level security;
revoke all on public.vehicle_catalog from anon, authenticated;
grant select on public.vehicle_catalog to anon, authenticated;
drop policy if exists vehicle_catalog_read on public.vehicle_catalog;
create policy vehicle_catalog_read on public.vehicle_catalog for select to anon, authenticated using (true);

alter table public.optimization_runs add column if not exists vehicle_manufacturer text;
alter table public.optimization_runs add column if not exists vehicle_model text;
alter table public.optimization_runs add column if not exists manufacture_year integer;
alter table public.optimization_runs add column if not exists emission_stage text;
alter table public.optimization_runs add column if not exists fuel_type text;
alter table public.optimization_runs add column if not exists base_mileage_kmpl numeric;
alter table public.optimization_runs add column if not exists max_payload_kg numeric;
alter table public.optimization_runs add column if not exists kerb_weight_kg numeric;
alter table public.route_candidates add column if not exists energy_quantity numeric;
alter table public.route_candidates add column if not exists energy_unit text;

-- The hosted project also replaces save_optimization_run with the current
-- authenticated 14-argument RPC which stores p_vehicle_details JSON and the
-- route candidate energy_quantity/energy_unit. Keep SECURITY INVOKER behavior
-- (default), explicit auth.uid() ownership, and grant EXECUTE only to authenticated.
