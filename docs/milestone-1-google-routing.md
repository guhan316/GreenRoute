# Milestone 1 — Google Maps Routing Core

GreenRoute Milestone 1 replaces the primary map/routing experience with Google Maps Platform while keeping the existing GreenRoute vehicle, fuel-cost, carbon and Pareto scoring engine.

## Scope

- Google Maps JavaScript API basemap
- Places API (New) autocomplete for exact pickup and delivery points
- Google Routes API `TRAFFIC_AWARE_OPTIMAL`
- Google alternative routes
- live traffic-aware ETA
- Google Traffic Layer on the map
- existing GreenRoute Fastest / Balanced / Greenest scoring over the Google road candidates

## Google Cloud setup

Use one Google Cloud project with billing enabled and enable:

1. Maps JavaScript API
2. Places API (New)
3. Routes API
4. Geocoding API (optional but recommended for map-pin address labels)

Create two API keys:

- `VITE_GOOGLE_MAPS_API_KEY`: browser key, restricted by HTTP referrer and limited to Maps JavaScript / Places / Geocoding.
- `GOOGLE_ROUTES_API_KEY`: server key, stored only in the backend environment and limited to Routes API.

## Local environment

Frontend:

```env
VITE_GOOGLE_MAPS_API_KEY=...
```

Backend:

```env
GOOGLE_ROUTES_API_KEY=...
```

The backend gives Google routing priority when the Google Routes key exists. TomTom remains a temporary fallback until the migration is fully validated.

## Acceptance criteria

- Searching an Indian address/POI returns Google Places predictions.
- Pickup/delivery pins can be chosen directly on the Google map.
- The map displays Google's live traffic layer.
- Optimize returns Google traffic-aware ETA.
- Multiple Google road alternatives are visible when Google returns them.
- Fastest / Balanced / Greenest are recalculated from those Google candidate roads.
- If one physical road wins multiple strategies, GreenRoute states the shared winner instead of inventing fake routes.
