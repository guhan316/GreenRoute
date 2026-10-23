import math
from datetime import datetime, timedelta, timezone

from .vrp import solve_capacitated_vrp


def _haversine_km(a: dict, b: dict) -> float:
    radius_km = 6371.0088
    lat1, lon1 = math.radians(float(a['lat'])), math.radians(float(a['lon']))
    lat2, lon2 = math.radians(float(b['lat'])), math.radians(float(b['lon']))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return radius_km * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0.0, 1 - h)))


def _distance_matrix(points: list[dict]) -> list[list[int]]:
    # OR-Tools needs integer arc costs. A 1.22 road factor is used only for
    # fleet assignment; final road geometry should still come from GreenRoute routing providers.
    matrix = []
    for source in points:
        row = []
        for target in points:
            if source is target:
                row.append(0)
            else:
                row.append(max(1, int(round(_haversine_km(source, target) * 1.22 * 1000))))
        matrix.append(row)
    return matrix


def _parse_schedule_time(value: str | None, fallback: datetime | None = None) -> datetime | None:
    if not value:
        return fallback
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Invalid schedule time: {value}. Use an ISO date-time.") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def solve_fleet_dispatch(request) -> dict:
    active_orders = [order for order in request.orders if order.status in {'pending', 'assigned'}]
    available = [vehicle for vehicle in request.vehicles if vehicle.available]
    if not active_orders:
        raise ValueError('At least one pending or assigned order is required')
    if not available:
        raise ValueError('At least one available fleet vehicle is required')

    total_demand = sum(order.weight_kg for order in active_orders)
    total_capacity = sum(vehicle.capacity_kg for vehicle in available)
    if total_demand > total_capacity:
        raise ValueError(
            f'Fleet capacity is insufficient: {total_demand:.0f} kg demand vs {total_capacity:.0f} kg available capacity'
        )
    largest_capacity = max(vehicle.capacity_kg for vehicle in available)
    oversized = [order.order_id for order in active_orders if order.weight_kg > largest_capacity]
    if oversized:
        raise ValueError('Orders exceed every available vehicle capacity: ' + ', '.join(oversized))

    departure = _parse_schedule_time(
        request.planned_departure_time,
        datetime.now(timezone.utc).replace(tzinfo=None),
    )
    time_windows = [(0, 7 * 24 * 60)]
    for order in active_orders:
        earliest = _parse_schedule_time(order.earliest_delivery)
        deadline = _parse_schedule_time(order.deadline)
        earliest_minutes = 0 if earliest is None else int((earliest - departure).total_seconds() // 60)
        latest_minutes = 7 * 24 * 60 if deadline is None else int((deadline - departure).total_seconds() // 60)
        if latest_minutes < 0:
            raise ValueError(f"Order {order.order_id} deadline is before the planned departure time")
        if earliest_minutes < 0:
            earliest_minutes = 0
        if earliest_minutes > latest_minutes:
            raise ValueError(f"Order {order.order_id} earliest delivery time is after its deadline")
        time_windows.append((earliest_minutes, latest_minutes))

    depot = request.depot.model_dump()
    order_points = [order.place.model_dump() for order in active_orders]
    points = [depot, *order_points]
    matrix = _distance_matrix(points)
    demands = [0, *[int(round(order.weight_kg)) for order in active_orders]]
    capacities = [int(round(vehicle.capacity_kg)) for vehicle in available]

    service_minutes = [0, *[order.service_minutes for order in active_orders]]
    solution = solve_capacitated_vrp(matrix, demands, capacities, depot=0, time_windows=time_windows, service_minutes=service_minutes)

    assignments = []
    assigned_ids = set()
    for route in solution['vehicle_routes']:
        vehicle = available[route['vehicle_id']]
        order_nodes = [node for node in route['nodes'] if node != 0]
        route_orders = [active_orders[node - 1] for node in order_nodes]
        arrival_by_node = {node: minute for node, minute in zip(route['nodes'], route['arrival_minutes'])}
        assigned_ids.update(order.order_id for order in route_orders)
        load_kg = sum(order.weight_kg for order in route_orders)
        assignments.append({
            'vehicle_id': vehicle.vehicle_id,
            'vehicle_label': vehicle.label,
            'driver': vehicle.driver,
            'capacity_kg': vehicle.capacity_kg,
            'load_kg': round(load_kg, 2),
            'utilization_pct': round((load_kg / vehicle.capacity_kg) * 100, 1),
            'distance_km_estimate': round(route['distance'] / 1000, 1),
            'order_count': len(route_orders),
            'orders': [{
                'order_id': order.order_id,
                'customer': order.customer,
                'weight_kg': order.weight_kg,
                'priority': order.priority,
                'deadline': order.deadline,
                'earliest_delivery': order.earliest_delivery,
                'service_minutes': order.service_minutes,
                'planned_arrival_time': (departure + timedelta(minutes=arrival_by_node[node])).replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
                'deadline_met': order.deadline is None or (departure + timedelta(minutes=arrival_by_node[node])) <= _parse_schedule_time(order.deadline),
                'cargo_type': order.cargo_type,
                'place': order.place.model_dump(),
            } for order in route_orders],
            'route_sequence': [request.depot.label, *[order.place.label for order in route_orders], request.depot.label],
        })

    assignments.sort(key=lambda item: (item['order_count'] == 0, item['vehicle_id']))
    return {
        'solver': 'Google OR-Tools CVRP',
        'distance_method': 'great-circle distance × 1.22 road-factor proxy for fleet assignment',
        'schedule_method': 'Estimated travel time at 35 km/h plus per-stop service time; earliest-delivery and deadline windows are hard constraints.',
        'planned_departure_time': departure.replace(tzinfo=timezone.utc).isoformat().replace('+00:00', 'Z'),
        'depot': depot,
        'order_count': len(active_orders),
        'vehicle_count': len(available),
        'assigned_order_count': len(assigned_ids),
        'unassigned_order_ids': [order.order_id for order in active_orders if order.order_id not in assigned_ids],
        'total_load_kg': round(total_demand, 2),
        'total_capacity_kg': round(total_capacity, 2),
        'fleet_utilization_pct': round(total_demand / total_capacity * 100, 1),
        'total_distance_km_estimate': round(solution['total_distance'] / 1000, 1),
        'assignments': assignments,
    }
