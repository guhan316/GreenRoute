import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.models import DispatchPlanRequest
from app.services.dispatch import solve_fleet_dispatch


PAYLOAD = {
    'depot': {'label': 'Chennai Depot', 'address': 'Chennai', 'lat': 13.0827, 'lon': 80.2707},
    'orders': [
        {'order_id': 'ORD-001', 'customer': 'Tambaram Store', 'place': {'label': 'Tambaram', 'lat': 12.9249, 'lon': 80.1000}, 'weight_kg': 900, 'priority': 4, 'cargo_type': 'general', 'status': 'pending'},
        {'order_id': 'ORD-002', 'customer': 'Chengalpattu Hospital', 'place': {'label': 'Chengalpattu', 'lat': 12.6819, 'lon': 79.9888}, 'weight_kg': 700, 'priority': 5, 'cargo_type': 'medical', 'status': 'pending'},
        {'order_id': 'ORD-003', 'customer': 'Puducherry Hub', 'place': {'label': 'Puducherry', 'lat': 11.9416, 'lon': 79.8083}, 'weight_kg': 1200, 'priority': 3, 'cargo_type': 'bulk', 'status': 'pending'},
    ],
    'vehicles': [
        {'vehicle_id': 'VEH-01', 'label': 'Tata Intra V30', 'driver': 'Driver A', 'capacity_kg': 1800, 'available': True},
        {'vehicle_id': 'VEH-02', 'label': 'Ashok Leyland Dost', 'driver': 'Driver B', 'capacity_kg': 1800, 'available': True},
    ],
}


class DispatchSolverTests(unittest.TestCase):
    def test_orders_are_assigned_once_within_capacity(self):
        result = solve_fleet_dispatch(DispatchPlanRequest(**PAYLOAD))
        assigned = [order['order_id'] for route in result['assignments'] for order in route['orders']]
        self.assertEqual(sorted(assigned), ['ORD-001', 'ORD-002', 'ORD-003'])
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertEqual(result['unassigned_order_ids'], [])
        for route in result['assignments']:
            self.assertLessEqual(route['load_kg'], route['capacity_kg'])
        self.assertGreater(result['total_distance_km_estimate'], 0)

    def test_unavailable_vehicle_is_not_used(self):
        payload = {**PAYLOAD, 'vehicles': [
            {**PAYLOAD['vehicles'][0], 'capacity_kg': 3000},
            {**PAYLOAD['vehicles'][1], 'available': False},
        ]}
        result = solve_fleet_dispatch(DispatchPlanRequest(**payload))
        self.assertEqual(result['vehicle_count'], 1)
        self.assertEqual(result['assignments'][0]['vehicle_id'], 'VEH-01')

    def test_insufficient_capacity_is_rejected(self):
        payload = {**PAYLOAD, 'vehicles': [
            {**PAYLOAD['vehicles'][0], 'capacity_kg': 1000},
            {**PAYLOAD['vehicles'][1], 'available': False},
        ]}
        with self.assertRaisesRegex(ValueError, 'Fleet capacity is insufficient'):
            solve_fleet_dispatch(DispatchPlanRequest(**payload))


class DispatchApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_dispatch_endpoint(self):
        response = self.client.post('/api/dispatch/optimize', json=PAYLOAD)
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertEqual(data['solver'], 'Google OR-Tools CVRP')
        self.assertEqual(data['assigned_order_count'], 3)
        self.assertEqual(data['unassigned_order_ids'], [])

    def test_dispatch_endpoint_rejects_capacity_shortage(self):
        payload = {**PAYLOAD, 'vehicles': [{**PAYLOAD['vehicles'][0], 'capacity_kg': 500}]}
        response = self.client.post('/api/dispatch/optimize', json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn('Fleet capacity is insufficient', response.json()['detail'])


if __name__ == '__main__':
    unittest.main()
