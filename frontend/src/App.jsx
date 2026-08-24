import { useMemo, useState } from 'react'
import HeroScene from './components/HeroScene.jsx'
import RouteMap from './components/RouteMap.jsx'
import { optimizeRoute } from './lib/api.js'

const VEHICLES = [
  { value: 'tata_ace', label: 'Tata Ace / Mini Truck', payload: '1.0 t' },
  { value: 'lcv', label: 'Light Commercial Vehicle', payload: '4.0 t' },
  { value: 'medium_truck', label: 'Medium Truck', payload: '9.0 t' },
  { value: 'heavy_truck', label: 'Heavy Truck', payload: '16.0 t' },
  { value: 'trailer', label: 'Trailer', payload: '28.0 t' },
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

function RouteCard({ route, active, onClick }) {
  const icon = route.kind === 'fastest' ? '⚡' : route.kind === 'balanced' ? '⚖' : '🌱'
  return (
    <button className={`route-card ${active ? 'active' : ''} ${route.kind}`} onClick={onClick} type="button">
      <div className="route-card-head">
        <span className="route-icon">{icon}</span>
        <div>
          <strong>{route.label}</strong>
          <small>{route.distance_km.toFixed(1)} km</small>
        </div>
      </div>
      <div className="route-card-grid">
        <div><small>ETA</small><b>{formatDuration(route.duration_minutes)}</b></div>
        <div><small>Fuel</small><b>{route.fuel_litres.toFixed(1)} L</b></div>
        <div><small>Cost</small><b>₹{Math.round(route.fuel_cost).toLocaleString('en-IN')}</b></div>
        <div><small>CO₂</small><b>{route.co2_kg.toFixed(1)} kg</b></div>
      </div>
      <div className="route-meta">Traffic delay: {Math.round(route.traffic_delay_minutes || 0)} min</div>
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
  })
  const [routes, setRoutes] = useState(PREVIEW_ROUTES)
  const [selectedKind, setSelectedKind] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('Preview data — run an optimization after adding your TomTom key.')

  const selectedRoute = useMemo(
    () => routes.find((route) => route.kind === selectedKind) || routes[0],
    [routes, selectedKind],
  )

  const change = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: ['load_kg', 'fuel_price_per_litre'].includes(name) ? Number(value) : value,
    }))
  }

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('Fetching live traffic and evaluating route trade-offs…')
    try {
      const data = await optimizeRoute(form)
      const nextRoutes = Object.entries(data.recommendations).map(([kind, route]) => ({
        ...route,
        kind,
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
      }))
      setRoutes(nextRoutes)
      setSelectedKind('balanced')
      setMessage(`Live result · ${data.candidate_count} candidate routes analysed`)
    } catch (error) {
      setMessage(`${error.message}. Showing preview routes instead.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="GreenRoute home"><span className="brand-mark">G</span>GreenRoute</a>
        <div className="nav-links"><a href="#planner">Route Lab</a><a href="#impact">Impact</a><span className="status-pill">India logistics</span></div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">MULTI-OBJECTIVE LOGISTICS INTELLIGENCE</div>
          <h1>Choose the route that matches <em>what matters now.</em></h1>
          <p>GreenRoute blends live traffic, vehicle load, fuel economics and carbon analytics to surface the fastest, balanced and greenest shipment paths.</p>
          <div className="hero-actions"><a className="primary-btn" href="#planner">Plan a route ↘</a><span className="live-chip"><i /> Live-traffic ready</span></div>
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

            <button className="optimize-btn" disabled={loading} type="submit">{loading ? 'Optimizing…' : 'Optimize live routes'}<span>→</span></button>
          </form>

          <div className="map-panel glass-panel">
            <div className="map-topline"><div><span className="pulse-dot" /> Interactive route space</div><span>Drag · zoom · tilt</span></div>
            <RouteMap routes={routes} selectedKind={selectedKind} onSelectKind={setSelectedKind} />
            {selectedRoute && <div className="map-float-card"><small>Selected strategy</small><b>{selectedRoute.label}</b><span>{formatDuration(selectedRoute.duration_minutes)} · {selectedRoute.co2_kg.toFixed(1)} kg CO₂</span></div>}
          </div>
        </div>

        <div className="route-cards">
          {routes.map((route) => <RouteCard key={route.kind} route={route} active={selectedKind === route.kind} onClick={() => setSelectedKind(route.kind)} />)}
        </div>
      </section>

      <section className="impact-section" id="impact">
        <div className="impact-copy"><span>CARBON INTELLIGENCE</span><h2>Every route explains its trade-off.</h2><p>Instead of hiding sustainability behind a report, GreenRoute brings estimated fuel use and CO₂ into the decision itself. The database layer is prepared for trip history and BRSR-oriented analytics.</p></div>
        <div className="impact-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="impact-core"><strong>{selectedRoute?.co2_kg.toFixed(1) || '—'}</strong><small>kg CO₂</small></div><span className="orbit-label one">TIME</span><span className="orbit-label two">COST</span><span className="orbit-label three">CARBON</span></div>
      </section>

      <footer><div><span className="brand-mark small">G</span><b>GreenRoute</b></div><p>Final-year project · Indian road logistics · BRSR-oriented sustainability analytics</p></footer>
    </main>
  )
}
