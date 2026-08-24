import math


CITY_COORDS = {
    "chennai": (80.2707, 13.0827),
    "bengaluru": (77.5946, 12.9716),
    "bangalore": (77.5946, 12.9716),
    "puducherry": (79.8083, 11.9416),
    "pondicherry": (79.8083, 11.9416),
    "coimbatore": (76.9558, 11.0168),
    "madurai": (78.1198, 9.9252),
    "hyderabad": (78.4867, 17.3850),
    "mumbai": (72.8777, 19.0760),
    "pune": (73.8567, 18.5204),
    "kochi": (76.2673, 9.9312),
    "delhi": (77.1025, 28.7041),
}


def geocode_demo(query: str) -> dict:
    lowered = query.lower()
    for city, (lon, lat) in CITY_COORDS.items():
        if city in lowered:
            return {"label": query, "lat": lat, "lon": lon}
    supported = ", ".join(sorted({name.title() for name in CITY_COORDS}))
    raise ValueError(
        "Demo mode only supports selected Indian cities. "
        f"Supported: {supported}. Add TOMTOM_API_KEY for arbitrary addresses."
    )


def _haversine_km(a: dict, b: dict) -> float:
    radius = 6371.0088
    lon1, lat1 = math.radians(a["lon"]), math.radians(a["lat"])
    lon2, lat2 = math.radians(b["lon"]), math.radians(b["lat"])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _curve(origin: dict, destination: dict, bend: float, points: int = 14) -> list[list[float]]:
    x1, y1 = origin["lon"], origin["lat"]
    x2, y2 = destination["lon"], destination["lat"]
    dx, dy = x2 - x1, y2 - y1
    length = max(math.hypot(dx, dy), 0.001)
    px, py = -dy / length, dx / length

    coords = []
    for index in range(points):
        t = index / (points - 1)
        envelope = 4 * t * (1 - t)
        offset = bend * envelope
        coords.append([
            round(x1 + (dx * t) + (px * offset), 6),
            round(y1 + (dy * t) + (py * offset), 6),
        ])
    return coords


def calculate_demo_routes(origin: dict, destination: dict) -> list[dict]:
    straight_km = max(_haversine_km(origin, destination), 5.0)
    profiles = [
        ("candidate-1", 1.18, 68, 34, 0.20),
        ("candidate-2", 1.14, 64, 18, -0.12),
        ("candidate-3", 1.09, 54, 7, -0.28),
        ("candidate-4", 1.22, 61, 12, 0.38),
    ]

    routes = []
    for candidate_id, road_factor, cruise_kmph, delay_minutes, bend in profiles:
        distance_km = straight_km * road_factor
        moving_minutes = (distance_km / cruise_kmph) * 60
        routes.append({
            "candidate_id": candidate_id,
            "distance_km": round(distance_km, 2),
            "duration_minutes": round(moving_minutes + delay_minutes, 2),
            "traffic_delay_minutes": float(delay_minutes),
            "coordinates": _curve(origin, destination, bend),
        })
    return routes
