# EV emissions and Indian cargo catalogue — 2026-09-12

EV tailpipe CO₂ is zero. The existing positive EV `co2_kg` value estimates electricity-generation CO₂, not exhaust. API responses now separate `tailpipe_co2_kg` and `electricity_co2_kg`; the legacy total remains compatible with strategy scoring and saved trips. Cards, map summaries and history distinguish charging from tailpipe emissions. EV Bharat Stage is not applicable, even if clients send BS VI.

Charging estimate = modelled kWh × 0.716 kg CO₂/kWh, the existing dated CEA FY 2022–23 baseline. It is not a current supplier-specific or full lifecycle factor. Manufacturing, upstream fuel production and charging losses are excluded. Fuel factors remain prototype estimates pending BRSR methodology validation. See [EPA explanation](https://www.epa.gov/greenvehicles/electric-vehicle-myths).

`backend/app/data/vehicle_catalog.json` contains 34 OEM-sourced model/family entries across cargo three-wheelers, mini trucks, pickups, vans, light/medium/heavy commercial vehicles, tippers and tractor-trailers. Each row includes a source URL, review date and verified-field list. This is a curated starter catalogue, not an exhaustive list of every Indian vehicle or trim. The Ashok Leyland family entries require exact variant confirmation. Manufacturer pages list vehicle identity; only explicitly verified payload/speed values are prefilled. GVW/GCW must never be used as payload. Fleet consumption is required rather than inferred from advertised battery range.

Sources: [Mahindra](https://mahindralastmilemobility.com/), [Tata Ace EV 1000](https://smalltrucks.tatamotors.com/ace-ev-1000), [Ashok Leyland](https://www.ashokleyland.com/in/lightvehicles/smallcommercialvechicles), [Force Motors](https://www.forcemotors.com/). Exact source paths for verified variants are in the JSON.

The API merges bundled rows with existing database entries, retaining database IDs for exact manufacturer/model matches and other existing rows. On database failure the bundled catalogue remains available. No database migration or destructive catalogue changes are required. Missing specifications must be supplied from RC/fleet records. Custom manufacturer/model input remains available, including LNG fleets.

Multi-stop routes can use the vehicle configured in Route Planner. Capacity is checked against that vehicle before routing, and emissions components are summed per leg. This does not add battery range/charging-stop feasibility; that remains a logistics constraint for a subsequent milestone.
