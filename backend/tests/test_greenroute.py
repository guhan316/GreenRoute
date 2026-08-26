import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.services.carbon import estimate_trip_metrics, get_vehicle_profile
from app.services.demo import calculate_demo_routes, geocode_demo
from app.services.persistence import SupabasePersistence
from app.services.scoring import build_recommendations


class GreenRouteCoreTests(unittest.TestCase):
    def test_demo_provider_returns_multiple_candidates(self):
        origin = geocode_demo("Chennai, Tamil Nadu")
        destination = geocode_demo("Bengaluru, Karnataka")
        routes = calculate_demo_routes(origin, destination)
        self.assertEqual(len(routes), 4)
        self.assertTrue(all(route["distance_km"] > 0 for route in routes))
        self.assertEqual(routes[0]["coordinates"][0], [origin["lon"], origin["lat"]])
        self.assertEqual(routes[0]["coordinates"][-1], [destination["lon"], destination["lat"]])

    def test_heavier_load_increases_estimated_fuel(self):
        profile = get_vehicle_profile("lcv")
        route = {"candidate_id": "test", "distance_km": 300.0, "duration_minutes": 330.0, "traffic_delay_minutes": 20.0, "coordinates": [[80.27, 13.08], [77.59, 12.97]]}
        light = estimate_trip_metrics(route, profile, 500, 92.5)
        heavy = estimate_trip_metrics(route, profile, 3500, 92.5)
        self.assertGreater(heavy["fuel_litres"], light["fuel_litres"])
        self.assertGreater(heavy["co2_kg"], light["co2_kg"])

    def test_multi_objective_recommendations(self):
        routes = [
            {"candidate_id": "fast", "duration_minutes": 300, "fuel_cost": 5000, "co2_kg": 130},
            {"candidate_id": "balanced", "duration_minutes": 320, "fuel_cost": 4200, "co2_kg": 112},
            {"candidate_id": "green", "duration_minutes": 370, "fuel_cost": 3600, "co2_kg": 96},
        ]
        result = build_recommendations(routes)["recommendations"]
        self.assertEqual(result["fastest"]["candidate_id"], "fast")
        self.assertEqual(result["balanced"]["candidate_id"], "balanced")
        self.assertEqual(result["greenest"]["candidate_id"], "green")
        self.assertEqual(result["fastest"]["tradeoff"]["extra_minutes_vs_fastest"], 0)
        self.assertGreater(result["balanced"]["tradeoff"]["fuel_cost_saved_vs_fastest"], 0)
        self.assertGreater(result["greenest"]["tradeoff"]["co2_saved_pct_vs_fastest"], 0)
        self.assertIn("40% time", result["balanced"]["reason"])
        self.assertIn("sustainability", result["greenest"]["best_for"].lower())

    def test_dashboard_uses_selected_route_and_fastest_baseline(self):
        history = [{
            "selected_strategy": "greenest",
            "route_candidates": [
                {"distance_km": 350, "fuel_litres": 50, "fuel_cost": 4600, "co2_kg": 134, "recommended_as": ["fastest"]},
                {"distance_km": 340, "fuel_litres": 42, "fuel_cost": 3864, "co2_kg": 112.56, "recommended_as": ["greenest"]},
            ],
        }]
        dashboard = SupabasePersistence.build_dashboard(history)
        self.assertEqual(dashboard["trip_count"], 1)
        self.assertEqual(dashboard["strategy_counts"]["greenest"], 1)
        self.assertEqual(dashboard["distance_km"], 340)
        self.assertGreater(dashboard["co2_saved_kg"], 20)
        self.assertGreater(dashboard["fuel_cost_saved"], 700)
        self.assertEqual(dashboard["green_route_share"], 1.0)


class GreenRouteApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn(data["routing_mode"], {"demo", "live"})
        self.assertIn("supabase_persistence_configured", data)

    def test_demo_optimization_end_to_end(self):
        response = self.client.post(
            "/api/routes/optimize",
            json={"origin": "Chennai, Tamil Nadu", "destination": "Bengaluru, Karnataka", "load_kg": 2500, "vehicle_type": "lcv", "fuel_price_per_litre": 92.5, "departure_time": "now"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertGreaterEqual(data["candidate_count"], 3)
        self.assertEqual(set(data["recommendations"]), {"fastest", "balanced", "greenest"})
        self.assertEqual(data["comparison_baseline"], "fastest")
        for route in data["recommendations"].values():
            self.assertGreater(route["fuel_litres"], 0)
            self.assertGreater(route["co2_kg"], 0)
            self.assertGreater(len(route["coordinates"]), 1)
            self.assertIn("tradeoff", route)
            self.assertIn("reason", route)
            self.assertIn("best_for", route)


if __name__ == "__main__":
    unittest.main()
