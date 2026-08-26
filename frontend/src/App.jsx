import { useEffect, useMemo, useState } from 'react'
import HeroScene from './components/HeroScene.jsx'
import RouteIntelligence from './components/RouteIntelligence.jsx'
import RouteMap from './components/RouteMap.jsx'
import { getHealth, optimizeRoute } from './lib/api.js'

const VEHICLES = [
  { value: 'tata_ace', label: 'Tata Ace / Mini Truck', payload: '1.0 t', maxPayload: 1000 },
  { value: 'lcv', label: 'Light Commercial Vehicle', payload: '4.0 t', maxPayload: 4000 },
  { value: 'medium_truck', label: 'Medium Truck', payload: '9.0 t', maxPayload: 9000 },
  { value: 'heavy_truck', label: 'Heavy Truck', payload: '16.0 t', maxPayload: 16000 },
  { value: 'trailer', label: 'Trailer', payload: '28.0 t', maxPayload: 28000 },
]

const PREVIEW_ROUTES = [
  {
    kind: 'fastest', label: 'Fastest', distance_km: 347.8, duration_minutes: 337,
    fuel_litres: 46.8, fuel_cost: 4329, co2_kg: 125.4, traffic_delay_minutes: 31,
    coordinates: [[80.2707,13.0827],[79.6,13.05],[78.8,12.95],[77.9,12.9],[77.5946,12.9716]],
  },
  {
    kind: 'balanced', label: 'Balanced', distance_km: 341.2, duration_minutes: 356,
    fuel_litres: 42.7, fuel_cost: 3949, co2_kg: 114.4, traffic_delay_minutes: 19,
    coordinates: [[80.2707,13.0827],[79.7,12.75],[78.9,12.65],[78.15,12.72],[77.5946,12.9716]],
  },
  {
    kind: 'greenest', label: 'Greenest', distance_km: 334.6, duration_minutes: 378,
    fuel_litres: 39.9, fuel_cost: 3688, co2_kg: 106.9, traffic_delay_minutes: 13,
    coordinates: [[80.2707,13.0827],[79.55,12.55],[78.8,12.45],[78.05,12.55],[77.5946,12.9716]],
  },
]

function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}

function RouteCard({ route, fastestRoute, active, onClick }) {
  const icon = route.kind === 'fastest' ? '⚡' : route.kind === 'balanced' ? '⚖' : '🌱'
  const tradeoff = route.tradeoff || {
    extra_minutes_vs_fastest: route.duration_minutes - fastestRoute.duration_minutes,
    fuel_cost_saved_vs_fastest: fastestRoute.fuel_cost - route.fuel_cost,
    co2_saved_kg_vs_fastest: fastestRoute.co2_kg - route.co2_kg,
  }

  return (
    <button className={`route-card ${active ? 'active' : ''} ${route.kind}`} onClick={onClick} type="button">
      <div className="route-card-head">
        <span className="route-icon">{icon}</span>
        <div>
          <strong>{route.label}</strong>
          <small>{route.distance_km.toFixed(1)} km</small>
        </div>
        <span className="route-select-indicator">{active ? 'VIEWING' : 'EXPLORE'}</span>
      </div>
      <div className="route-card-grid">
        <div><small>ETA</small><b>{formatDuration(route.duration_minutes)}</b></div>
        <div><small>Fuel</small><b>{route.fuel_litres.toFixed(1)} L</b></div>
        <div><small>Cost</small><b>₹{Math.round(route.fuel_cost).toLocaleString('en-IN')}</b></div>
        <div><small>CO₂</small><b>{route.co2_kg.toFixed(1)} kg</b></div>
      </div>
      <div className="route-meta">
        <span>Traffic delay {Math.round(route.traffic_delay_minutes || 0)} min</span>
        {route.kind !== 'fastest' && (
          <span className="route-saving-mini">
            {Math.max(0, tradeoff.co2_saved_kg_vs_fastest).toFixed(1)} kg CO₂ saved
          </span>
        )}
      </div>
    </button>
  )
}

