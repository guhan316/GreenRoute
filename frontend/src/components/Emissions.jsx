export function emissionsLabel(fuelType) {
  return fuelType === 'electric' ? 'Charging CO₂' : fuelType ? 'Tailpipe CO₂' : 'Estimated CO₂'
}

export default function Emissions({ route, fuelType }) {
  const fuel = fuelType || route?.fuel_type
  return <div className="emissions-breakdown">
    <small>{emissionsLabel(fuel)}</small><b>{Number(route?.co2_kg || 0).toFixed(1)} kg</b>
    {fuel === 'electric' && <><small>Tailpipe CO₂: 0 kg</small><small>Grid electricity estimate · CEA FY 2022–23</small></>}
  </div>
}
