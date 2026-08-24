from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class VehicleProfile:
    key: str
    label: str
    max_payload_kg: float
    kerb_weight_kg: float
    base_mileage_kmpl: float
    max_speed_kmph: int
    fuel_type: str = "diesel"


VEHICLES = {
    "tata_ace": VehicleProfile("tata_ace", "Tata Ace / Mini Truck", 1000, 1100, 16.0, 70),
    "lcv": VehicleProfile("lcv", "Light Commercial Vehicle", 4000, 2800, 10.5, 80),
    "medium_truck": VehicleProfile("medium_truck", "Medium Truck", 9000, 6000, 6.5, 75),
    "heavy_truck": VehicleProfile("heavy_truck", "Heavy Truck", 16000, 9500, 4.5, 70),
    "trailer": VehicleProfile("trailer", "Trailer", 28000, 14500, 3.4, 65),
}

# MVP factors. Before final BRSR reporting, replace/validate these against the
# emission-factor source selected for the project's reporting methodology.
EMISSION_FACTORS_KG_CO2_PER_LITRE = {
    "diesel": 2.68,
    "petrol": 2.31,
}


def list_vehicle_profiles() -> list[dict]:
    return [asdict(profile) for profile in VEHICLES.values()]


def get_vehicle_profile(vehicle_type: str) -> VehicleProfile:
    if vehicle_type not in VEHICLES:
        raise ValueError(f"Unsupported vehicle type: {vehicle_type}")
    return VEHICLES[vehicle_type]


def estimate_trip_metrics(route: dict, profile: VehicleProfile, load_kg: float, fuel_price: float) -> dict:
    if load_kg > profile.max_payload_kg:
        raise ValueError(
            f"Load {load_kg:.0f} kg exceeds {profile.label} payload limit of {profile.max_payload_kg:.0f} kg"
        )

    distance_km = route["distance_km"]
    duration_minutes = max(route["duration_minutes"], 1.0)
    traffic_delay_minutes = max(route.get("traffic_delay_minutes", 0.0), 0.0)

    load_ratio = load_kg / profile.max_payload_kg
    delay_ratio = min(traffic_delay_minutes / duration_minutes, 0.8)

    # Transparent first-pass consumption model: heavier loads and stop/go traffic
    # increase consumption relative to the vehicle's base mileage.
    load_multiplier = 1.0 + (0.24 * load_ratio)
    traffic_multiplier = 1.0 + (0.45 * delay_ratio)
    consumption_multiplier = load_multiplier * traffic_multiplier

    fuel_litres = (distance_km / profile.base_mileage_kmpl) * consumption_multiplier
    effective_mileage = distance_km / max(fuel_litres, 0.001)
    fuel_cost = fuel_litres * fuel_price
    factor = EMISSION_FACTORS_KG_CO2_PER_LITRE.get(profile.fuel_type, 2.68)
    co2_kg = fuel_litres * factor

    return {
        **route,
        "vehicle": profile.label,
        "fuel_type": profile.fuel_type,
        "fuel_litres": round(fuel_litres, 2),
        "effective_mileage_kmpl": round(effective_mileage, 2),
        "fuel_cost": round(fuel_cost, 2),
        "co2_kg": round(co2_kg, 2),
    }
