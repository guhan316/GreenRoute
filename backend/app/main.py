from dataclasses import asdict

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import OptimizationSaveRequest, RouteOptimizationRequest, VrpRequest
from .services.carbon import (
    build_vehicle_profile,
    estimate_trip_metrics,
    get_vehicle_profile,
    list_vehicle_profiles,
)
from .services.catalog import VehicleCatalogService
from .services.demo import calculate_demo_routes, geocode_demo
from .services.google_routes import GoogleRoutesClient
from .services.persistence import SupabasePersistence
from .services.scoring import build_recommendations
from .services.tomtom import TomTomClient
from .services.vrp import solve_capacitated_vrp


settings = get_settings()
persistence = SupabasePersistence(settings.supabase_url, settings.supabase_publishable_key)
catalog = VehicleCatalogService(settings.supabase_url, settings.supabase_publishable_key)
app = FastAPI(title="GreenRoute API", version="0.6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to save or view GreenRoute trip history")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing Supabase access token")
    return token


def _require_persistence() -> None:
    if not persistence.configured:
        raise HTTPException(status_code=503, detail="Supabase persistence is not configured on the GreenRoute backend")


def _routing_provider() -> str:
    if settings.google_routes_api_key:
        return "google"
    if settings.tomtom_api_key:
        return "tomtom"
    return "demo"


@app.get("/health")
def health():
    provider = _routing_provider()
    return {
        "status": "ok",
        "service": "GreenRoute API",
        "version": "0.6.0",
        "google_routes_configured": bool(settings.google_routes_api_key),
        "tomtom_configured": bool(settings.tomtom_api_key),
        "demo_fallback_enabled": settings.demo_fallback_enabled,
        "routing_mode": "live" if provider in {"google", "tomtom"} else "demo",
        "routing_provider": provider,
        "supabase_persistence_configured": persistence.configured,
        "vehicle_catalog_configured": catalog.configured,
    }


@app.get("/api/vehicles")
def vehicles():
    return {"vehicles": list_vehicle_profiles()}


@app.get("/api/vehicle-catalog")
async def vehicle_catalog():
    try:
        rows = await catalog.list_catalog()
        return {"vehicles": rows}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Vehicle catalog error: {exc}") from exc


@app.get("/api/places/search")
async def place_search(q: str = Query(min_length=2, max_length=180), limit: int = Query(default=10, ge=1, le=10)):
    if not settings.tomtom_api_key:
        raise HTTPException(
            status_code=503,
            detail="Server-side place search is disabled. Use the Google Places widget in the web app.",
        )
    try:
        client = TomTomClient(settings.tomtom_api_key)
        results = await client.search_places(q, limit=limit)
        return {"results": results}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Place search error: {exc}") from exc


@app.get("/api/places/reverse")
async def reverse_place(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180)):
    if not settings.tomtom_api_key:
        raise HTTPException(
            status_code=503,
            detail="Server-side reverse geocoding is disabled. Use Google Maps geocoding in the web app.",
        )
    try:
        client = TomTomClient(settings.tomtom_api_key)
        return await client.reverse_geocode(lat, lon)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Reverse geocoding error: {exc}") from exc


@app.post("/api/routes/optimize")
async def optimize_routes(request: RouteOptimizationRequest):
    try:
        profile = build_vehicle_profile(request.vehicle) if request.vehicle else get_vehicle_profile(request.vehicle_type or "lcv")
        if request.load_kg > profile.max_payload_kg:
            raise ValueError(
                f"Load exceeds {profile.label} payload capacity ({profile.max_payload_kg:.0f} kg)"
            )

        provider = _routing_provider()
        if provider == "google":
            mode = "live"
            client = GoogleRoutesClient(settings.google_routes_api_key)
            origin = await client.resolve_location(request.origin)
            destination = await client.resolve_location(request.destination)
            candidates = await client.calculate_routes(
                origin,
                destination,
                vehicle_weight_kg=int(profile.kerb_weight_kg + request.load_kg),
                max_speed_kmph=profile.max_speed_kmph,
                departure_time=request.departure_time,
                combustion=profile.fuel_type != "electric",
            )
            notice = (
                "Google Routes TRAFFIC_AWARE_OPTIMAL is active. "
                "GreenRoute evaluated the default road and Google alternative routes using live traffic-aware ETA."
            )
        elif provider == "tomtom":
            mode = "live"
            client = TomTomClient(settings.tomtom_api_key)
            origin = await client.resolve_location(request.origin)
            destination = await client.resolve_location(request.destination)
            candidates = await client.calculate_routes(
                origin,
                destination,
                vehicle_weight_kg=int(profile.kerb_weight_kg + request.load_kg),
                max_speed_kmph=profile.max_speed_kmph,
                departure_time=request.departure_time,
                combustion=profile.fuel_type != "electric",
            )
            notice = "Live TomTom traffic-aware route candidates using selected place coordinates."
        else:
            if not settings.demo_fallback_enabled:
                raise ValueError("GOOGLE_ROUTES_API_KEY or TOMTOM_API_KEY is required when demo fallback is disabled")
            mode = "demo"
            origin_text = request.origin.label if hasattr(request.origin, "label") else str(request.origin)
            destination_text = request.destination.label if hasattr(request.destination, "label") else str(request.destination)
            origin = geocode_demo(origin_text)
            destination = geocode_demo(destination_text)
            candidates = calculate_demo_routes(origin, destination)
            notice = (
                "Synthetic development routes are being shown. "
                "Configure Google Maps Platform to switch to Google live traffic routing."
            )

        measured = [
            estimate_trip_metrics(
                candidate,
                profile,
                request.load_kg,
                request.fuel_price_per_litre,
                request.electricity_price_per_kwh,
            )
            for candidate in candidates
        ]
        result = build_recommendations(measured)
        return {
            "mode": mode,
            "routing_provider": provider,
            "notice": notice,
            "origin": origin,
            "destination": destination,
            "vehicle": asdict(profile),
            "load_kg": request.load_kg,
            "candidate_count": len(result["candidates"]),
            **result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Routing service error: {exc}") from exc


@app.post("/api/history/save")
async def save_history(
    request: OptimizationSaveRequest,
    authorization: str | None = Header(default=None),
):
    _require_persistence()
    token = _bearer_token(authorization)
    try:
        run_id = await persistence.save_optimization(token, request.model_dump())
        return {"saved": True, "run_id": run_id}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Persistence service error: {exc}") from exc


@app.get("/api/history")
async def history(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    _require_persistence()
    token = _bearer_token(authorization)
    try:
        rows = await persistence.get_history(token, limit)
        return {"trips": rows}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Persistence service error: {exc}") from exc


@app.get("/api/dashboard")
async def dashboard(authorization: str | None = Header(default=None)):
    _require_persistence()
    token = _bearer_token(authorization)
    try:
        rows = await persistence.get_history(token, 100)
        return persistence.build_dashboard(rows)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Persistence service error: {exc}") from exc


@app.delete("/api/history/{run_id}")
async def delete_history(run_id: str, authorization: str | None = Header(default=None)):
    _require_persistence()
    token = _bearer_token(authorization)
    try:
        await persistence.delete_run(token, run_id)
        return {"deleted": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Persistence service error: {exc}") from exc


@app.post("/api/vrp/solve")
def solve_vrp(request: VrpRequest):
    try:
        return solve_capacitated_vrp(
            request.distance_matrix,
            request.demands,
            request.vehicle_capacities,
            request.depot,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
