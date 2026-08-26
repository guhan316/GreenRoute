import { useMemo } from 'react'

const CATEGORY_DEFAULTS = {
  mini_truck: { max_payload_kg: 1000, kerb_weight_kg: 1100, base_mileage_kmpl: 16, max_speed_kmph: 70 },
  pickup: { max_payload_kg: 1800, kerb_weight_kg: 1900, base_mileage_kmpl: 12, max_speed_kmph: 80 },
  lcv: { max_payload_kg: 4000, kerb_weight_kg: 2800, base_mileage_kmpl: 10.5, max_speed_kmph: 80 },
  mdcv: { max_payload_kg: 9000, kerb_weight_kg: 6000, base_mileage_kmpl: 6.5, max_speed_kmph: 75 },
  hcv: { max_payload_kg: 16000, kerb_weight_kg: 9500, base_mileage_kmpl: 4.5, max_speed_kmph: 70 },
  tractor_trailer: { max_payload_kg: 28000, kerb_weight_kg: 14500, base_mileage_kmpl: 3.4, max_speed_kmph: 65 },
}

export function inferStage(year) {
  const value = Number(year)
  if (!value) return 'Select year'
  if (value >= 2020) return 'BS VI'
  if (value >= 2017) return 'BS IV'
  if (value >= 2010) return 'BS III / IV — verify RC'
  if (value >= 2005) return 'BS II / III — verify RC'
  return 'Pre-BS / BS I-II — verify RC'
}

export default function VehicleSelector({ catalog, vehicle, onChange }) {
  const manufacturers = useMemo(() => [...new Set(catalog.map((item) => item.manufacturer))].sort(), [catalog])
  const models = useMemo(() => catalog.filter((item) => item.manufacturer === vehicle.manufacturer), [catalog, vehicle.manufacturer])
  const selectedCatalog = useMemo(() => catalog.find((item) => item.id === vehicle.catalog_id), [catalog, vehicle.catalog_id])

  function patch(values) {
    onChange({ ...vehicle, ...values })
  }

  function selectManufacturer(event) {
    const manufacturer = event.target.value
    patch({ manufacturer, model: '', catalog_id: null })
  }

  function selectModel(event) {
    const id = event.target.value
    if (id === 'custom') {
      patch({ catalog_id: null, model: '' })
      return
    }
    const item = catalog.find((entry) => entry.id === id)
    if (!item) return
    const defaults = CATEGORY_DEFAULTS[item.category] || CATEGORY_DEFAULTS.lcv
    const payload = item.payload_max_kg || defaults.max_payload_kg
    patch({
      catalog_id: item.id,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
      fuel_type: item.fuel_types?.[0] || 'diesel',
      max_payload_kg: Number(payload),
      kerb_weight_kg: defaults.kerb_weight_kg,
      base_mileage_kmpl: defaults.base_mileage_kmpl,
      max_speed_kmph: defaults.max_speed_kmph,
      emission_stage: '',
    })
  }

  const fuels = selectedCatalog?.fuel_types?.length
    ? selectedCatalog.fuel_types
    : ['diesel', 'petrol', 'cng', 'lng', 'electric', 'bi-fuel']

  return (
    <div className="vehicle-selector">
      <div className="selector-heading">
        <div><strong>Vehicle identity</strong><small>Manufacturer → model → manufacturing year</small></div>
        <span>{inferStage(vehicle.manufacture_year)}</span>
      </div>

      <div className="two-col">
        <label>Company
          <select value={vehicle.manufacturer} onChange={selectManufacturer} required>
            <option value="">Select manufacturer</option>
            {manufacturers.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value="Other / Custom">Other / Custom</option>
          </select>
        </label>
        <label>Model
          {vehicle.manufacturer === 'Other / Custom' || (!models.length && vehicle.manufacturer) ? (
            <input value={vehicle.model} onChange={(e) => patch({ model: e.target.value, catalog_id: null })} placeholder="Exact model from RC" required />
          ) : (
            <select value={vehicle.catalog_id || ''} onChange={selectModel} disabled={!vehicle.manufacturer} required>
              <option value="">Select model</option>
              {models.map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}
              <option value="custom">Other model / variant</option>
            </select>
          )}
        </label>
      </div>

      {vehicle.manufacturer !== 'Other / Custom' && vehicle.manufacturer && !vehicle.catalog_id && models.length > 0 && vehicle.model === '' ? null : (
        <>
          {vehicle.manufacturer !== 'Other / Custom' && !vehicle.catalog_id && vehicle.manufacturer && (
            <label>Exact model / variant<input value={vehicle.model} onChange={(e) => patch({ model: e.target.value })} placeholder="e.g. Intra V30, 2823C CBC" required /></label>
          )}
          <div className="three-col vehicle-spec-row">
            <label>Manufacturing year<input type="number" min="1990" max="2100" value={vehicle.manufacture_year} onChange={(e) => patch({ manufacture_year: Number(e.target.value) })} required /></label>
            <label>Fuel
              <select value={vehicle.fuel_type} onChange={(e) => patch({ fuel_type: e.target.value })} required>
                {fuels.map((fuel) => <option key={fuel} value={fuel}>{fuel.toUpperCase()}</option>)}
              </select>
            </label>
            <label>Emission standard<input value={vehicle.emission_stage || inferStage(vehicle.manufacture_year)} onChange={(e) => patch({ emission_stage: e.target.value })} placeholder="Verify from RC" /></label>
          </div>

          <div className="two-col">
            <label>Rated payload (kg)<input type="number" min="1" value={vehicle.max_payload_kg} onChange={(e) => patch({ max_payload_kg: Number(e.target.value) })} required /></label>
            <label>Kerb weight (kg)<input type="number" min="1" value={vehicle.kerb_weight_kg} onChange={(e) => patch({ kerb_weight_kg: Number(e.target.value) })} required /></label>
          </div>

          <div className="two-col">
            {vehicle.fuel_type === 'electric' ? (
              <label>Energy use (kWh/km)<input type="number" min="0.01" step="0.01" value={vehicle.energy_consumption_kwh_per_km || ''} onChange={(e) => patch({ energy_consumption_kwh_per_km: Number(e.target.value) })} required /></label>
            ) : (
              <label>Real/base mileage (km/L)<input type="number" min="0.1" step="0.1" value={vehicle.base_mileage_kmpl || ''} onChange={(e) => patch({ base_mileage_kmpl: Number(e.target.value) })} required /></label>
            )}
            <label>Max governed speed (km/h)<input type="number" min="20" max="160" value={vehicle.max_speed_kmph} onChange={(e) => patch({ max_speed_kmph: Number(e.target.value) })} required /></label>
          </div>

          <p className="vehicle-method-note">
            Catalog values are starting points. For a real fleet, use RC/OEM payload and the vehicle's measured mileage. Manufacturing year is used to classify the Bharat Stage baseline; GreenRoute does not fake a different CO₂-per-litre value for each year.
          </p>
        </>
      )}
    </div>
  )
}
