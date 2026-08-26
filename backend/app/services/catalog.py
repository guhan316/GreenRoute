from __future__ import annotations

from typing import Any

import httpx


class VehicleCatalogService:
    def __init__(self, url: str, publishable_key: str):
        self.url = url.rstrip('/')
        self.publishable_key = publishable_key

    @property
    def configured(self) -> bool:
        return bool(self.url and self.publishable_key)

    def _headers(self) -> dict[str, str]:
        return {
            'apikey': self.publishable_key,
            'Authorization': f'Bearer {self.publishable_key}',
            'Accept': 'application/json',
        }

    async def list_catalog(self) -> list[dict[str, Any]]:
        if not self.configured:
            return []
        params = {
            'select': 'id,manufacturer,model,category,fuel_types,payload_min_kg,payload_max_kg,production_start_year,production_end_year,is_current,source_url,source_note',
            'is_current': 'eq.true',
            'order': 'manufacturer.asc,model.asc',
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f'{self.url}/rest/v1/vehicle_catalog',
                headers=self._headers(),
                params=params,
            )
        response.raise_for_status()
        return response.json()
