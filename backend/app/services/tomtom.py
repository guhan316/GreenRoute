import httpx


GEOCODING_URL = "https://api.tomtom.com/maps/orbis/places/geocode"
ROUTING_URL = "https://api.tomtom.com/maps/orbis/routing/routes/calculate"


class TomTomClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError("TomTom API key is not configured")
        self.api_key = api_key

    async def geocode(self, query: str) -> dict:
        headers = {
            "TomTom-Api-Version": "2",
            "TomTom-Api-Key": self.api_key,
            "Attributes": "results(title,position,address)",
            "Accept": "application/json",
        }
        params = {
            "query": query,
            "maxResults": 1,
            "countryCodesIso2": "IN",
            "geopoliticalView": "IN",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(GEOCODING_URL, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

        if not data.get("results"):
            raise ValueError(f"Location not found in India: {query}")

        result = data["results"][0]
        coordinates = result.get("position", {}).get("coordinates", [])
        if len(coordinates) < 2:
            raise ValueError(f"TomTom did not return coordinates for: {query}")

        return {
            "label": result.get("title", query),
            "lat": coordinates[1],
            "lon": coordinates[0],
        }

    async def calculate_routes(
        self,
        origin: dict,
        destination: dict,
        vehicle_weight_kg: int,
        max_speed_kmph: int,
        departure_time: str = "now",
    ) -> list[dict]:
        headers = {
            "Content-Type": "application/json",
            "TomTom-Api-Version": "3",
            "TomTom-Api-Key": self.api_key,
            "Attributes": "routes(summary,legs(path,summary))",
        }
        payload = {
            "routePlanningLocations": {
                "origin": {"type": "Point", "coordinates": [origin["lon"], origin["lat"]]},
                "destination": {"type": "Point", "coordinates": [destination["lon"], destination["lat"]]},
            },
            "departureDateTime": departure_time or "now",
            "routeType": "fast",
            "travelMode": "car",
            "traffic": "live",
            "maxPathAlternativeRoutes": 4,
            "vehicleEngineType": "combustion",
            "vehicleWeightInKilograms": max(0, int(vehicle_weight_kg)),
            "vehicleMaxSpeedInKilometersPerHour": max(0, min(int(max_speed_kmph), 250)),
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ROUTING_URL, headers=headers, json=payload)
            if response.is_error:
                try:
                    detail = response.json().get("detailedError", {}).get("message")
                except Exception:
                    detail = response.text
                raise ValueError(detail or f"TomTom routing failed ({response.status_code})")
            data = response.json()

        parsed = []
        for index, route in enumerate(data.get("routes", [])):
            summary = route.get("summary", {})
            coordinates = []
            for leg in route.get("legs", []):
                leg_coordinates = leg.get("path", {}).get("coordinates", [])
                if coordinates and leg_coordinates and coordinates[-1] == leg_coordinates[0]:
                    coordinates.extend(leg_coordinates[1:])
                else:
                    coordinates.extend(leg_coordinates)

            parsed.append({
                "candidate_id": f"candidate-{index + 1}",
                "distance_km": round(summary.get("lengthInMeters", 0) / 1000, 2),
                "duration_minutes": round(summary.get("travelDurationInSeconds", 0) / 60, 2),
                "traffic_delay_minutes": round(summary.get("trafficDelayDurationInSeconds", 0) / 60, 2),
                "coordinates": coordinates,
            })

        parsed = [route for route in parsed if route["distance_km"] > 0 and len(route["coordinates"]) > 1]
        if not parsed:
            raise ValueError("TomTom returned no usable routes")
        return parsed
