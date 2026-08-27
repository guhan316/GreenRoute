import unittest

from app.services.scoring import build_recommendations
from app.services.tomtom import TomTomClient


class RouteDiversityTests(unittest.TestCase):
    def test_balanced_can_choose_distinct_practical_middle_route(self):
        routes = [
            {
                'candidate_id': 'fast-1',
                'source_route_type': 'fast',
                'duration_minutes': 300,
                'fuel_cost': 5000,
                'co2_kg': 130,
            },
            {
                'candidate_id': 'fast-2',
                'source_route_type': 'fast',
                'duration_minutes': 312,
                'fuel_cost': 4450,
                'co2_kg': 116,
            },
            {
                'candidate_id': 'efficient-1',
                'source_route_type': 'efficient',
                'duration_minutes': 330,
                'fuel_cost': 3500,
                'co2_kg': 90,
            },
        ]

        result = build_recommendations(routes)
        recommendations = result['recommendations']

        self.assertEqual(recommendations['fastest']['candidate_id'], 'fast-1')
        self.assertEqual(recommendations['greenest']['candidate_id'], 'efficient-1')
        self.assertEqual(recommendations['balanced']['candidate_id'], 'fast-2')
        self.assertTrue(recommendations['balanced']['diversity_selected'])
        self.assertEqual(result['distinct_recommendation_count'], 3)

    def test_balanced_is_not_forced_to_a_bad_distinct_route(self):
        routes = [
            {
                'candidate_id': 'fast-1',
                'source_route_type': 'fast',
                'duration_minutes': 300,
                'fuel_cost': 5000,
                'co2_kg': 130,
            },
            {
                'candidate_id': 'efficient-1',
                'source_route_type': 'efficient',
                'duration_minutes': 305,
                'fuel_cost': 3500,
                'co2_kg': 90,
            },
            {
                'candidate_id': 'detour',
                'source_route_type': 'short',
                'duration_minutes': 600,
                'fuel_cost': 7000,
                'co2_kg': 180,
            },
        ]

        result = build_recommendations(routes)['recommendations']
        self.assertNotEqual(result['balanced']['candidate_id'], 'detour')
        self.assertIn('greenest', result['balanced'].get('shared_physical_route_with', []))

    def test_route_deduplication_keeps_meaningfully_different_geometry(self):
        route_a = {
            'candidate_id': 'fast-1',
            'distance_km': 100.0,
            'duration_minutes': 120.0,
            'coordinates': [[79.60, 11.90], [79.65, 11.85], [79.70, 11.80], [79.75, 11.75]],
        }
        route_b = {
            'candidate_id': 'efficient-1',
            'distance_km': 98.0,
            'duration_minutes': 124.0,
            'coordinates': [[79.60, 11.90], [79.62, 11.86], [79.68, 11.81], [79.75, 11.75]],
        }
        self.assertFalse(TomTomClient._routes_are_duplicate(route_a, route_b))

    def test_route_deduplication_removes_effectively_identical_route(self):
        route_a = {
            'candidate_id': 'fast-1',
            'distance_km': 100.0,
            'duration_minutes': 120.0,
            'coordinates': [[79.60, 11.90], [79.65, 11.85], [79.70, 11.80], [79.75, 11.75]],
        }
        route_b = {
            'candidate_id': 'efficient-1',
            'distance_km': 100.05,
            'duration_minutes': 120.2,
            'coordinates': [[79.60, 11.90], [79.6502, 11.8501], [79.7001, 11.8002], [79.75, 11.75]],
        }
        self.assertTrue(TomTomClient._routes_are_duplicate(route_a, route_b))

    def test_short_route_request_threshold_is_distance_based(self):
        origin = {'lat': 11.91, 'lon': 79.63}
        destination = {'lat': 11.75, 'lon': 79.77}
        self.assertLess(TomTomClient._straight_line_km(origin, destination), 450)


if __name__ == '__main__':
    unittest.main()
