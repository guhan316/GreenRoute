# GreenRoute

GreenRoute is a multi-objective logistics optimization platform for Indian road logistics. It combines real road-route candidates with vehicle/load-aware fuel and carbon estimation to recommend three decision-oriented routes:

- **Fastest** — minimizes estimated travel time.
- **Balanced** — balances travel time, fuel cost, and CO₂ emissions.
- **Greenest** — minimizes CO₂ emissions, with fuel cost as a secondary preference.

## Experience direction

GreenRoute is intentionally a **3D-enhanced interactive web app**, not a plain admin dashboard. The frontend uses React Three Fiber for a lightweight logistics scene and Leaflet for the operational route map. Forms and analytics remain conventional and readable so the 3D layer improves the experience without reducing usability.

## Stack

- React 19 + Vite
- Three.js + React Three Fiber + Drei
- Leaflet + OpenStreetMap base tiles
- FastAPI + Python
- GraphHopper Directions API as the primary road-routing provider
- TomTom search/reverse-geocoding and temporary routing fallback during migration
- Google OR-Tools (fleet/VRP optimization endpoint)
- PostgreSQL + PostGIS schema (Supabase-ready)

## Repository layout

```text
frontend/     React + 3D experience + Leaflet route map
backend/      FastAPI + GraphHopper/TomTom + carbon/fuel scoring + OR-Tools
database/     PostgreSQL/PostGIS schema
```

## Routing modes

GreenRoute keeps a credential-free development mode while preferring real road routing whenever a provider is configured:

- **Demo mode:** used when no routing provider key is configured. It generates clearly labelled synthetic candidate routes so the complete UI, scoring and carbon workflow can be tested.
- **Live road mode:** GraphHopper is the preferred route provider when `GRAPHOPPER_API_KEY` is configured. It returns real road geometry and ETA estimates using road-network data. These results are explicitly treated as non-live-traffic-aware.
- **TomTom fallback:** if GraphHopper is unavailable and `TOMTOM_API_KEY` is configured, TomTom can supply the route and traffic-aware ETA. TomTom is also temporarily retained for typed place search while the geocoding layer is migrated.

Synthetic demo routes must not be interpreted as real roads or traffic measurements. GraphHopper ETA must not be described as live-traffic data unless a traffic-aware source is explicitly used.

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env  # Windows
uvicorn app.main:app --reload
```

The default `.env.example` can start in demo mode. Add GraphHopper for primary real-road routing and optionally keep TomTom for search/fallback:

```env
GRAPHOPPER_API_KEY=your_graphhopper_key_here
TOMTOM_API_KEY=your_optional_tomtom_key_here
CORS_ORIGINS=http://localhost:5173
DEMO_FALLBACK_ENABLED=true
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env  # Windows
npm run dev
```

Open the Vite URL shown in the terminal. The map is rendered with Leaflet and OpenStreetMap tiles, while route geometry comes from the backend routing provider.

## Verification

GitHub Actions runs two checks on `main` and `develop`:

1. Backend unit/integration tests, including routing-provider and end-to-end optimization coverage.
2. A production Vite build for the React/3D frontend.

## Current milestone

**Final integration and validation:** interactive 3D landing experience, shipment planner, Leaflet road visualization, GraphHopper-first real-road routing, TomTom fallback/search support, vehicle/load-aware fuel and carbon scoring, transparent Fastest/Balanced/Greenest recommendations, Supabase-backed trip history, and an OR-Tools fleet solver.
