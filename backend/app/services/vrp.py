from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve_capacitated_vrp(distance_matrix: list[list[int]], demands: list[int], capacities: list[int], depot: int = 0) -> dict:
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
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            nodes.append(node)
            route_load += int(demands[node])
            previous = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous, index, vehicle_id)
        nodes.append(manager.IndexToNode(index))
        total_distance += route_distance
        vehicle_routes.append({"vehicle_id": vehicle_id, "nodes": nodes, "load": route_load, "distance": route_distance})

    return {"total_distance": total_distance, "vehicle_routes": vehicle_routes}
