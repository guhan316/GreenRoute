import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.models import VehicleInput
from app.services.carbon import build_vehicle_profile, estimate_trip_metrics, get_vehicle_profile, infer_bharat_stage
from app.services.demo import calculate_demo_routes, geocode_demo
from app.services.persistence import SupabasePersistence
from app.services.scoring import build_recommendations
from app.services.tomtom import TomTomClient


class GreenRouteCoreTests(unittest.TestCase):
    def test_demo_provider_returns_multiple_candidates(self):
        origin = geocode_demo('Chennai, Tamil Nadu')
        destination = geocode_demo('Bengaluru, Karnataka')
        routes = calculate_demo_routes(origin, destination)
        self.assertEqual(len(routes), 4)
        self.assertTrue(all(route['distance_km'] > 0 for route in routes))

    def test_tomtom_search_parser_keeps_poi_and_exact_coordinates(self):
        payload = {
            'results': [{
                'id': 'poi-123',
                'type': 'POI',
                'poi': {'name': 'Sri Manakula Vinayagar Engineering College'},
                'position': {'lat': 11.9145, 'lon': 79.6348},
                'address': {
                    'freeformAddress': 'Madagadipet, Puducherry 605107',
                    'postalCode': '605107',
                    'municipality': 'Madagadipet',
                    'countrySubdivisionName': 'Puducherry',
                },
            }]
        }
        results = TomTomClient._parse_search_results(payload, 'SMVEC')
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['label'], 'Sri Manakula Vinayagar Engineering College')
        self.assertEqual(results[0]['postal_code'], '605107')
        self.assertAlmostEqual(results[0]['lat'], 11.9145)
        self.assertAlmostEqual(results[0]['lon'], 79.6348)

    def test_heavier_load_increases_estimated_fuel(self):
        profile = get_vehicle_profile('lcv')
        route = {'candidate_id': 'test', 'distance_km': 300.0, 'duration_minutes': 330.0, 'traffic_delay_minutes': 20.0, 'coordinates': [[80.27, 13.08], [77.59, 12.97]]}
        light = estimate_trip_metrics(route, profile, 500, 92.5)
        heavy = estimate_trip_metrics(route, profile, 3500, 92.5)
        self.assertGreater(heavy['fuel_litres'], light['fuel_litres'])
        self.assertGreater(heavy['co2_kg'], light['co2_kg'])

    def test_bharat_stage_inference(self):
        self.assertEqual(infer_bharat_stage(2024), 'BS VI')
        self.assertEqual(infer_bharat_stage(2018), 'BS IV')
        self.assertIn('verify RC', infer_bharat_stage(2013))

    def test_detailed_vehicle_profile_uses_year_and_identity(self):
        vehicle = VehicleInput(
            manufacturer='Tata Motors', model='Intra V30', manufacture_year=2022,
            fuel_type='diesel', max_payload_kg=1300, kerb_weight_kg=1700,
            base_mileage_kmpl=13.0, max_speed_kmph=80,
        )
        profile = build_vehicle_profile(vehicle)
        self.assertEqual(profile.manufacturer, 'Tata Motors')
        self.assertEqual(profile.model, 'Intra V30')
        self.assertEqual(profile.emission_stage, 'BS VI')
        self.assertEqual(profile.base_mileage_kmpl, 13.0)

    def test_cng_uses_kg_energy_unit(self):
        vehicle = VehicleInput(
            manufacturer='Example', model='CNG Truck', manufacture_year=2023,
            fuel_type='cng', max_payload_kg=1500, kerb_weight_kg=1800,
            base_mileage_kmpl=8.0, max_speed_kmph=70,
        )
        profile = build_vehicle_profile(vehicle)
        route = {'candidate_id': 'cng', 'distance_km': 100.0, 'duration_minutes': 120.0, 'traffic_delay_minutes': 5.0, 'coordinates': [[79.8, 11.7], [79.6, 11.9]]}
        metrics = estimate_trip_metrics(route, profile, 500, 80)
        self.assertEqual(metrics['energy_unit'], 'kg')
        self.assertGreater(metrics['energy_quantity'], 0)
        self.assertEqual(metrics['fuel_litres'], 0.0)

    def test_electric_vehicle_uses_grid_energy(self):
        vehicle = VehicleInput(
            manufacturer='Example', model='EV Truck', manufacture_year=2025,
            fuel_type='electric', max_payload_kg=1000, kerb_weight_kg=1600,
            energy_consumption_kwh_per_km=0.7, max_speed_kmph=70,
        )
        profile = build_vehicle_profile(vehicle)
        route = {'candidate_id': 'ev', 'distance_km': 100.0, 'duration_minutes': 120.0, 'traffic_delay_minutes': 0.0, 'coordinates': [[79.8, 11.7], [79.6, 11.9]]}
        metrics = estimate_trip_metrics(route, profile, 500, 0, 8.0)
        self.assertEqual(metrics['energy_unit'], 'kWh')
        self.assertGreater(metrics['energy_quantity'], 70)
        self.assertGreater(metrics['co2_kg'], 0)

    def test_multi_objective_recommendations(self):
        routes = [
            {'candidate_id': 'fast', 'duration_minutes': 300, 'fuel_cost': 5000, 'co2_kg': 130},
            {'candidate_id': 'balanced', 'duration_minutes': 320, 'fuel_cost': 4200, 'co2_kg': 112},
            {'candidate_id': 'green', 'duration_minutes': 370, 'fuel_cost': 3600, 'co2_kg': 96},
        ]
        result = build_recommendations(routes)['recommendations']
        self.assertEqual(result['fastest']['candidate_id'], 'fast')
        self.assertEqual(result['balanced']['candidate_id'], 'balanced')
        self.assertEqual(result['greenest']['candidate_id'], 'green')
        self.assertIn('40% time', result['balanced']['reason'])

    def test_dashboard_uses_selected_route_and_fastest_baseline(self):
        history = [{'selected_strategy': 'greenest', 'route_candidates': [
            {'distance_km': 350, 'fuel_litres': 50, 'fuel_cost': 4600, 'co2_kg': 134, 'recommended_as': ['fastest']},
            {'distance_km': 340, 'fuel_litres': 42, 'fuel_cost': 3864, 'co2_kg': 112.56, 'recommended_as': ['greenest']},
        ]}]
        dashboard = SupabasePersistence.build_dashboard(history)
        self.assertEqual(dashboard['trip_count'], 1)
        self.assertEqual(dashboard['strategy_counts']['greenest'], 1)
        self.assertEqual(dashboard['distance_km'], 340)
        self.assertGreater(dashboard['co2_saved_kg'], 20)


class GreenRouteApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
        self.assertIn(data['routing_mode'], {'demo', 'live'})
        self.assertIn('vehicle_catalog_configured', data)

    def test_demo_optimization_end_to_end(self):
        response = self.client.post('/api/routes/optimize', json={
            'origin': 'Chennai, Tamil Nadu', 'destination': 'Bengaluru, Karnataka',
            'load_kg': 2500, 'vehicle_type': 'lcv', 'fuel_price_per_litre': 92.5, 'departure_time': 'now',
        })
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertGreaterEqual(data['candidate_count'], 3)
        self.assertEqual(set(data['recommendations']), {'fastest', 'balanced', 'greenest'})
        for route in data['recommendations'].values():
            self.assertGreater(route['fuel_litres'], 0)
            self.assertGreater(route['co2_kg'], 0)
            self.assertGreater(len(route['coordinates']), 1)

    def test_demo_detailed_vehicle_end_to_end(self):
        response = self.client.post('/api/routes/optimize', json={
            'origin': 'Chennai, Tamil Nadu', 'destination': 'Bengaluru, Karnataka', 'load_kg': 500,
            'vehicle': {
                'manufacturer': 'Tata Motors', 'model': 'Intra V30', 'manufacture_year': 2022,
                'fuel_type': 'diesel', 'max_payload_kg': 1300, 'kerb_weight_kg': 1700,
                'base_mileage_kmpl': 13.0, 'max_speed_kmph': 80,
            },
            'fuel_price_per_litre': 92.5, 'departure_time': 'now',
        })
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['vehicle']['manufacturer'], 'Tata Motors')
        self.assertEqual(data['vehicle']['emission_stage'], 'BS VI')


if __name__ == '__main__':
    unittest.main()