export default function App() {
  const [form, setForm] = useState({
    origin: 'Chennai, Tamil Nadu',
    destination: 'Bengaluru, Karnataka',
    load_kg: 2500,
    vehicle_type: 'lcv',
    fuel_price_per_litre: 92.5,
    departure_mode: 'now',
    scheduled_departure: '',
  })
  const [routes, setRoutes] = useState(PREVIEW_ROUTES)
  const [selectedKind, setSelectedKind] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [routingMode, setRoutingMode] = useState('checking')
  const [message, setMessage] = useState('Connecting to the GreenRoute routing engine…')

  const selectedRoute = useMemo(
    () => routes.find((route) => route.kind === selectedKind) || routes[0],
    [routes, selectedKind],
  )

  const fastestRoute = useMemo(
    () => routes.find((route) => route.kind === 'fastest') || routes[0],
    [routes],
  )

  const selectedVehicle = useMemo(
    () => VEHICLES.find((vehicle) => vehicle.value === form.vehicle_type) || VEHICLES[1],
    [form.vehicle_type],
  )

  const loadRatio = Math.min(140, (form.load_kg / selectedVehicle.maxPayload) * 100)
  const loadInvalid = form.load_kg > selectedVehicle.maxPayload

  const selectedSavings = useMemo(() => {
    if (!selectedRoute || !fastestRoute) return null
    const tradeoff = selectedRoute.tradeoff
    return {
      cost: tradeoff?.fuel_cost_saved_vs_fastest ?? Math.max(0, fastestRoute.fuel_cost - selectedRoute.fuel_cost),
      carbon: tradeoff?.co2_saved_kg_vs_fastest ?? Math.max(0, fastestRoute.co2_kg - selectedRoute.co2_kg),
      extraMinutes: tradeoff?.extra_minutes_vs_fastest ?? Math.max(0, selectedRoute.duration_minutes - fastestRoute.duration_minutes),
    }
  }, [selectedRoute, fastestRoute])

  useEffect(() => {
    let cancelled = false
    getHealth()
      .then((health) => {
        if (cancelled) return
        setRoutingMode(health.routing_mode)
        if (health.routing_mode === 'live') {
          setMessage('Live mode ready — TomTom traffic-aware routing is configured.')
        } else {
          setMessage('Demo mode ready — add TOMTOM_API_KEY to switch these simulations to real roads and live traffic.')
        }
      })
      .catch(() => {
        if (cancelled) return
        setRoutingMode('offline')
        setMessage('Backend is offline. Preview routes remain available while you start FastAPI.')
      })
    return () => { cancelled = true }
  }, [])

  const change = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: ['load_kg', 'fuel_price_per_litre'].includes(name) ? Number(value) : value,
    }))
  }

  async function submit(event) {
    event.preventDefault()
    if (loadInvalid) {
      setMessage(`${selectedVehicle.label} supports up to ${selectedVehicle.maxPayload.toLocaleString('en-IN')} kg. Choose a larger vehicle or reduce the load.`)
      return
    }

    setLoading(true)
    setMessage('Fetching route candidates and evaluating time, fuel and carbon trade-offs…')
    try {
      const departureTime = form.departure_mode === 'scheduled' && form.scheduled_departure
        ? `${form.scheduled_departure}:00+05:30`
        : 'now'

      const data = await optimizeRoute({
        origin: form.origin,
        destination: form.destination,
        load_kg: form.load_kg,
        vehicle_type: form.vehicle_type,
        fuel_price_per_litre: form.fuel_price_per_litre,
        departure_time: departureTime,
      })
      const nextRoutes = Object.entries(data.recommendations).map(([kind, route]) => ({
        ...route,
        kind,
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
      }))
      setRoutes(nextRoutes)
      setSelectedKind('balanced')
      setRoutingMode(data.mode)
      const modeLabel = data.mode === 'live' ? 'LIVE TRAFFIC' : 'DEMO SIMULATION'
      setMessage(`${modeLabel} · ${data.candidate_count} candidate routes analysed · ${data.notice}`)
    } catch (error) {
      setMessage(`${error.message}. Keeping the last available routes on screen.`)
    } finally {
      setLoading(false)
    }
  }

  const modeLabel = routingMode === 'live'
    ? '● Live traffic'
    : routingMode === 'demo'
      ? '◇ Demo mode'
      : routingMode === 'offline'
        ? '○ Backend offline'
        : '… Connecting'

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="GreenRoute home"><span className="brand-mark">G</span>GreenRoute</a>
        <div className="nav-links"><a href="#planner">Route Lab</a><a href="#intelligence">Intelligence</a><a href="#impact">Impact</a><span className="status-pill">{modeLabel}</span></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">MULTI-OBJECTIVE LOGISTICS INTELLIGENCE</div>
          <h1>Choose the route that matches <em>what matters now.</em></h1>
          <p>GreenRoute blends live traffic, vehicle load, fuel economics and carbon analytics to surface the fastest, balanced and greenest shipment paths.</p>
          <div className="hero-actions"><a className="primary-btn" href="#planner">Plan a route ↘</a><span className="live-chip"><i /> Interactive 3D logistics</span></div>
          <div className="hero-stats"><div><b>3</b><span>route strategies</span></div><div><b>Live</b><span>traffic-aware ETA</span></div><div><b>CO₂</b><span>trip-level analytics</span></div></div>
        </div>
        <HeroScene />
      </section>

      <section className="planner-section" id="planner">
        <div className="section-heading"><div><span>ROUTE LAB</span><h2>Turn shipment constraints into transparent choices.</h2></div><p>{message}</p></div>
        <div className="planner-grid">
          <form className="planner-form glass-panel" onSubmit={submit}>
            <div className="form-title"><span>01</span><div><h3>Shipment details</h3><p>Inputs used by routing, cost and carbon engines.</p></div></div>

            <label>From location<input name="origin" value={form.origin} onChange={change} placeholder="Origin city or address" required /></label>
            <label>To location<input name="destination" value={form.destination} onChange={change} placeholder="Destination city or address" required /></label>

            <div className="two-col">
              <label>Load weight (kg)<input type="number" min="1" step="1" name="load_kg" value={form.load_kg} onChange={change} required /></label>
              <label>Fuel price (₹/L)<input type="number" min="1" step="0.1" name="fuel_price_per_litre" value={form.fuel_price_per_litre} onChange={change} required /></label>
            </div>

            <label>Vehicle type
              <select name="vehicle_type" value={form.vehicle_type} onChange={change}>
                {VEHICLES.map((vehicle) => <option key={vehicle.value} value={vehicle.value}>{vehicle.label} · {vehicle.payload}</option>)}
              </select>
            </label>

            <div className={`load-meter ${loadInvalid ? 'over' : ''}`}>
              <div><span>Payload utilisation</span><b>{Math.round(loadRatio)}%</b></div>
              <div className="load-track"><i style={{ width: `${Math.min(100, loadRatio)}%` }} /></div>
              <small>{form.load_kg.toLocaleString('en-IN')} / {selectedVehicle.maxPayload.toLocaleString('en-IN')} kg</small>
            </div>

            <div className="departure-block">
              <span>Departure</span>
              <div className="departure-toggle">
                <label className={form.departure_mode === 'now' ? 'active' : ''}><input type="radio" name="departure_mode" value="now" checked={form.departure_mode === 'now'} onChange={change} />Now</label>
                <label className={form.departure_mode === 'scheduled' ? 'active' : ''}><input type="radio" name="departure_mode" value="scheduled" checked={form.departure_mode === 'scheduled'} onChange={change} />Schedule</label>
              </div>
              {form.departure_mode === 'scheduled' && (
                <input type="datetime-local" name="scheduled_departure" value={form.scheduled_departure} onChange={change} required />
              )}
            </div>

            <button className="optimize-btn" disabled={loading || loadInvalid} type="submit">{loading ? 'Optimizing…' : 'Optimize routes'}<span>→</span></button>
            {loadInvalid && <p className="form-warning">Payload exceeds this vehicle's rated capacity.</p>}
          </form>

          <div className="map-panel glass-panel">
            <div className="map-topline"><div><span className="pulse-dot" /> Interactive route space</div><span>Drag · zoom · tilt</span></div>
            <RouteMap routes={routes} selectedKind={selectedKind} onSelectKind={setSelectedKind} />
            {selectedRoute && <div className="map-float-card"><small>Selected strategy</small><b>{selectedRoute.label}</b><span>{formatDuration(selectedRoute.duration_minutes)} · {selectedRoute.co2_kg.toFixed(1)} kg CO₂</span></div>}
          </div>
        </div>

        <div className="route-cards">
          {routes.map((route) => <RouteCard key={route.kind} route={route} fastestRoute={fastestRoute} active={selectedKind === route.kind} onClick={() => setSelectedKind(route.kind)} />)}
        </div>

        <div id="intelligence">
          <RouteIntelligence route={selectedRoute} fastestRoute={fastestRoute} />
        </div>
      </section>

      <section className="impact-section" id="impact">
        <div className="impact-copy"><span>CARBON INTELLIGENCE</span><h2>Every route explains its trade-off.</h2><p>Instead of hiding sustainability behind a report, GreenRoute brings estimated fuel use and CO₂ into the decision itself. The database layer is prepared for trip history and BRSR-oriented analytics.</p>{selectedSavings && selectedKind !== 'fastest' && <p className="impact-saving">Choose {selectedRoute.label} and you currently trade about <b>{Math.round(selectedSavings.extraMinutes)} extra minutes</b> for roughly <b>₹{Math.max(0, Math.round(selectedSavings.cost)).toLocaleString('en-IN')}</b> in fuel savings and <b>{Math.max(0, selectedSavings.carbon).toFixed(1)} kg less CO₂</b> versus Fastest.</p>}</div>
        <div className="impact-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="impact-core"><strong>{selectedRoute?.co2_kg.toFixed(1) || '—'}</strong><small>kg CO₂</small></div><span className="orbit-label one">TIME</span><span className="orbit-label two">COST</span><span className="orbit-label three">CARBON</span></div>
      </section>

      <footer><div><span className="brand-mark small">G</span><b>GreenRoute</b></div><p>Final-year project · Indian road logistics · BRSR-oriented sustainability analytics</p></footer>
    </main>
  )
}
