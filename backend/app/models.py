from typing import Any

from pydantic import BaseModel, Field, model_validator


class PlaceInput(BaseModel):
    label: str = Field(min_length=2, max_length=240)
    address: str | None = Field(default=None, max_length=320)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    google_place_id: str | None = Field(default=None, max_length=240)
    tomtom_id: str | None = Field(default=None, max_length=240)
    result_type: str | None = Field(default=None, max_length=80)


class VehicleInput(BaseModel):
    manufacturer: str = Field(min_length=1, max_length=120)
    model: str = Field(min_length=1, max_length=160)
    manufacture_year: int = Field(ge=1990, le=2100)
    fuel_type: str = Field(pattern="^(diesel|petrol|cng|lng|electric)$")
    max_payload_kg: float = Field(gt=0, le=80000)
    kerb_weight_kg: float = Field(gt=0, le=80000)
    # For diesel/petrol this is km/L; for CNG/LNG it is km/kg.
    base_mileage_kmpl: float | None = Field(default=None, gt=0, le=100)
    energy_consumption_kwh_per_km: float | None = Field(default=None, gt=0, le=10)
    max_speed_kmph: int = Field(default=80, gt=0, le=160)
    emission_stage: str | None = Field(default=None, max_length=80)
    catalog_id: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_energy_model(self):
        if self.fuel_type == "electric":
            if self.energy_consumption_kwh_per_km is None:
                raise ValueError("Electric vehicles require energy_consumption_kwh_per_km")
        elif self.base_mileage_kmpl is None:
            raise ValueError("Combustion vehicles require distance-per-fuel-unit efficiency")
        return self


class RouteOptimizationRequest(BaseModel):
    origin: str | PlaceInput
    destination: str | PlaceInput
    load_kg: float = Field(gt=0, le=50000)
    vehicle_type: str | None = None  # legacy compatibility
    vehicle: VehicleInput | None = None
    # L for diesel/petrol, kg for CNG/LNG. Kept under the legacy field name for API compatibility.
    fuel_price_per_litre: float = Field(default=92.5, gt=0, le=500)
    electricity_price_per_kwh: float = Field(default=8.0, gt=0, le=100)
    departure_time: str = Field(default="now", min_length=3, max_length=64)


class OptimizationSaveRequest(BaseModel):
    form: dict[str, Any]
    optimization: dict[str, Any]
    selected_strategy: str = Field(pattern="^(fastest|balanced|greenest)$")


class VrpRequest(BaseModel):
    distance_matrix: list[list[int]]
    demands: list[int]
    vehicle_capacities: list[int]
    depot: int = 0
