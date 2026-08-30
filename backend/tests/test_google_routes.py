import unittest

from app.services.google_routes import GoogleRoutesClient, _decode_polyline, _duration_seconds


class GoogleRoutesTests(unittest.TestCase):
    def test_duration_parser(self):
        self.assertEqual(_duration_seconds("600s"), 600.0)
        self.assertEqual(_duration_seconds("3.5s"), 3.5)
        self.assertEqual(_duration_seconds(None), 0.0)

    def test_polyline_decoder_returns_lon_lat_pairs(self):
        points = _decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        self.assertEqual(len(points), 3)
        self.assertAlmostEqual(points[0][0], -120.2, places=4)
        self.assertAlmostEqual(points[0][1], 38.5, places=4)
        self.assertAlmostEqual(points[-1][0], -126.453, places=4)
        self.assertAlmostEqual(points[-1][1], 43.252, places=4)

    def test_parse_routes_preserves_live_traffic_delay(self):
        data = {
            "routes": [
                {
                    "distanceMeters": 12000,
                    "duration": "900s",
                    "staticDuration": "780s",
                    "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
                    "description": "Main road",
                    "routeLabels": ["DEFAULT_ROUTE"],
                }
            ]
        }
        route = GoogleRoutesClient._parse_routes(data)[0]
        self.assertEqual(route["candidate_id"], "google-1")
        self.assertEqual(route["source_route_type"], "google")
        self.assertEqual(route["distance_km"], 12.0)
        self.assertEqual(route["duration_minutes"], 15.0)
        self.assertEqual(route["traffic_delay_minutes"], 2.0)
        self.assertEqual(route["route_labels"], ["DEFAULT_ROUTE"])


if __name__ == "__main__":
    unittest.main()
