import unittest

from app.services.tomtom import TomTomClient


class TomTomSearchHotfixTests(unittest.TestCase):
    def test_parser_preserves_poi_name_and_coordinates(self):
        payload = {
            'results': [{
                'id': 'poi-1',
                'type': 'POI',
                'poi': {'name': 'Example College'},
                'position': {'lat': 11.91, 'lon': 79.63},
                'address': {'freeformAddress': 'Example Address 605107', 'postalCode': '605107'},
            }]
        }
        result = TomTomClient._parse_search_results(payload, 'Example College')[0]
        self.assertEqual(result['label'], 'Example College')
        self.assertEqual(result['postal_code'], '605107')
        self.assertAlmostEqual(result['lat'], 11.91)
        self.assertAlmostEqual(result['lon'], 79.63)


if __name__ == '__main__':
    unittest.main()
