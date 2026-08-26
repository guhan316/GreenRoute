from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import OptimizationSaveRequest, RouteOptimizationRequest, VrpRequest
from .services.carbon import estimate_trip_metrics, get_vehicle_profile, list_vehicle_profiles
from .services.demo import calculate_demo_routes, geocode_demo
from .services.persistence import SupabasePersistence
from .services.scoring import build_recommendations
from .services.tomtom import TomTomClient
from .services.vrp import solve_capacitated_vrp

settings = get_settings()
persistence = SupabasePersistence(settings.supabase_url, settings.supabase_publishable_key)
app = FastAPI(title="GreenRoute API", version="0.3.0")
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "GreenRoute API",
        "tomtom_configured": bool(settings.tomtom_api_key),
        "demo_fallback_enabled": settings.demo_fallback_enabled,
        "routing_mode": "live" if settings.tomtom_api_key else "demo",
        "supabase_persistence_configured": persistence.configured,
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
            client = TomTomClient(settings.tomtom_api_key)
            origin = await client.geocode(request.origin)
            destination = await client.geocode(request.destination)
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
