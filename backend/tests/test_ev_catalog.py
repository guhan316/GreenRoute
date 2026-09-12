import unittest
from unittest.mock import patch
import httpx
from app.models import VehicleInput
from app.services.carbon import build_vehicle_profile, estimate_trip_metrics, get_vehicle_profile
from app.services.catalog import VehicleCatalogService, bundled_catalog, merge_catalog

class EmissionsTests(unittest.TestCase):
    def test_ev_has_zero_tailpipe_and_separate_electricity(self):
        vehicle = VehicleInput(manufacturer='Test', model='EV', manufacture_year=2025,
            fuel_type='electric', max_payload_kg=1000, kerb_weight_kg=1000,
            energy_consumption_kwh_per_km=0.2, emission_stage='BS VI')
        profile = build_vehicle_profile(vehicle)
        result = estimate_trip_metrics({'distance_km':100, 'duration_minutes':120}, profile, 0, 92.5)
        self.assertEqual(profile.emission_stage, 'Not applicable (EV)')
        self.assertEqual(result['tailpipe_co2_kg'], 0)
        self.assertEqual(result['energy_kwh'], 20)
        self.assertAlmostEqual(result['electricity_co2_kg'], 14.32)
        self.assertEqual(result['co2_kg'], result['electricity_co2_kg'])

    def test_diesel_emissions_are_tailpipe(self):
        result = estimate_trip_metrics({'distance_km':100, 'duration_minutes':120}, get_vehicle_profile('lcv'), 0, 92.5)
        self.assertEqual(result['electricity_co2_kg'], 0)
        self.assertEqual(result['tailpipe_co2_kg'], result['co2_kg'])
        self.assertGreater(result['tailpipe_co2_kg'], 0)

class CatalogTests(unittest.IsolatedAsyncioTestCase):
    async def test_without_database_catalog_is_available(self):
        rows = await VehicleCatalogService('', '').list_catalog()
        self.assertGreaterEqual(len(rows), 30)
        self.assertEqual(len({row['id'] for row in rows}), len(rows))
        self.assertTrue(all(row['source_url'].startswith('https://') for row in rows))
        self.assertEqual(len({row['category'] for row in rows}), 9)

    async def test_provider_failure_returns_bundled_catalog(self):
        with patch.dict('os.environ', {}, clear=True), patch('httpx.AsyncClient.get', side_effect=httpx.ConnectError('offline')):
            rows = await VehicleCatalogService('https://example.test', 'test').list_catalog()
        self.assertEqual(rows, bundled_catalog())

    def test_merge_retains_remote_id_and_custom_rows(self):
        row = bundled_catalog()[0]
        remote = [{**row, 'id':'database-id'}, {**row, 'id':'custom-id', 'model':'Custom fleet model'}]
        merged = merge_catalog(remote, [row])
        self.assertEqual(len(merged), 2)
        self.assertEqual(next(x for x in merged if x['model'] == row['model'])['id'], 'database-id')
