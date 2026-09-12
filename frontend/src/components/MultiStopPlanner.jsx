import Emissions from './Emissions.jsx'
import { useMemo, useState } from 'react'
import LocationSearch from './LocationSearch.jsx'
import RouteMap from './RouteMap.jsx'
import { planMultiStop } from '../lib/api.js'
import './MultiStopPlanner.css'

const blank = () => ({ id: crypto.randomUUID(), text: '', place: null, weight: 100 })
const example = [ ['Tambaram', 12.9249, 80.1], ['Chengalpattu', 12.6819, 79.9888], ['Puducherry', 11.9416, 79.8083], ['Cuddalore', 11.748, 79.7714] ]
export default function MultiStopPlanner({ vehicle }) {
  const [depot, setDepot] = useState({ text: '', place: null })
  const [stops, setStops] = useState([blank(), blank()])
  const [useSelectedVehicle, setUseSelectedVehicle] = useState(false)
  const [roundTrip, setRoundTrip] = useState(false)
  const [savedResult, setResult] = useState(null)
  const result = savedResult && (!useSelectedVehicle || savedResult.vehicleSnapshot === JSON.stringify(vehicle)) ? savedResult : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('balanced')
  const markers = useMemo(() => stops.map(s => s.place), [stops])
  const total = stops.reduce((sum, s) => sum + Number(s.weight), 0)
  function change(action) { setResult(null); setError(''); action() }
  function update(id, patch) { change(() => setStops(current => current.map(s => s.id === id ? { ...s, ...patch } : s))) }
  function move(index, delta) {
    change(() => setStops(current => { const next = [...current]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next }))
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setResult(null)
    try { const planned = await planMultiStop({ depot: depot.place, stops: stops.map(s => ({ place: s.place, weight_kg: Number(s.weight) })), return_to_depot: roundTrip, vehicle_type: 'lcv', ...(useSelectedVehicle ? { vehicle } : {}) }); setResult({ ...planned, vehicleSnapshot: JSON.stringify(vehicle) }) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  function loadExample() {
    change(() => {
      setDepot({ text: 'Chennai depot', place: { label: 'Chennai depot', lat: 13.0827, lon: 80.2707 } })
      setStops(example.map(([label, lat, lon]) => ({ ...blank(), text: label, place: { label, lat, lon } })))
    })
  }
  return <section id="multi-stop" className="multi-stop-planner">
    <div className="section-heading"><div><span>MULTI-STOP DELIVERY</span><h2>One pickup. Every delivery.</h2></div><p>Add deliveries in order and compare the complete trip.</p></div>
    <div className="multi-stop-layout">
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <button type="button" onClick={loadExample}>Load Chennai–Cuddalore example</button>
          <p>Example pins are city centres; choose exact delivery addresses for real trips.</p>
          <LocationSearch label="Depot / pickup" text={depot.text} selected={depot.place} onTextChange={text => change(() => setDepot({ text, place: null }))} onSelect={place => change(() => setDepot({ text: place.label, place }))} placeholder="Choose your warehouse" />
          <ol className="delivery-stops">{stops.map((stop, index) => <li key={stop.id}>
            <LocationSearch label={`Delivery ${index + 1}`} text={stop.text} selected={stop.place} onTextChange={text => update(stop.id, { text, place: null })} onSelect={place => update(stop.id, { text: place.label, place })} placeholder="Search delivery location" />
            <label>Delivery weight (kg)<input type="number" min="0.1" max="50000" step="0.1" value={stop.weight} onChange={e => update(stop.id, { weight: e.target.value })} required /></label>
            <div className="stop-actions"><button type="button" disabled={index === 0} aria-label={`Move delivery ${index + 1} up`} onClick={() => move(index, -1)}>↑ Up</button><button type="button" disabled={index === stops.length - 1} aria-label={`Move delivery ${index + 1} down`} onClick={() => move(index, 1)}>↓ Down</button><button type="button" disabled={stops.length === 1} onClick={() => change(() => setStops(stops.filter(s => s.id !== stop.id)))}>Remove</button></div>
          </li>)}</ol>
          <button type="button" disabled={stops.length >= 12} onClick={() => change(() => setStops([...stops, blank()]))}>+ Add delivery ({stops.length}/12)</button>
          <label className="return-checkbox"><input type="checkbox" checked={roundTrip} onChange={e => change(() => setRoundTrip(e.target.checked))} /> Return to depot</label>
          <label className="return-checkbox"><input type="checkbox" checked={useSelectedVehicle} onChange={e => change(() => setUseSelectedVehicle(e.target.checked))} /> Use vehicle configured in Route Planner below</label>
          <p>{useSelectedVehicle ? `${vehicle.manufacturer} ${vehicle.model} · ${vehicle.fuel_type}` : 'Light commercial vehicle (diesel)'} · {total.toLocaleString()} / {useSelectedVehicle ? vehicle.max_payload_kg : '4,000'} kg loaded. Capacity is checked before routing. Load reduces after each delivery.</p>
          {useSelectedVehicle && vehicle.fuel_type === 'electric' && <p>EV estimates exclude charging stops. Confirm battery range and charging access before dispatch.</p>}
          <button className="primary-btn" disabled={!depot.place || stops.some(s => !s.place || Number(s.weight) <= 0)}>{busy ? 'Calculating every leg…' : 'Compare delivery routes'}</button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
      <div>
        <RouteMap routes={result?.routes || []} selectedKind={kind} onSelectKind={setKind} origin={depot.place} stops={markers} />
        {result && <><p role="status">{result.mode === 'demo' ? 'SYNTHETIC DEMO — not real roads. ' : 'Road routes. '}{result.notice}</p><div className="multi-stop-results">{result.routes.map(route => <button type="button" key={route.kind} className={kind === route.kind ? 'selected' : ''} aria-pressed={kind === route.kind} onClick={() => setKind(route.kind)}><strong>{route.kind}</strong><span>{route.distance_km} km · {route.duration_minutes} min</span><span>₹{route.fuel_cost} estimated energy cost</span><Emissions route={route} /><small>{(route.duration_minutes - result.routes[0].duration_minutes).toFixed(1)} extra min vs Fastest; ₹{(result.routes[0].fuel_cost - route.fuel_cost).toFixed(2)} and {(result.routes[0].co2_kg - route.co2_kg).toFixed(2)} kg CO₂ saved. Negative savings mean an increase.</small></button>)}</div></>}
      </div>
    </div>
  </section>
}
