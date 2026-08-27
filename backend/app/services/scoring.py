def _normalize(values: list[float]) -> list[float]:
    low, high = min(values), max(values)
    if high == low:
        return [0.0 for _ in values]
    return [(value - low) / (high - low) for value in values]


def _percent_change(reference: float, value: float) -> float:
    if reference == 0:
        return 0.0
    return ((reference - value) / reference) * 100


def _decorate_recommendation(route: dict, kind: str, fastest: dict) -> dict:
    extra_minutes = route['duration_minutes'] - fastest['duration_minutes']
    cost_saved = fastest['fuel_cost'] - route['fuel_cost']
    carbon_saved = fastest['co2_kg'] - route['co2_kg']

    if kind == 'fastest':
        reason = 'Lowest traffic-adjusted travel time among the evaluated route candidates.'
        best_for = 'Emergencies, hospitals, medicines and time-critical shipments'
    elif kind == 'balanced':
        if route.get('diversity_selected'):
            reason = (
                "Best distinct compromise close to GreenRoute's weighted optimum, using 40% time, "
                '30% fuel-cost and 30% carbon while preserving a visibly different middle option.'
            )
        else:
            reason = (
                "Best overall compromise using GreenRoute's 40% time, 30% fuel-cost and "
                '30% carbon weighting.'
            )
        best_for = 'Everyday logistics where time, operating cost and sustainability all matter'
    else:
        reason = (
            'Lowest estimated CO2 emissions among the evaluated candidates, with fuel cost '
            'and journey time used as tie-breakers.'
        )
        best_for = 'Planned, bulk and sustainability-prioritised deliveries'

    return {
        **route,
        'strategy': kind,
        'reason': reason,
        'best_for': best_for,
        'tradeoff': {
            'extra_minutes_vs_fastest': round(extra_minutes, 2),
            'fuel_cost_saved_vs_fastest': round(cost_saved, 2),
            'co2_saved_kg_vs_fastest': round(carbon_saved, 2),
            'fuel_cost_saved_pct_vs_fastest': round(
                _percent_change(fastest['fuel_cost'], route['fuel_cost']), 2
            ),
            'co2_saved_pct_vs_fastest': round(
                _percent_change(fastest['co2_kg'], route['co2_kg']), 2
            ),
        },
    }


def build_recommendations(routes: list[dict]) -> dict:
    if not routes:
        raise ValueError('No route candidates were returned')

    time_scores = _normalize([route['duration_minutes'] for route in routes])
    cost_scores = _normalize([route['fuel_cost'] for route in routes])
    carbon_scores = _normalize([route['co2_kg'] for route in routes])

    enriched = []
    for index, route in enumerate(routes):
        balanced_score = (
            (0.40 * time_scores[index])
            + (0.30 * cost_scores[index])
            + (0.30 * carbon_scores[index])
        )
        enriched.append(
            {
                **route,
                'balanced_score': round(balanced_score, 4),
                'score_breakdown': {
                    'time': round(time_scores[index], 4),
                    'cost': round(cost_scores[index], 4),
                    'carbon': round(carbon_scores[index], 4),
                },
            }
        )

    fastest = min(enriched, key=lambda route: route['duration_minutes'])
    greenest = min(
        enriched,
        key=lambda route: (
            route['co2_kg'],
            route['fuel_cost'],
            route['duration_minutes'],
        ),
    )

    balanced_best = min(enriched, key=lambda route: route['balanced_score'])
    balanced = balanced_best

    # GreenRoute is a three-strategy product. When a genuinely different candidate is
    # nearly as good as the unconstrained weighted optimum, prefer that candidate for
    # Balanced so users see a real middle trade-off instead of duplicate cards.
    # We never accept a route more than 0.18 normalized-score points worse just to differ.
    reserved_ids = {fastest.get('candidate_id'), greenest.get('candidate_id')}
    distinct_balanced = [
        route for route in enriched
        if route.get('candidate_id') not in reserved_ids
    ]
    if distinct_balanced:
        alternative = min(distinct_balanced, key=lambda route: route['balanced_score'])
        if alternative['balanced_score'] <= balanced_best['balanced_score'] + 0.18:
            balanced = {**alternative, 'diversity_selected': True}

    recommendations = {
        'fastest': _decorate_recommendation(fastest, 'fastest', fastest),
        'balanced': _decorate_recommendation(balanced, 'balanced', fastest),
        'greenest': _decorate_recommendation(greenest, 'greenest', fastest),
    }

    recommendation_ids = [recommendations[k].get('candidate_id') for k in ('fastest', 'balanced', 'greenest')]
    return {
        'candidates': enriched,
        'recommendations': recommendations,
        'comparison_baseline': 'fastest',
        'distinct_recommendation_count': len(set(recommendation_ids)),
    }
