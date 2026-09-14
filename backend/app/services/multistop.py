"""Compose road legs in the manager's chosen delivery order."""
import asyncio

from ..models import RouteOptimizationRequest
from .carbon import build_vehicle_profile, get_vehicle_profile


async def plan_multi_stop(request, optimize_leg):
    profile = build_vehicle_profile(request.vehicle) if request.vehicle else get_vehicle_profile(request.vehicle_type)
    remaining = sum(stop.weight_kg for stop in request.stops)
    if remaining > profile.max_payload_kg:
        raise ValueError(f'Total load {remaining:g} kg exceeds vehicle capacity {profile.max_payload_kg:g} kg')
    places = [request.depot] + [stop.place for stop in request.stops]
    if request.return_to_depot:
        places.append(request.depot)
    # Validate the entire itinerary before spending provider requests.
    requests = []
    for index, (origin, destination) in enumerate(zip(places, places[1:])):
        if origin.lat == destination.lat and origin.lon == destination.lon:
            raise ValueError('Consecutive stops must have different coordinates')
        requests.append(RouteOptimizationRequest(
            origin=origin, destination=destination, load_kg=remaining,
            vehicle=request.vehicle, vehicle_type=request.vehicle_type,
            fuel_price_per_litre=request.fuel_price_per_litre,
            electricity_price_per_kwh=request.electricity_price_per_kwh,
            objective_weights=request.objective_weights,
        ))
        if index < len(request.stops):
            remaining = max(0, remaining - request.stops[index].weight_kg)
    # Bound provider concurrency and finish before Vercel's 60-second deadline.
    semaphore = asyncio.Semaphore(7)
    async def calculate(leg):
        async with semaphore:
            try:
                return await asyncio.wait_for(optimize_leg(leg), timeout=22)
            except Exception as exc:
                detail = getattr(exc, 'detail', None) or str(exc) or 'Routing timed out'
                raise ValueError(f"Leg {leg.origin.label} → {leg.destination.label}: {detail}. Check these pins or retry.") from exc
    tasks = [asyncio.create_task(calculate(leg)) for leg in requests]
    try:
        async with asyncio.timeout(50):
            legs = await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    totals = {}
    for kind in ('fastest', 'balanced', 'greenest'):
        selected = [leg['recommendations'][kind] for leg in legs]
        totals[kind] = {
            'kind': kind,
            'fuel_type': selected[0].get('fuel_type'),
            'leg_candidate_ids': [route.get('candidate_id') for route in selected],
            **{key: round(sum(route.get(key, 0) for route in selected), 2)
               for key in ('tailpipe_co2_kg', 'electricity_co2_kg', 'energy_kwh')},
            **{key: round(sum(route[key] for route in selected), 2)
               for key in ('distance_km', 'duration_minutes', 'fuel_cost', 'co2_kg')},
            'coordinates': [point for route in selected for point in route['coordinates']],
        }
    for kind, route in totals.items():
        route['shared_physical_route_with'] = [other for other, value in totals.items()
            if other != kind and value['leg_candidate_ids'] == route['leg_candidate_ids']]
    return {
        'objective_weights': request.objective_weights.model_dump(),
        'routes': list(totals.values()),
        'legs': [{'origin': leg['origin'], 'destination': leg['destination'],
                  'mode': leg['mode'], 'provider': leg['routing_provider']} for leg in legs],
        'mode': 'demo' if any(leg['mode'] == 'demo' for leg in legs) else 'live',
        'notice': 'Stops follow your chosen order. Each strategy combines that strategy’s road choice for each leg; this is not a global multi-stop optimum. ETAs exclude service time and future traffic changes.',
    }
