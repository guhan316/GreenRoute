# GreenRoute

GreenRoute is a multi-objective logistics optimization platform for Indian road logistics. It combines live traffic-aware route candidates with vehicle/load-aware fuel and carbon estimation to recommend three decision-oriented routes:

- **Fastest** — minimizes traffic-adjusted travel time.
- **Balanced** — balances travel time, fuel cost, and CO₂ emissions.
- **Greenest** — minimizes CO₂ emissions, with fuel cost as a secondary preference.

## Experience direction

GreenRoute is intentionally a **3D-enhanced interactive web app**, not a plain admin dashboard. The frontend uses React Three Fiber for a lightweight logistics scene and MapLibre GL JS for a tilted, animated route map. Forms and analytics remain conventional and readable so the 3D layer improves the experience without reducing usability.

## Stack

- React 19 + Vite
- Three.js + React Three Fiber + Drei
- MapLibre GL JS + OpenFreeMap base map
- FastAPI + Python
- TomTom Orbis Routing API v3 (live traffic + alternatives)
- Google OR-Tools (fleet/VRP optimization endpoint)
- PostgreSQL + PostGIS schema (Supabase-ready)

## Repository layout

```text
frontend/     React + 3D experience + interactive map
backend/      FastAPI + TomTom + carbon/fuel scoring + OR-Tools
database/     PostgreSQL/PostGIS schema
```

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

Add a TomTom API key to `backend/.env` before requesting real routes.

### Frontend

```bash
cd frontend
npm install
copy .env.example .env  # Windows
npm run dev
```

Open the Vite URL shown in the terminal. The UI includes preview data until a real optimization is run.

## Current milestone

**MVP foundation:** interactive 3D landing experience, shipment planner, map visualization, TomTom live-route service, fuel/carbon scoring, and a basic OR-Tools fleet solver.
