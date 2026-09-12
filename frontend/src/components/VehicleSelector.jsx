import { useMemo } from 'react'

export function inferStage(year) {
  const value = Number(year)
  if (!value) return 'Select year'
  if (value >= 2020) return 'BS VI'
  if (value >= 2017) return 'BS IV'
  if (value >= 2010) return 'BS III / IV — verify RC'
  if (value >= 2005) return 'BS II / III — verify RC'
  return 'Pre-BS / BS I-II — verify RC'
}

function normalizeFuels(fuels = []) {
  const values = new Set()
  fuels.forEach((fuel) => {
    if (fuel === 'bi-fuel') {
      values.add('petrol')
      values.add('cng')
    } else values.add(fuel)
  })
  return [...values].filter((fuel) => ['diesel', 'petrol', 'cng', 'lng', 'electric'].includes(fuel))
}

export default function VehicleSelector({ catalog, vehicle, onChange }) {
  const manufacturers = useMemo(() => [...new Set(catalog.map((item) => item.manufacturer))].sort(), [catalog])
  const models = useMemo(() => catalog.filter((item) => item.manufacturer === vehicle.manufacturer), [catalog, vehicle.manufacturer])
  const selectedCatalog = useMemo(() => catalog.find((item) => item.id === vehicle.catalog_id), [catalog, vehicle.catalog_id])

  function patch(values) { onChange({ ...vehicle, ...values }) }

  function selectManufacturer(event) {
    patch({ manufacturer: event.target.value, model: '', catalog_id: null })
  }

  function selectModel(event) {
    const id = event.target.value
    if (id === 'custom') { patch({ catalog_id: 'custom', model: '' }); return }
    const item = catalog.find((entry) => entry.id === id)
    if (!item) return
    const fuels = normalizeFuels(item.fuel_types)
    patch({
      catalog_id: item.id,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
      fuel_type: fuels[0] || '',
      max_payload_kg: item.payload_max_kg ?? '',
      kerb_weight_kg: '',
      base_mileage_kmpl: null,
      energy_consumption_kwh_per_km: null,
      max_speed_kmph: item.max_speed_kmph ?? '',
      emission_stage: '',
    })
  }

  const fuels = selectedCatalog?.fuel_types?.length
    ? normalizeFuels(selectedCatalog.fuel_types)
    : ['diesel', 'petrol', 'cng', 'lng', 'electric']
  const gaseousFuel = ['cng', 'lng'].includes(vehicle.fuel_type)
  const customVariant = vehicle.catalog_id === 'custom'

  return (
    <div className="vehicle-selector">
      <div className="selector-heading">
        <div><strong>Vehicle identity</strong><small>Manufacturer → model → manufacturing year</small></div>
        <span>{vehicle.fuel_type === 'electric' ? 'Not applicable (EV)' : inferStage(vehicle.manufacture_year)}</span>
      </div>
      <div className="two-col">
        <label>Company<select value={vehicle.manufacturer} onChange={selectManufacturer} required><option value="">Select manufacturer</option>{manufacturers.map((name) => <option key={name} value={name}>{name}</option>)}<option value="Other / Custom">Other / Custom</option></select></label>
        <label>Model{vehicle.manufacturer === 'Other / Custom' || (!models.length && vehicle.manufacturer) ? <input value={vehicle.model} onChange={(e) => patch({ model: e.target.value, catalog_id: null })} placeholder="Exact model from RC" required /> : <select value={vehicle.catalog_id || ''} onChange={selectModel} disabled={!vehicle.manufacturer} required><option value="">Select model</option>{models.map((item) => <option key={item.id} value={item.id}>{item.model} · {item.category?.replaceAll('_', ' ')}</option>)}<option value="custom">Other model / variant</option></select>}</label>
      </div>
      {vehicle.manufacturer !== 'Other / Custom' && vehicle.manufacturer && !vehicle.catalog_id && models.length > 0 && vehicle.model === '' ? null : <>
        {vehicle.manufacturer !== 'Other / Custom' && (customVariant || !vehicle.catalog_id) && vehicle.manufacturer && <label>Exact model / variant<input value={vehicle.model} onChange={(e) => patch({ model: e.target.value })} placeholder="e.g. Intra V30, 2823C CBC" required /></label>}
        <div className="three-col vehicle-spec-row">
          <label>Manufacturing year<input type="number" min="1990" max="2100" value={vehicle.manufacture_year} onChange={(e) => patch({ manufacture_year: Number(e.target.value) })} required /></label>
          <label>Fuel<select value={vehicle.fuel_type} onChange={(e) => patch({ fuel_type: e.target.value, emission_stage: '' })} required><option value="">Choose RC fuel type</option>{fuels.map((fuel) => <option key={fuel} value={fuel}>{fuel.toUpperCase()}</option>)}</select></label>
          <label>Emission standard<input readOnly={vehicle.fuel_type === 'electric'} value={vehicle.fuel_type === 'electric' ? 'Not applicable (EV)' : (vehicle.emission_stage || inferStage(vehicle.manufacture_year))} onChange={(e) => patch({ emission_stage: e.target.value })} placeholder="Verify from RC" /></label>
        </div>
        <div className="two-col">
          <label>Rated payload (kg)<input type="number" min="1" value={vehicle.max_payload_kg} onChange={(e) => patch({ max_payload_kg: Number(e.target.value) })} required /></label>
          <label>Kerb weight (kg)<input type="number" min="1" value={vehicle.kerb_weight_kg} onChange={(e) => patch({ kerb_weight_kg: Number(e.target.value) })} required /></label>
        </div>
        <div className="two-col">
          {vehicle.fuel_type === 'electric' ? <label>Energy use (kWh/km)<input type="number" min="0.01" step="0.01" value={vehicle.energy_consumption_kwh_per_km || ''} onChange={(e) => patch({ energy_consumption_kwh_per_km: Number(e.target.value) })} required /></label> : <label>Real/base efficiency ({gaseousFuel ? 'km/kg' : 'km/L'})<input type="number" min="0.1" step="0.1" value={vehicle.base_mileage_kmpl || ''} onChange={(e) => patch({ base_mileage_kmpl: Number(e.target.value) })} required /></label>}
          <label>Max governed speed (km/h)<input type="number" min="20" max="160" value={vehicle.max_speed_kmph} onChange={(e) => patch({ max_speed_kmph: Number(e.target.value) })} required /></label>
        </div>
        {selectedCatalog?.source_url?.startsWith('https://') && <p className="vehicle-method-note"><a href={selectedCatalog.source_url} target="_blank" rel="noreferrer">Manufacturer source</a> · {selectedCatalog.source_checked_at ? `Checked ${selectedCatalog.source_checked_at}` : 'Existing catalogue entry — verify variant'}<br />{selectedCatalog.source_note}</p>}
        <p className="vehicle-method-note">Confirm payload and kerb weight from the RC; enter measured fleet efficiency. Missing specifications are left blank. EV tailpipe CO₂ is zero; charging electricity emissions are estimated separately. Bharat Stage applies to combustion vehicles.</p>
      </>}
    </div>
  )
}
