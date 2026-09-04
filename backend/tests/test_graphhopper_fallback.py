import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app
from app.services.graphhopper import GraphHopperClient
from app.services.tomtom import TomTomClient


class GraphHopperFallbackTests(unittest.TestCase):
    def test_graphhopper_parser_returns_greenroute_candidates(self):
        payload = {
            'paths': [
                {
                    'distance': 172450.0,
                    'time': 10800000,
                    'points': {
                        'type': 'LineString',
                        'coordinates': [
                            [79.8083, 11.9416],
                            [79.2, 12.2],
                            [78.1198, 12.9165],
                        ],
                    },
                }
            ]
        }
        routes = GraphHopperClient._parse_paths(payload)
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]['source_route_type'], 'graphhopper-fallback')
        self.assertEqual(routes[0]['distance_km'], 172.45)
        self.assertEqual(routes[0]['duration_minutes'], 180.0)
        self.assertEqual(routes[0]['traffic_delay_minutes'], 0.0)
        self.assertEqual(len(routes[0]['coordinates']), 3)

    def test_graphhopper_parser_drops_invalid_paths(self):
        payload = {
            'paths': [
                {'distance': 0, 'time': 1000, 'points': {'coordinates': [[79, 11], [80, 12]]}},
                {'distance': 1000, 'time': 0, 'points': {'coordinates': [[79, 11], [80, 12]]}},
                {'distance': 1000, 'time': 1000, 'points': {'coordinates': [[79, 11]]}},
            ]
        }
        self.assertEqual(GraphHopperClient._parse_paths(payload), [])

    def test_api_uses_graphhopper_when_tomtom_routing_fails(self):
        origin = {'label': 'Puducherry', 'address': 'Puducherry', 'lat': 11.9416, 'lon': 79.8083}
        destination = {'label': 'Chennai', 'address': 'Chennai', 'lat': 13.0827, 'lon': 80.2707}
        fallback_routes = [
            {
                'candidate_id': 'graphhopper-1',
                'source_route_type': 'graphhopper-fallback',
                'distance_km': 155.0,
                'duration_minutes': 190.0,
                'traffic_delay_minutes': 0.0,
                'coordinates': [[79.8083, 11.9416], [80.2707, 13.0827]],
            },
            {
                'candidate_id': 'graphhopper-2',
                'source_route_type': 'graphhopper-fallback',
                'distance_km': 162.0,
                'duration_minutes': 205.0,
                'traffic_delay_minutes': 0.0,
                'coordinates': [[79.8083, 11.9416], [79.95, 12.5], [80.2707, 13.0827]],
            },
            {
                'candidate_id': 'graphhopper-3',
                'source_route_type': 'graphhopper-fallback',
                'distance_km': 170.0,
                'duration_minutes': 220.0,
                'traffic_delay_minutes': 0.0,
                'coordinates': [[79.8083, 11.9416], [79.7, 12.6], [80.2707, 13.0827]],
            },
        ]

        client = TestClient(app)
        with (
            patch.object(main_module.settings, 'tomtom_api_key', 'test-tomtom'),
            patch.object(main_module.settings, 'graphhopper_api_key', 'test-graphhopper'),
            patch.object(TomTomClient, 'resolve_location', new=AsyncMock(side_effect=[origin, destination])),
            patch.object(TomTomClient, 'calculate_routes', new=AsyncMock(side_effect=ValueError('temporary TomTom failure'))),
            patch.object(GraphHopperClient, 'calculate_routes', new=AsyncMock(return_value=fallback_routes)),
        ):
            response = client.post('/api/routes/optimize', json={
                'origin': 'Puducherry',
                'destination': 'Chennai',
                'load_kg': 500,
                'vehicle_type': 'lcv',
                'fuel_price_per_litre': 92.5,
                'departure_time': 'now',
            })

        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['mode'], 'live')
        self.assertEqual(data['routing_provider'], 'graphhopper-fallback')
        self.assertFalse(data['traffic_aware'])
        self.assertGreaterEqual(data['candidate_count'], 1)
        self.assertIn('GraphHopper', data['notice'])


if __name__ == '__main__':
    unittest.main()
