from urllib.parse import quote

import httpx


GEOCODING_URL = 'https://api.tomtom.com/maps/orbis/places/geocode'
SEARCH_V2_URL = 'https://api.tomtom.com/search/2/search/{query}.json'
SEARCH_ORBIS_URL = 'https://api.tomtom.com/maps/orbis/places/search/{query}.json'
ROUTING_URL = 'https://api.tomtom.com/maps/orbis/routing/routes/calculate'


class TomTomClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError('TomTom API key is not configured')
        self.api_key = api_key

    @staticmethod
    def _parse_search_results(data: dict, query: str) -> list[dict]:
        results = []
        for item in data.get('results', []):
            position = item.get('position') or {}
            lat, lon = position.get('lat'), position.get('lon')
            if lat is None or lon is None:
                continue
            address = item.get('address') or {}
            poi = item.get('poi') or {}
            title = poi.get('name') or address.get('freeformAddress') or item.get('entityType') or query
            freeform = address.get('freeformAddress') or title
            results.append({
                'tomtom_id': item.get('id'),
                'result_type': item.get('type'),
                'label': title,
                'address': freeform,
                'lat': lat,
                'lon': lon,
                'postal_code': address.get('postalCode'),
                'municipality': address.get('municipality'),
                'state': address.get('countrySubdivisionName') or address.get('countrySubdivision'),
            })
        return results

    async def search_places(self, query: str, limit: int = 6) -> list[dict]:
        query = query.strip()
        if len(query) < 2:
            return []

        encoded_query = quote(query, safe='')
        limit = max(1, min(limit, 10))
        stable_params = {
            'key': self.api_key,
            'limit': limit,
            'countrySet': 'IN',
            'typeahead': 'true',
            'idxSet': 'POI,PAD,Addr,Geo,Str',
        }
        orbis_params = {
            **stable_params,
            'apiVersion': '1',
        }

        errors = []
        async with httpx.AsyncClient(timeout=15.0) as client:
            stable_response = await client.get(SEARCH_V2_URL.format(query=encoded_query), params=stable_params)
            if stable_response.is_success:
                return self._parse_search_results(stable_response.json(), query)
            errors.append(f'Search v2 returned {stable_response.status_code}')

            orbis_response = await client.get(SEARCH_ORBIS_URL.format(query=encoded_query), params=orbis_params)
            if orbis_response.is_success:
                return self._parse_search_results(orbis_response.json(), query)
            errors.append(f'Orbis Search returned {orbis_response.status_code}')

        raise ValueError('TomTom place search is unavailable (' + '; '.join(errors) + ')')

    async def resolve_location(self, value) -> dict:
        if hasattr(value, 'model_dump'):
            value = value.model_dump()
        if isinstance(value, dict) and value.get('lat') is not None and value.get('lon') is not None:
            return {
                'label': value.get('label') or value.get('address') or 'Selected location',
                'address': value.get('address') or value.get('label'),
                'lat': float(value['lat']),
                'lon': float(value['lon']),
                'tomtom_id': value.get('tomtom_id'),
                'result_type': value.get('result_type'),
            }
        matches = await self.search_places(str(value), limit=1)
        if matches:
            return matches[0]
        return await self.geocode(str(value))

    async def geocode(self, query: str) -> dict:
        headers = {
            'TomTom-Api-Version': '2',
            'TomTom-Api-Key': self.api_key,
            'Attributes': 'results(title,position,address)',
            'Accept': 'application/json',
        }
        params = {
            'query': query,
            'maxResults': 1,
            'countryCodesIso2': 'IN',
            'geopoliticalView': 'IN',
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(GEOCODING_URL, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()

        if not data.get('results'):
            raise ValueError(f'Location not found in India: {query}')

        result = data['results'][0]
        coordinates = result.get('position', {}).get('coordinates', [])
        if len(coordinates) < 2:
            raise ValueError(f'TomTom did not return coordinates for: {query}')
        address = result.get('address') or {}
        return {
            'label': result.get('title', query),
            'address': address.get('freeformAddress') or query,
            'lat': coordinates[1],
            'lon': coordinates[0],
            'result_type': 'Address',
        }

    async def calculate_routes(
        self,
        origin: dict,
        destination: dict,
        vehicle_weight_kg: int,
        max_speed_kmph: int,
        departure_time: str = 'now',
        combustion: bool = True,
    ) -> list[dict]:
        headers = {
            'Content-Type': 'application/json',
            'TomTom-Api-Version': '3',
            'TomTom-Api-Key': self.api_key,
            'Attributes': 'routes(summary,legs(path,summary))',
        }
        payload = {
            'routePlanningLocations': {
                'origin': {'type': 'Point', 'coordinates': [origin['lon'], origin['lat']]},
                'destination': {'type': 'Point', 'coordinates': [destination['lon'], destination['lat']]},
            },
            'departureDateTime': departure_time or 'now',
            'routeType': 'fast',
            'travelMode': 'car',
            'traffic': 'live',
            'maxPathAlternativeRoutes': 4,
            'vehicleEngineType': 'combustion' if combustion else 'electric',
            'vehicleWeightInKilograms': max(0, int(vehicle_weight_kg)),
            'vehicleMaxSpeedInKilometersPerHour': max(0, min(int(max_speed_kmph), 250)),
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(ROUTING_URL, headers=headers, json=payload)
            if response.is_error:
                try:
                    detail = response.json().get('detailedError', {}).get('message')
                except Exception:
                    detail = response.text
                raise ValueError(detail or f'TomTom routing failed ({response.status_code})')
            data = response.json()

        parsed = []
        for index, route in enumerate(data.get('routes', [])):
            summary = route.get('summary', {})
            coordinates = []
            for leg in route.get('legs', []):
                leg_coordinates = leg.get('path', {}).get('coordinates', [])
                if coordinates and leg_coordinates and coordinates[-1] == leg_coordinates[0]:
                    coordinates.extend(leg_coordinates[1:])
                else:
                    coordinates.extend(leg_coordinates)

            parsed.append({
                'candidate_id': f'candidate-{index + 1}',
                'distance_km': round(summary.get('lengthInMeters', 0) / 1000, 2),
                'duration_minutes': round(summary.get('travelDurationInSeconds', 0) / 60, 2),
                'traffic_delay_minutes': round(summary.get('trafficDelayDurationInSeconds', 0) / 60, 2),
                'coordinates': coordinates,
            })

        parsed = [route for route in parsed if route['distance_km'] > 0 and len(route['coordinates']) > 1]
        if not parsed:
            raise ValueError('TomTom returned no usable routes')
        return parsed