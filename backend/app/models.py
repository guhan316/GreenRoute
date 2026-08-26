from typing import Any

from pydantic import BaseModel, Field


class RouteOptimizationRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=180)
    destination: str = Field(min_length=2, max_length=180)
    load_kg: float = Field(gt=0, le=50000)
    vehicle_type: str
    fuel_price_per_litre: float = Field(gt=0, le=500)
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
