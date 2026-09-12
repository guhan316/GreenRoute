import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app, estimate_trip_metrics

class MultiStopTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.payload = {'depot': {'label':'Chennai', 'lat':13.08, 'lon':80.27}, 'stops': [
            {'place': {'label':'Tambaram', 'lat':12.92, 'lon':80.1}, 'weight_kg':100},
            {'place': {'label':'Puducherry', 'lat':11.94, 'lon':79.8}, 'weight_kg':200}], 'return_to_depot':True}

    @patch('app.main.settings')
    def test_round_trip_coordinates_and_decreasing_load(self, settings):
        settings.graphhopper_api_key = ''; settings.tomtom_api_key = ''; settings.demo_fallback_enabled = True
        with patch('app.main.estimate_trip_metrics', wraps=estimate_trip_metrics) as metrics:
            response = self.client.post('/api/routes/multi-stop', json=self.payload)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual([call.args[2] for call in metrics.call_args_list], [300]*4 + [200]*4 + [0]*4)
        body = response.json()
        self.assertEqual(len(body['legs']), 3)
        self.assertEqual(body['legs'][0]['destination']['lat'], 12.92)
        self.assertEqual(body['mode'], 'demo')
        for route in body['routes']:
            self.assertEqual(route['coordinates'][0], route['coordinates'][-1])
            self.assertGreater(route['co2_kg'], 0)

    def test_capacity_and_empty_stops(self):
        self.payload['stops'][0]['weight_kg'] = 50000
        self.assertEqual(self.client.post('/api/routes/multi-stop', json=self.payload).status_code, 400)
        self.payload['stops'] = []
        self.assertEqual(self.client.post('/api/routes/multi-stop', json=self.payload).status_code, 422)

    def test_duplicate_consecutive_stop(self):
        self.payload['stops'][0]['place'] = self.payload['depot']
        self.assertEqual(self.client.post('/api/routes/multi-stop', json=self.payload).status_code, 400)

    def test_timeout_returns_actionable_error(self):
        from unittest.mock import AsyncMock
        with patch('app.services.multistop.plan_multi_stop', new=AsyncMock(side_effect=TimeoutError)):
            response = self.client.post('/api/routes/multi-stop', json=self.payload)
        self.assertEqual(response.status_code, 504)
        self.assertIn('fewer stops', response.json()['detail'])

    def test_later_duplicate_rejected_before_routing(self):
        from unittest.mock import AsyncMock
        self.payload['stops'][1]['place'] = self.payload['stops'][0]['place']
        with patch('app.main.optimize_routes', new_callable=AsyncMock) as routing:
            response = self.client.post('/api/routes/multi-stop', json=self.payload)
            routing.assert_not_awaited()
        self.assertEqual(response.status_code, 400)
