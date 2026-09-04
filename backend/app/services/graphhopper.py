import httpx


ROUTING_URL = 'https://graphhopper.com/api/1/route'


class GraphHopperClient:
    """Primary road-routing client for GreenRoute.

    GraphHopper supplies real OpenStreetMap-based road geometry and ETA estimates.
    It is intentionally treated as non-traffic-aware unless a separate live-traffic
    provider is used. TomTom can remain as a temporary fallback while GreenRoute
    migrates away from depending on it for routing.
    """

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError('GraphHopper API key is not configured')
        self.api_key = api_key

    @staticmethod
    def _parse_paths(data: dict) -> list[dict]:
        parsed = []
        for index, path in enumerate(data.get('paths') or []):
            points = path.get('points') or {}
            coordinates = points.get('coordinates') if isinstance(points, dict) else None
            if not coordinates or len(coordinates) < 2:
                continue

            distance_m = float(path.get('distance') or 0)
            duration_ms = float(path.get('time') or 0)
            if distance_m <= 0 or duration_ms <= 0:
                continue

            parsed.append({
                'candidate_id': f'graphhopper-{index + 1}',
                'source_route_type': 'graphhopper',
                'distance_km': round(distance_m / 1000, 2),
                'duration_minutes': round(duration_ms / 60000, 2),
                # GraphHopper routes are real-road estimates but are not live-traffic
                # measurements in this configuration.
                'traffic_delay_minutes': 0.0,
                'coordinates': coordinates,
            })
        return parsed

    async def _request(self, origin: dict, destination: dict, alternatives: bool) -> list[dict]:
        params = [
            ('point', f"{float(origin['lat'])},{float(origin['lon'])}"),
            ('point', f"{float(destination['lat'])},{float(destination['lon'])}"),
            ('profile', 'car'),
            ('locale', 'en'),
            ('calc_points', 'true'),
            ('points_encoded', 'false'),
            ('instructions', 'false'),
            ('key', self.api_key),
        ]
        if alternatives:
            params.extend([
                ('algorithm', 'alternative_route'),
                ('alternative_route.max_paths', '3'),
                ('alternative_route.max_weight_factor', '1.6'),
                ('alternative_route.max_share_factor', '0.8'),
            ])

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(ROUTING_URL, params=params)

        if response.is_error:
            try:
                payload = response.json()
                detail = payload.get('message') or payload.get('hints', [{}])[0].get('message')
            except Exception:
                detail = response.text
            raise ValueError(detail or f'GraphHopper routing failed ({response.status_code})')

        routes = self._parse_paths(response.json())
        if not routes:
            raise ValueError('GraphHopper returned no usable routes')
        return routes

    async def calculate_routes(self, origin: dict, destination: dict) -> list[dict]:
        # Prefer up to three physical alternatives. If the account/profile does
        # not permit alternative routing, retry once with the standard route.
        try:
            return await self._request(origin, destination, alternatives=True)
        except Exception as alternative_error:
            try:
                return await self._request(origin, destination, alternatives=False)
            except Exception as standard_error:
                raise ValueError(
                    f'GraphHopper routing failed: {standard_error}'
                ) from alternative_error
