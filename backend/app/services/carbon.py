from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class VehicleProfile:
    key: str
    label: str
    max_payload_kg: float
    kerb_weight_kg: float
    base_mileage_kmpl: float | None
    max_speed_kmph: int
    fuel_type: str = 'diesel'
    manufacturer: str = ''
    model: str = ''
    manufacture_year: int | None = None
    emission_stage: str = 'Unknown / verify RC'
    energy_consumption_kwh_per_km: float | None = None


VEHICLES = {
    'tata_ace': VehicleProfile('tata_ace', 'Tata Ace / Mini Truck', 1000, 1100, 16.0, 70),
    'lcv': VehicleProfile('lcv', 'Light Commercial Vehicle', 4000, 2800, 10.5, 80),
    'medium_truck': VehicleProfile('medium_truck', 'Medium Truck', 9000, 6000, 6.5, 75),
    'heavy_truck': VehicleProfile('heavy_truck', 'Heavy Truck', 16000, 9500, 4.5, 70),
    'trailer': VehicleProfile('trailer', 'Trailer', 28000, 14500, 3.4, 65),
}

# Prototype direct-combustion factors. Liquid fuels are kg CO2/L; natural gas
# is kg CO2/kg fuel. Freeze final BRSR factors only after source validation.
FUEL_CO2_FACTORS = {
    'diesel': {'factor': 2.68, 'unit': 'L'},
    'petrol': {'factor': 2.31, 'unit': 'L'},
    'cng': {'factor': 2.75, 'unit': 'kg'},
    'lng': {'factor': 2.75, 'unit': 'kg'},
}

# CEA Version 19 FY 2022-23 baseline; kept explicitly dated in the output.
INDIA_GRID_KG_CO2_PER_KWH = 0.716


def infer_bharat_stage(year: int | None) -> str:
    if not year:
        return 'Unknown / verify RC'
    if year >= 2020:
        return 'BS VI'
    if year >= 2017:
        return 'BS IV'
    if year >= 2010:
        return 'BS III / BS IV (verify RC)'
    if year >= 2005:
        return 'BS II / BS III (verify RC)'
    return 'Pre-BS / BS I-II (verify RC)'


def list_vehicle_profiles() -> list[dict]:
    return [asdict(profile) for profile in VEHICLES.values()]


def get_vehicle_profile(vehicle_type: str) -> VehicleProfile:
    if vehicle_type not in VEHICLES:
        raise ValueError(f'Unsupported vehicle type: {vehicle_type}')
    return VEHICLES[vehicle_type]


def build_vehicle_profile(vehicle: Any) -> VehicleProfile:
    data = vehicle.model_dump() if hasattr(vehicle, 'model_dump') else dict(vehicle)
    year = int(data['manufacture_year'])
    stage = data.get('emission_stage') or infer_bharat_stage(year)
    manufacturer = data['manufacturer'].strip()
    model = data['model'].strip()
    return VehicleProfile(
        key=data.get('catalog_id') or f"custom:{manufacturer}:{model}:{year}",
        label=f'{manufacturer} {model} ({year})',
        manufacturer=manufacturer,
        model=model,
        manufacture_year=year,
        emission_stage=stage,
        fuel_type=data['fuel_type'],
        max_payload_kg=float(data['max_payload_kg']),
        kerb_weight_kg=float(data['kerb_weight_kg']),
        base_mileage_kmpl=float(data['base_mileage_kmpl']) if data.get('base_mileage_kmpl') is not None else None,
        energy_consumption_kwh_per_km=float(data['energy_consumption_kwh_per_km']) if data.get('energy_consumption_kwh_per_km') is not None else None,
        max_speed_kmph=int(data.get('max_speed_kmph') or 80),
    )


def estimate_trip_metrics(route: dict, profile: VehicleProfile, load_kg: float, fuel_price: float, electricity_price_per_kwh: float = 8.0) -> dict:
    if load_kg > profile.max_payload_kg:
        raise ValueError(f'Load {load_kg:.0f} kg exceeds {profile.label} payload limit of {profile.max_payload_kg:.0f} kg')

    distance_km = route['distance_km']
    duration_minutes = max(route['duration_minutes'], 1.0)
    traffic_delay_minutes = max(route.get('traffic_delay_minutes', 0.0), 0.0)
    load_ratio = load_kg / profile.max_payload_kg
    delay_ratio = min(traffic_delay_minutes / duration_minutes, 0.8)
    consumption_multiplier = (1.0 + 0.24 * load_ratio) * (1.0 + 0.45 * delay_ratio)

    common = {
        **route,
        'vehicle': profile.label,
        'vehicle_manufacturer': profile.manufacturer,
        'vehicle_model': profile.model,
        'manufacture_year': profile.manufacture_year,
        'emission_stage': profile.emission_stage,
        'fuel_type': profile.fuel_type,
    }

    if profile.fuel_type == 'electric':
        if not profile.energy_consumption_kwh_per_km:
            raise ValueError('Electric vehicle energy consumption is required')
        quantity = distance_km * profile.energy_consumption_kwh_per_km * consumption_multiplier
        cost = quantity * electricity_price_per_kwh
        co2_kg = quantity * INDIA_GRID_KG_CO2_PER_KWH
        return {
            **common,
            'fuel_litres': 0.0,
            'energy_kwh': round(quantity, 2),
            'energy_quantity': round(quantity, 2),
            'energy_unit': 'kWh',
            'effective_mileage_kmpl': 0.0,
            'effective_efficiency': round(distance_km / max(quantity, 0.001), 2),
            'fuel_cost': round(cost, 2),
            'co2_kg': round(co2_kg, 2),
            'emissions_basis': 'Electricity consumed × India grid factor (CEA FY 2022-23 baseline)',
        }

    if not profile.base_mileage_kmpl:
        raise ValueError('Vehicle efficiency is required for combustion vehicles')
    factor_info = FUEL_CO2_FACTORS.get(profile.fuel_type)
    if not factor_info:
        raise ValueError(f'Carbon factor is not configured for fuel type: {profile.fuel_type}')

    quantity = (distance_km / profile.base_mileage_kmpl) * consumption_multiplier
    efficiency = distance_km / max(quantity, 0.001)
    cost = quantity * fuel_price
    co2_kg = quantity * factor_info['factor']
    is_liquid = factor_info['unit'] == 'L'

    return {
        **common,
        'fuel_litres': round(quantity, 2) if is_liquid else 0.0,
        'energy_kwh': 0.0,
        'energy_quantity': round(quantity, 2),
        'energy_unit': factor_info['unit'],
        'effective_mileage_kmpl': round(efficiency, 2) if is_liquid else 0.0,
        'effective_efficiency': round(efficiency, 2),
        'fuel_cost': round(cost, 2),
        'co2_kg': round(co2_kg, 2),
        'emissions_basis': f"Fuel consumed ({factor_info['unit']}) × {profile.fuel_type.upper()} direct CO2 factor; Bharat Stage tracked separately",
    }
