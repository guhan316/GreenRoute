import re

import httpx


ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def _duration_seconds(value: str | None) -> float:
    if not value:
        return 0.0
    match = re.fullmatch(r"(-?\d+(?:\.\d+)?)s", value.strip())
    if not match:
        return 0.0
    return float(match.group(1))


def _decode_polyline(encoded: str) -> list[list[float]]:
    """Decode a Google encoded polyline into [longitude, latitude] pairs."""
    if not encoded:
        return []

    coordinates: list[list[float]] = []
    index = 0
    latitude = 0
    longitude = 0

    while index < len(encoded):
        deltas = []
        for _ in range(2):
            result = 0
            shift = 0
            while True:
                if index >= len(encoded):
                    return coordinates
                value = ord(encoded[index]) - 63
                index += 1
                result |= (value & 0x1F) << shift
                shift += 5
                if value < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)

        latitude += deltas[0]
        longitude += deltas[1]
        coordinates.append([longitude / 1e5, latitude / 1e5])

    return coordinates


class GoogleRoutesClient:
    """Thin adapter around Google Routes API that preserves GreenRoute's candidate shape."""

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("Google Routes API key is not configured")
        self.api_key = api_key

    @staticmethod
    async def resolve_location(value) -> dict:
        if hasattr(value, "model_dump"):
            value = value.model_dump()

        if isinstance(value, dict) and value.get("lat") is not None and value.get("lon") is not None:
            return {
                "label": value.get("label") or value.get("address") or "Selected location",
                "address": value.get("address") or value.get("label"),
                "lat": float(value["lat"]),
                "lon": float(value["lon"]),
                "google_place_id": value.get("google_place_id") or value.get("place_id"),
                "result_type": value.get("result_type") or "Google Place",
            }

        raise ValueError(
            "Google routing requires an exact selected place or map pin with latitude and longitude"
        )

    @staticmethod
    def _parse_routes(data: dict) -> list[dict]:
        parsed = []
        for index, route in enumerate(data.get("routes") or []):
            duration_seconds = _duration_seconds(route.get("duration"))
            static_seconds = _duration_seconds(route.get("staticDuration"))
            encoded = (route.get("polyline") or {}).get("encodedPolyline") or ""
            coordinates = _decode_polyline(encoded)
            distance_meters = float(route.get("distanceMeters") or 0)
            if distance_meters <= 0 or len(coordinates) < 2:
                continue

            labels = route.get("routeLabels") or []
            parsed.append(
                {
                    "candidate_id": f"google-{index + 1}",
                    "source_route_type": "google",
                    "distance_km": round(distance_meters / 1000, 2),
                    "duration_minutes": round(duration_seconds / 60, 2),
                    "traffic_delay_minutes": round(
                        max(0.0, duration_seconds - static_seconds) / 60,
                        2,
                    ),
                    "coordinates": coordinates,
                    "route_description": route.get("description") or "",
                    "route_labels": labels,
                }
            )
        return parsed

    async def calculate_routes(
        self,
        origin: dict,
        destination: dict,
        vehicle_weight_kg: int,
        max_speed_kmph: int,
        departure_time: str = "now",
        combustion: bool = True,
    ) -> list[dict]:
        del vehicle_weight_kg, max_speed_kmph, combustion

        payload = {
            "origin": {
                "location": {
                    "latLng": {
                        "latitude": float(origin["lat"]),
                        "longitude": float(origin["lon"]),
                    }
                }
            },
            "destination": {
                "location": {
                    "latLng": {
                        "latitude": float(destination["lat"]),
                        "longitude": float(destination["lon"]),
                    }
                }
            },
            "travelMode": "DRIVE",
            "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
            "computeAlternativeRoutes": True,
            "routeModifiers": {
                "avoidTolls": False,
                "avoidHighways": False,
                "avoidFerries": False,
            },
            "languageCode": "en-IN",
            "units": "METRIC",
        }

        if departure_time and departure_time != "now":
            payload["departureTime"] = departure_time

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": (
                "routes.distanceMeters,"
                "routes.duration,"
                "routes.staticDuration,"
                "routes.polyline.encodedPolyline,"
                "routes.description,"
                "routes.routeLabels"
            ),
        }

        async with httpx.AsyncClient(timeout=35.0) as client:
            response = await client.post(ROUTES_URL, headers=headers, json=payload)

        if response.is_error:
            try:
                error = response.json().get("error", {})
                detail = error.get("message")
            except Exception:
                detail = response.text
            raise ValueError(detail or f"Google Routes API failed ({response.status_code})")

        routes = self._parse_routes(response.json())
        if not routes:
            raise ValueError("Google Routes API returned no usable traffic-aware routes")
        return routes
