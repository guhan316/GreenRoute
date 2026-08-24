def _normalize(values: list[float]) -> list[float]:
    low, high = min(values), max(values)
    if high == low:
        return [0.0 for _ in values]
    return [(value - low) / (high - low) for value in values]


def build_recommendations(routes: list[dict]) -> dict:
    if not routes:
        raise ValueError("No route candidates were returned")

    time_scores = _normalize([route["duration_minutes"] for route in routes])
    cost_scores = _normalize([route["fuel_cost"] for route in routes])
    carbon_scores = _normalize([route["co2_kg"] for route in routes])

    enriched = []
    for index, route in enumerate(routes):
        balanced_score = (0.40 * time_scores[index]) + (0.30 * cost_scores[index]) + (0.30 * carbon_scores[index])
        enriched.append({**route, "balanced_score": round(balanced_score, 4)})

    fastest = min(enriched, key=lambda route: route["duration_minutes"])
    balanced = min(enriched, key=lambda route: route["balanced_score"])
    greenest = min(enriched, key=lambda route: (route["co2_kg"], route["fuel_cost"], route["duration_minutes"]))

    return {
        "candidates": enriched,
        "recommendations": {
            "fastest": fastest,
            "balanced": balanced,
            "greenest": greenest,
        },
    }
