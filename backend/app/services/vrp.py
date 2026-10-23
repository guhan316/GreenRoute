from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve_capacitated_vrp(distance_matrix: list[list[int]], demands: list[int], capacities: list[int], depot: int = 0, time_windows: list[tuple[int, int]] | None = None, service_minutes: list[int] | None = None, travel_speed_kmph: float = 35.0, duration_matrix: list[list[int]] | None = None) -> dict:
    node_count = len(distance_matrix)
    if not node_count or any(len(row) != node_count for row in distance_matrix):
        raise ValueError("distance_matrix must be a non-empty square matrix")
    if len(demands) != node_count:
        raise ValueError("demands length must equal distance matrix size")
    if not capacities:
        raise ValueError("At least one vehicle capacity is required")
    if not (0 <= depot < node_count):
        raise ValueError("Invalid depot index")

    manager = pywrapcp.RoutingIndexManager(node_count, len(capacities), depot)
    routing = pywrapcp.RoutingModel(manager)

    def distance_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return int(distance_matrix[from_node][to_node])

    transit_index = routing.RegisterTransitCallback(distance_callback)
    routing.SetArcCostEvaluatorOfAllVehicles(transit_index)

    def demand_callback(from_index):
        return int(demands[manager.IndexToNode(from_index)])

    demand_index = routing.RegisterUnaryTransitCallback(demand_callback)
    routing.AddDimensionWithVehicleCapacity(demand_index, 0, [int(c) for c in capacities], True, "Capacity")

    # Travel times are estimates derived from the same distance proxy used for
    # assignment. The caller can add hard arrival windows in minutes from departure.
    service_minutes = service_minutes or [0] * node_count
    if len(service_minutes) != node_count:
        raise ValueError("service_minutes length must equal distance matrix size")
    if travel_speed_kmph <= 0:
        raise ValueError("travel_speed_kmph must be positive")
    if duration_matrix is not None and (len(duration_matrix) != node_count or any(len(row) != node_count for row in duration_matrix)):
        raise ValueError('duration_matrix must match distance_matrix dimensions')

    def time_callback(from_index, to_index):
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        travel_minutes = int(round(duration_matrix[from_node][to_node] / 60)) if duration_matrix is not None else int(round(distance_matrix[from_node][to_node] / 1000 / travel_speed_kmph * 60))
        return travel_minutes + int(service_minutes[from_node])

    time_index = routing.RegisterTransitCallback(time_callback)
    horizon_minutes = 7 * 24 * 60
    routing.AddDimension(time_index, horizon_minutes, horizon_minutes, True, "Time")
    time_dimension = routing.GetDimensionOrDie("Time")
    if time_windows:
        if len(time_windows) != node_count:
            raise ValueError("time_windows length must equal distance matrix size")
        for node, (earliest, latest) in enumerate(time_windows):
            if earliest < 0 or latest < earliest or latest > horizon_minutes:
                raise ValueError(f"Invalid delivery time window for node {node}")
            if node == depot:
                continue
            index = manager.NodeToIndex(node)
            time_dimension.CumulVar(index).SetRange(int(earliest), int(latest))

    search = pywrapcp.DefaultRoutingSearchParameters()
    search.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    search.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    search.time_limit.seconds = 3

    solution = routing.SolveWithParameters(search)
    if not solution:
        raise ValueError("No feasible VRP solution found")

    vehicle_routes = []
    total_distance = 0
    for vehicle_id in range(len(capacities)):
        index = routing.Start(vehicle_id)
        nodes = []
        route_distance = 0
        route_load = 0
        arrival_minutes = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            nodes.append(node)
            arrival_minutes.append(solution.Value(time_dimension.CumulVar(index)))
            route_load += int(demands[node])
            previous = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous, index, vehicle_id)
        nodes.append(manager.IndexToNode(index))
        arrival_minutes.append(solution.Value(time_dimension.CumulVar(index)))
        total_distance += route_distance
        vehicle_routes.append({"vehicle_id": vehicle_id, "nodes": nodes, "load": route_load, "distance": route_distance, "arrival_minutes": arrival_minutes})

    return {"total_distance": total_distance, "vehicle_routes": vehicle_routes}
