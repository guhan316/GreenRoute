# GreenRoute

GreenRoute is a multi-objective logistics optimization platform for Indian road logistics. It combines live traffic-aware route candidates with vehicle/load-aware fuel and carbon estimation to recommend three decision-oriented routes:

- **Fastest** — minimizes traffic-adjusted travel time.
- **Balanced** — balances travel time, fuel cost, and CO₂ emissions.
- **Greenest** — minimizes CO₂ emissions, with fuel cost as a secondary preference.

## Experience direction

GreenRoute is intentionally a **3D-enhanced interactive web app**, not a plain admin dashboard. The frontend uses React Three Fiber for a lightweight logistics scene and MapLibre GL JS for a tilted, interactive route map. Forms and analytics remain conventional and readable so the 3D layer improves the experience without reducing usability.

## Stack

- React 19 + Vite
- Three.js + React Three Fiber + Drei
- MapLibre GL JS + OpenFreeMap base map
- FastAPI + Python
- TomTom Orbis Geocoding v2 + Routing v3
- Google OR-Tools (fleet/VRP optimization endpoint)
- PostgreSQL + PostGIS schema (Supabase-ready)

## Repository layout

```text
frontend/     React + 3D experience + interactive map
backend/      FastAPI + TomTom + carbon/fuel scoring + OR-Tools
database/     PostgreSQL/PostGIS schema
```

## Routing modes

GreenRoute has two explicit modes so development never depends on a paid credential:

- **Demo mode:** used automatically when `TOMTOM_API_KEY` is empty. It generates clearly labelled synthetic candidate routes between a small set of supported Indian cities so the complete UI, scoring and carbon workflow can be tested.
- **Live mode:** enabled automatically when `TOMTOM_API_KEY` is configured. TomTom provides real geocoding, road geometry, alternative routes, live-traffic ETA and traffic delay data.

Synthetic demo routes must not be interpreted as real roads or traffic measurements.

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

The default `.env.example` starts in demo mode. Add a TomTom API key to `backend/.env` to switch the same API endpoint to live routing:

```env
TOMTOM_API_KEY=your_key_here
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

Open the Vite URL shown in the terminal. The interface reports whether the backend is running in **Demo**, **Live**, or **Offline** mode.

## Verification

GitHub Actions runs two checks on `main` and `develop`:

1. Backend unit/integration tests, including an end-to-end demo route optimization.
2. A production Vite build for the React/3D frontend.

## Current milestone

**MVP foundation:** interactive 3D landing experience, shipment planner, tilted map visualization, credential-free demo routing, TomTom live-route integration, vehicle/load-aware fuel and carbon scoring, transparent Fastest/Balanced/Greenest recommendations, and a basic OR-Tools fleet solver.
