from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import RouteOptimizationRequest, VrpRequest
from .services.carbon import get_vehicle_profile, list_vehicle_profiles, estimate_trip_metrics
from .services.demo import calculate_demo_routes, geocode_demo
from .services.scoring import build_recommendations
from .services.tomtom import TomTomClient
from .services.vrp import solve_capacitated_vrp

settings = get_settings()
app = FastAPI(title="GreenRoute API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "GreenRoute API",
        "tomtom_configured": bool(settings.tomtom_api_key),
        "demo_fallback_enabled": settings.demo_fallback_enabled,
        "routing_mode": "live" if settings.tomtom_api_key else "demo",
    }


@app.get("/api/vehicles")
def vehicles():
    return {"vehicles": list_vehicle_profiles()}


@app.post("/api/routes/optimize")
async def optimize_routes(request: RouteOptimizationRequest):
    try:
        profile = get_vehicle_profile(request.vehicle_type)
        if request.load_kg > profile.max_payload_kg:
            raise ValueError(
                f"Load exceeds {profile.label} payload capacity ({profile.max_payload_kg:.0f} kg)"
            )

        if settings.tomtom_api_key:
            mode = "live"
            origin = await TomTomClient(settings.tomtom_api_key).geocode(request.origin)
            destination = await TomTomClient(settings.tomtom_api_key).geocode(request.destination)
            client = TomTomClient(settings.tomtom_api_key)
            candidates = await client.calculate_routes(
                origin,
                destination,
                vehicle_weight_kg=int(profile.kerb_weight_kg + request.load_kg),
                max_speed_kmph=profile.max_speed_kmph,
                departure_time=request.departure_time,
            )
            notice = "Live TomTom traffic-aware route candidates."
        else:
            if not settings.demo_fallback_enabled:
                raise ValueError("TOMTOM_API_KEY is required when demo fallback is disabled")
            mode = "demo"
            origin = geocode_demo(request.origin)
            destination = geocode_demo(request.destination)
            candidates = calculate_demo_routes(origin, destination)
            notice = (
                "Synthetic development routes are being shown. "
                "Add TOMTOM_API_KEY to switch to real roads and live traffic."
            )

        measured = [
            estimate_trip_metrics(candidate, profile, request.load_kg, request.fuel_price_per_litre)
            for candidate in candidates
        ]
        result = build_recommendations(measured)
        return {
            "mode": mode,
            "notice": notice,
            "origin": origin,
            "destination": destination,
            "vehicle": profile.label,
            "load_kg": request.load_kg,
            "candidate_count": len(result["candidates"]),
            **result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Routing service error: {exc}") from exc


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
