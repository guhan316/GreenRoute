import Emissions from './Emissions.jsx'
import { useMemo, useState } from 'react'
import LocationSearch from './LocationSearch.jsx'
import RouteMap from './RouteMap.jsx'
import VehicleSelector from './VehicleSelector.jsx'
import ObjectiveWeights, { DEFAULT_WEIGHTS } from './ObjectiveWeights.jsx'
import { planMultiStop } from '../lib/api.js'
import './MultiStopPlanner.css'

const blank = () => ({ id: crypto.randomUUID(), text: '', place: null, weight: 100 })
const examples = {
  'Tamil Nadu coast': [['Chennai',13.0827,80.2707],['Tambaram',12.9249,80.1],['Chengalpattu',12.6819,79.9888],['Puducherry',11.9416,79.8083],['Cuddalore',11.748,79.7714]],
  'Western Tamil Nadu': [['Coimbatore',11.0168,76.9558],['Tiruppur',11.1085,77.3411],['Erode',11.341,77.7172]],
  'Karnataka': [['Bengaluru',12.9716,77.5946],['Ramanagara',12.7159,77.281],['Mandya',12.5218,76.8951],['Mysuru',12.2958,76.6394]],
}
const placeFor = ([label,lat,lon]) => ({label,lat,lon})
export default function MultiStopPlanner({ vehicle: initialVehicle, catalog, hidden }) {
  const [depot, setDepot] = useState({text:'', place:null})
  const [stops, setStops] = useState([blank(), blank()])
  const [useVehicle, setUseVehicle] = useState(false)
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [fuelPrice, setFuelPrice] = useState(92.5)
  const [electricityPrice, setElectricityPrice] = useState(8)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [roundTrip, setRoundTrip] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState('balanced')
  const [pinStopId, setPinStopId] = useState('')
  const activePin = stops.find(stop => stop.id === pinStopId) || stops[0]
  const markers = useMemo(() => stops.map(s => s.place), [stops])
  const total = stops.reduce((sum,s) => sum + Number(s.weight),0)
  const capacity = useVehicle ? Number(vehicle.max_payload_kg) : 4000
  const unresolved = [...(!depot.place ? ['depot'] : []), ...stops.flatMap((s,i) => s.place ? [] : [`delivery ${i+1}`])]
  const weightsValid = Object.values(weights).some(n => n>0)
  function change(action) { setResult(null); setError(''); action() }
  function update(id, values) { change(() => setStops(current => current.map(s => s.id===id ? {...s,...values} : s))) }
  function move(index,delta) { change(() => setStops(current => {const next=[...current];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next})) }
  async function submit(event) {
    event.preventDefault()
    if (unresolved.length) { setError(`Confirm ${unresolved.join(', ')} using a search suggestion or map pin.`); return }
    setBusy(true);setError('');setResult(null)
    try {setResult(await planMultiStop({depot:depot.place,stops:stops.map(s=>({place:s.place,weight_kg:Number(s.weight)})),return_to_depot:roundTrip,vehicle_type:'lcv',...(useVehicle?{vehicle}:{}),fuel_price_per_litre:useVehicle&&vehicle.fuel_type==='electric'?1:Number(fuelPrice),electricity_price_per_kwh:Number(electricityPrice),objective_weights:weights}))}
    catch(err){setError(err.message)}finally{setBusy(false)}
  }
  function loadExample(name) {
    if (!examples[name]) return
    const [pickup,...deliveries]=examples[name]
    change(()=>{setDepot({text:pickup[0],place:placeFor(pickup)});setStops(deliveries.map(row=>({...blank(),text:row[0],place:placeFor(row)})))})
  }
  function pinPlace(role,place) {
    if(busy)return
    if(role==='origin')change(()=>setDepot({text:place.label,place}))
    else update(activePin.id,{text:place.label,place})
  }
  return <section id="multi-stop" className="multi-stop-planner" hidden={hidden}>
    <div className="multi-stop-layout">
      <form onSubmit={submit} className="multi-stop-form">
        <fieldset disabled={busy} className="itinerary-fields"><legend>Delivery itinerary</legend>
          <label>Try an example<select defaultValue="" onChange={e=>{loadExample(e.target.value);e.target.value=''}}><option value="">Choose a sample itinerary</option>{Object.keys(examples).map(name=><option key={name}>{name}</option>)}</select></label>
          <p className="muted">Enter any Indian delivery address. Choose its search suggestion, or use the map to pin it.</p>
          <LocationSearch label="Depot / pickup" text={depot.text} selected={depot.place} onTextChange={text=>change(()=>setDepot({text,place:null}))} onSelect={place=>change(()=>setDepot({text:place.label,place}))} placeholder="Warehouse, city or pincode" />
          <ol className="delivery-stops">{stops.map((stop,index)=><li key={stop.id}>
            <LocationSearch label={`Delivery ${index+1}`} text={stop.text} selected={stop.place} onTextChange={text=>update(stop.id,{text,place:null})} onSelect={place=>update(stop.id,{text:place.label,place})} placeholder="Search delivery address" />
            <label>Delivery {index+1} weight (kg)<input type="number" min="0.1" max="50000" step="0.1" value={stop.weight} onChange={e=>update(stop.id,{weight:e.target.value})} required /></label>
            <div className="stop-actions"><button type="button" disabled={index===0} aria-label={`Move delivery ${index+1} up`} onClick={()=>move(index,-1)}>↑ Up</button><button type="button" disabled={index===stops.length-1} aria-label={`Move delivery ${index+1} down`} onClick={()=>move(index,1)}>↓ Down</button><button type="button" aria-label={`Remove delivery ${index+1}`} disabled={stops.length===1} onClick={()=>change(()=>setStops(stops.filter(s=>s.id!==stop.id)))}>Remove</button></div>
          </li>)}</ol>
          <button type="button" disabled={stops.length>=12} onClick={()=>change(()=>setStops([...stops,blank()]))}>+ Add delivery ({stops.length}/12)</button>
          <label className="return-checkbox"><input type="checkbox" checked={roundTrip} onChange={e=>change(()=>setRoundTrip(e.target.checked))} />Return to depot</label>
          <label className="return-checkbox"><input type="checkbox" checked={useVehicle} onChange={e=>change(()=>setUseVehicle(e.target.checked))} />Choose a specific vehicle</label>
          {useVehicle ? <VehicleSelector catalog={catalog} vehicle={vehicle} onChange={value=>change(()=>setVehicle(value))} /> : <p>Standard diesel LCV · 4,000 kg capacity. Enable vehicle selection to configure an EV or another model.</p>}
          {useVehicle&&vehicle.fuel_type==='electric' ? <label>Electricity price (₹/kWh)<input type="number" min="0.01" max="100" step="0.01" required value={electricityPrice} onChange={e=>change(()=>setElectricityPrice(e.target.value))} /></label> : <label>Fuel price (₹/{useVehicle&&['cng','lng'].includes(vehicle.fuel_type)?'kg':'L'})<input type="number" min="0.01" max="500" step="0.01" required value={fuelPrice} onChange={e=>change(()=>setFuelPrice(e.target.value))} /></label>}
          <ObjectiveWeights value={weights} onChange={value=>change(()=>setWeights(value))} />
          <p>{total.toLocaleString()} / {capacity.toLocaleString()} kg loaded. Load reduces after every delivery.</p>
          {total>capacity&&<p role="alert">Load exceeds this vehicle’s capacity.</p>}
          {unresolved.length>0&&<p className="form-warning">Confirm {unresolved.join(', ')} using search or a map pin.</p>}
          <button className="primary-btn" disabled={!weightsValid||total>capacity||stops.some(s=>Number(s.weight)<=0)}>{busy?'Calculating every leg…':'Compare delivery routes'}</button>
          {busy&&<p role="status">Checking every road leg. This can take up to 50 seconds.</p>}
        </fieldset>
        {error&&<p role="alert" className="form-warning">{error}</p>}
      </form>
      <div className="multi-stop-output">
        <div className="map-target"><label>Delivery to pin<select value={activePin.id} disabled={busy} onChange={e=>setPinStopId(e.target.value)}>{stops.map((s,i)=><option key={s.id} value={s.id}>Delivery {i+1}{s.place?` · ${s.place.label}`:''}</option>)}</select></label><small>Choose “Pin pickup” or “Pin delivery” on the map, then click the location.</small></div>
        <RouteMap routes={result?.routes||[]} selectedKind={kind} onSelectKind={setKind} origin={depot.place} stops={markers} onPickPlace={busy?undefined:pinPlace} />
        {!result&&<p className="map-empty-note">Confirmed stops appear as numbered pins. Calculate to see the roads connecting them.</p>}
        {result&&<><p role="status">{result.mode==='demo'?'Synthetic demo. ':''}{result.notice}</p><div className="multi-stop-results">{result.routes.map(route=><button type="button" key={route.kind} className={kind===route.kind?'selected':''} aria-pressed={kind===route.kind} onClick={()=>setKind(route.kind)}><strong>{route.kind}</strong><span>{route.distance_km} km · {route.duration_minutes} min</span><span>₹{route.fuel_cost} energy cost</span><Emissions route={route} />{route.shared_physical_route_with?.length>0&&<small>Same roads as {route.shared_physical_route_with.join(' & ')} at these priorities.</small>}<small>{(route.duration_minutes-result.routes[0].duration_minutes).toFixed(1)} extra min; ₹{(result.routes[0].fuel_cost-route.fuel_cost).toFixed(2)} and {(result.routes[0].co2_kg-route.co2_kg).toFixed(2)} kg saved vs Fastest.</small></button>)}</div><details><summary>Leg-by-leg routing</summary><ol>{result.legs.map((leg,i)=><li key={i}>{leg.origin.label} → {leg.destination.label} · {leg.provider}</li>)}</ol></details></>}
        {useVehicle&&vehicle.fuel_type==='electric'&&<p>EV estimates exclude charging stops. Confirm battery range and charging access before dispatch.</p>}
      </div>
    </div>
  </section>
}
