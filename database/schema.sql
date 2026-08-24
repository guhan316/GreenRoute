-- GreenRoute PostgreSQL/PostGIS foundation (Supabase-ready)
create extension if not exists postgis;
create extension if not exists pgcrypto;

create table if not exists public.vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  fuel_type text not null default 'diesel',
  max_payload_kg numeric not null check (max_payload_kg > 0),
  kerb_weight_kg numeric not null check (kerb_weight_kg > 0),
  base_mileage_kmpl numeric not null check (base_mileage_kmpl > 0),
  max_speed_kmph integer not null check (max_speed_kmph > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.optimization_runs (
  id uuid primary key default gen_random_uuid(),
  origin_label text not null,
  destination_label text not null,
  origin geography(point, 4326) not null,
  destination geography(point, 4326) not null,
  vehicle_key text not null,
  load_kg numeric not null,
  fuel_price_per_litre numeric not null,
  selected_strategy text check (selected_strategy in ('fastest','balanced','greenest')),
  created_at timestamptz not null default now()
);

create table if not exists public.route_candidates (
  id uuid primary key default gen_random_uuid(),
  optimization_run_id uuid not null references public.optimization_runs(id) on delete cascade,
  provider_candidate_id text,
  route_geometry geometry(linestring, 4326),
  distance_km numeric not null,
  duration_minutes numeric not null,
  traffic_delay_minutes numeric not null default 0,
  fuel_litres numeric not null,
  fuel_cost numeric not null,
  co2_kg numeric not null,
  balanced_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists route_candidates_run_idx on public.route_candidates(optimization_run_id);
create index if not exists route_candidates_geom_gix on public.route_candidates using gist(route_geometry);

-- Public is an exposed schema on Supabase. Keep tables locked until an
-- authenticated ownership model and explicit policies are added.
alter table public.vehicle_profiles enable row level security;
alter table public.optimization_runs enable row level security;
alter table public.route_candidates enable row level security;
