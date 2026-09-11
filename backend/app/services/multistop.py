"""Compose road legs in the manager's chosen delivery order."""
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
    legs = []
    for index, (origin, destination) in enumerate(zip(places, places[1:])):
        if origin.lat == destination.lat and origin.lon == destination.lon:
            raise ValueError('Consecutive stops must have different coordinates')
        result = await optimize_leg(RouteOptimizationRequest(
            origin=origin, destination=destination, load_kg=remaining,
            vehicle=request.vehicle, vehicle_type=request.vehicle_type,
            fuel_price_per_litre=request.fuel_price_per_litre,
            electricity_price_per_kwh=request.electricity_price_per_kwh,
        ))
        legs.append(result)
        if index < len(request.stops):
            remaining = max(0, remaining - request.stops[index].weight_kg)
    totals = {}
    for kind in ('fastest', 'balanced', 'greenest'):
        selected = [leg['recommendations'][kind] for leg in legs]
        totals[kind] = {
            'kind': kind,
            **{key: round(sum(route[key] for route in selected), 2)
               for key in ('distance_km', 'duration_minutes', 'fuel_cost', 'co2_kg')},
            'coordinates': [point for route in selected for point in route['coordinates']],
        }
    return {
        'routes': list(totals.values()),
        'legs': [{'origin': leg['origin'], 'destination': leg['destination'],
                  'mode': leg['mode'], 'provider': leg['routing_provider']} for leg in legs],
        'mode': 'demo' if any(leg['mode'] == 'demo' for leg in legs) else 'live',
        'notice': 'Stops follow your chosen order. Each strategy combines that strategy’s road choice for each leg; this is not a global multi-stop optimum. ETAs exclude service time and future traffic changes.',
    }
