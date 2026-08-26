from __future__ import annotations

from typing import Any

import httpx


class SupabasePersistence:
    def __init__(self, url: str, publishable_key: str):
        self.url = url.rstrip("/")
        self.publishable_key = publishable_key

    @property
    def configured(self) -> bool:
        return bool(self.url and self.publishable_key)

    def _headers(self, token: str, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.publishable_key,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def get_user(self, token: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{self.url}/auth/v1/user", headers=self._headers(token))
        if response.status_code == 401:
            raise ValueError("Your GreenRoute session has expired. Please sign in again.")
        response.raise_for_status()
        return response.json()

    async def save_optimization(self, token: str, payload: dict[str, Any]) -> str:
        await self.get_user(token)
        optimization = payload["optimization"]
        form = payload["form"]
        selected_strategy = payload["selected_strategy"]
        origin = optimization["origin"]
        destination = optimization["destination"]

        recommendations = optimization.get("recommendations", {})
        candidates_by_id: dict[str, dict[str, Any]] = {}
        for strategy, route in recommendations.items():
            candidate_key = route.get("candidate_id") or f"{strategy}-{route.get('distance_km')}"
            item = candidates_by_id.setdefault(candidate_key, {**route, "candidate_id": candidate_key, "recommended_as": []})
            item["recommended_as"].append(strategy)

        departure_time = form.get("departure_time")
        if departure_time == "now":
            departure_time = None

        rpc_payload = {
            "p_origin_label": origin.get("label") or form.get("origin"),
            "p_destination_label": destination.get("label") or form.get("destination"),
            "p_origin_lon": origin["lon"],
            "p_origin_lat": origin["lat"],
            "p_destination_lon": destination["lon"],
            "p_destination_lat": destination["lat"],
            "p_vehicle_key": form["vehicle_type"],
            "p_load_kg": form["load_kg"],
            "p_fuel_price_per_litre": form["fuel_price_per_litre"],
            "p_departure_time": departure_time,
            "p_routing_mode": optimization.get("mode", "demo"),
            "p_selected_strategy": selected_strategy,
            "p_candidates": list(candidates_by_id.values()),
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                f"{self.url}/rest/v1/rpc/save_optimization_run",
                headers=self._headers(token),
                json=rpc_payload,
            )
        if response.is_error:
            raise ValueError(self._error_message(response, "Unable to save optimization run"))
        return str(response.json())

    async def get_history(self, token: str, limit: int = 20) -> list[dict[str, Any]]:
        await self.get_user(token)
        params = {
            "select": "id,origin_label,destination_label,vehicle_key,load_kg,fuel_price_per_litre,departure_time,routing_mode,selected_strategy,created_at,route_candidates(id,provider_candidate_id,distance_km,duration_minutes,traffic_delay_minutes,fuel_litres,fuel_cost,co2_kg,balanced_score,recommended_as)",
            "order": "created_at.desc",
            "limit": str(max(1, min(limit, 100))),
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(f"{self.url}/rest/v1/optimization_runs", params=params, headers=self._headers(token))
        if response.is_error:
            raise ValueError(self._error_message(response, "Unable to load trip history"))
        return response.json()

    async def delete_run(self, token: str, run_id: str) -> None:
        await self.get_user(token)
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(
                f"{self.url}/rest/v1/optimization_runs",
                params={"id": f"eq.{run_id}"},
                headers=self._headers(token, "return=minimal"),
            )
        if response.is_error:
            raise ValueError(self._error_message(response, "Unable to delete trip"))

    @staticmethod
    def build_dashboard(history: list[dict[str, Any]]) -> dict[str, Any]:
        trip_count = len(history)
        distance_km = fuel_litres = co2_kg = co2_saved_kg = fuel_cost_saved = 0.0
        greenest_count = 0
        strategy_counts = {"fastest": 0, "balanced": 0, "greenest": 0}

        for run in history:
            selected_strategy = run.get("selected_strategy")
            if selected_strategy in strategy_counts:
                strategy_counts[selected_strategy] += 1
            if selected_strategy == "greenest":
                greenest_count += 1

            candidates = run.get("route_candidates") or []
            selected = next((item for item in candidates if selected_strategy in (item.get("recommended_as") or [])), None)
            fastest = next((item for item in candidates if "fastest" in (item.get("recommended_as") or [])), None)
            if selected:
                distance_km += float(selected.get("distance_km") or 0)
                fuel_litres += float(selected.get("fuel_litres") or 0)
                co2_kg += float(selected.get("co2_kg") or 0)
            if selected and fastest:
                co2_saved_kg += max(0.0, float(fastest.get("co2_kg") or 0) - float(selected.get("co2_kg") or 0))
                fuel_cost_saved += max(0.0, float(fastest.get("fuel_cost") or 0) - float(selected.get("fuel_cost") or 0))

        return {
            "trip_count": trip_count,
            "distance_km": round(distance_km, 2),
            "fuel_litres": round(fuel_litres, 2),
            "co2_kg": round(co2_kg, 2),
            "co2_saved_kg": round(co2_saved_kg, 2),
            "fuel_cost_saved": round(fuel_cost_saved, 2),
            "green_route_share": round(greenest_count / trip_count, 4) if trip_count else 0,
            "strategy_counts": strategy_counts,
        }

    @staticmethod
    def _error_message(response: httpx.Response, fallback: str) -> str:
        try:
            payload = response.json()
            return payload.get("message") or payload.get("msg") or payload.get("error_description") or fallback
        except Exception:
            return fallback
