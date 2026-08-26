from dataclasses import dataclass, asdict
from datetime import datetime
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

# Tailpipe CO2 factors are primarily fuel-chemistry factors. Bharat Stage/year
# changes regulated pollutants (NOx/PM/HC/CO) and can influence real efficiency,
# but it does not justify inventing a different diesel CO2-per-litre factor by year.
# These remain prototype values until the final BRSR methodology is frozen.
EMISSION_FACTORS_KG_CO2_PER_LITRE = {
    'diesel': 2.68,
    'petrol': 2.31,
    'cng': 2.74,  # kg CO2 per kg-equivalent is not directly comparable; treat as prototype only
    'lng': 2.75,
    'bi-fuel': 2.50,
}

# CEA Version 19 reports 0.716 tCO2/MWh for FY 2022-23 including renewables.
# Keep visible as a dated reporting factor rather than pretending it is timeless.
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


def estimate_trip_metrics(
    route: dict,
    profile: VehicleProfile,
    load_kg: float,
    fuel_price: float,
    electricity_price_per_kwh: float = 8.0,
) -> dict:
    if load_kg > profile.max_payload_kg:
        raise ValueError(
            f'Load {load_kg:.0f} kg exceeds {profile.label} payload limit of {profile.max_payload_kg:.0f} kg'
        )

    distance_km = route['distance_km']
    duration_minutes = max(route['duration_minutes'], 1.0)
    traffic_delay_minutes = max(route.get('traffic_delay_minutes', 0.0), 0.0)
    load_ratio = load_kg / profile.max_payload_kg
    delay_ratio = min(traffic_delay_minutes / duration_minutes, 0.8)
    load_multiplier = 1.0 + (0.24 * load_ratio)
    traffic_multiplier = 1.0 + (0.45 * delay_ratio)
    consumption_multiplier = load_multiplier * traffic_multiplier

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
        energy_kwh = distance_km * profile.energy_consumption_kwh_per_km * consumption_multiplier
        energy_cost = energy_kwh * electricity_price_per_kwh
        co2_kg = energy_kwh * INDIA_GRID_KG_CO2_PER_KWH
        return {
            **common,
            'fuel_litres': 0.0,
            'energy_kwh': round(energy_kwh, 2),
            'effective_mileage_kmpl': 0.0,
            'fuel_cost': round(energy_cost, 2),
            'co2_kg': round(co2_kg, 2),
            'emissions_basis': 'India grid electricity factor (CEA baseline; dated factor)',
        }

    if not profile.base_mileage_kmpl:
        raise ValueError('Vehicle mileage is required for combustion vehicles')

    fuel_litres = (distance_km / profile.base_mileage_kmpl) * consumption_multiplier
    effective_mileage = distance_km / max(fuel_litres, 0.001)
    fuel_cost = fuel_litres * fuel_price
    factor = EMISSION_FACTORS_KG_CO2_PER_LITRE.get(profile.fuel_type, 2.68)
    co2_kg = fuel_litres * factor

    return {
        **common,
        'fuel_litres': round(fuel_litres, 2),
        'energy_kwh': 0.0,
        'effective_mileage_kmpl': round(effective_mileage, 2),
        'fuel_cost': round(fuel_cost, 2),
        'co2_kg': round(co2_kg, 2),
        'emissions_basis': 'Fuel consumed × fuel CO2 factor; Bharat Stage tracked separately for pollutant class',
    }
