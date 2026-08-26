import { useCallback, useEffect, useMemo, useState } from 'react'
import AuthPanel from './components/AuthPanel.jsx'
import HeroScene from './components/HeroScene.jsx'
import HistoryDashboard from './components/HistoryDashboard.jsx'
import LocationSearch from './components/LocationSearch.jsx'
import RouteIntelligence from './components/RouteIntelligence.jsx'
import RouteMap from './components/RouteMap.jsx'
import VehicleSelector, { inferStage } from './components/VehicleSelector.jsx'
import { deleteSavedTrip, getDashboard, getHealth, getHistory, getVehicleCatalog, optimizeRoute, saveOptimization } from './lib/api.js'
import { supabase, supabaseConfigured } from './lib/supabase.js'

const PREVIEW_ROUTES = [
  { kind: 'fastest', label: 'Fastest', distance_km: 347.8, duration_minutes: 337, fuel_litres: 46.8, fuel_cost: 4329, co2_kg: 125.4, traffic_delay_minutes: 31, coordinates: [[80.2707,13.0827],[79.6,13.05],[78.8,12.95],[77.9,12.9],[77.5946,12.9716]] },
  { kind: 'balanced', label: 'Balanced', distance_km: 341.2, duration_minutes: 356, fuel_litres: 42.7, fuel_cost: 3949, co2_kg: 114.4, traffic_delay_minutes: 19, coordinates: [[80.2707,13.0827],[79.7,12.75],[78.9,12.65],[78.15,12.72],[77.5946,12.9716]] },
  { kind: 'greenest', label: 'Greenest', distance_km: 334.6, duration_minutes: 378, fuel_litres: 39.9, fuel_cost: 3688, co2_kg: 106.9, traffic_delay_minutes: 13, coordinates: [[80.2707,13.0827],[79.55,12.55],[78.8,12.45],[78.05,12.55],[77.5946,12.9716]] },
]

const INITIAL_VEHICLE = {
  catalog_id: null,
  manufacturer: '',
  model: '',
  manufacture_year: new Date().getFullYear(),
  category: 'lcv',
  fuel_type: 'diesel',
  max_payload_kg: 4000,
  kerb_weight_kg: 2800,
  base_mileage_kmpl: 10.5,
  energy_consumption_kwh_per_km: null,
  max_speed_kmph: 80,
  emission_stage: '',
}

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
      <div className="route-card-head"><span className="route-icon">{icon}</span><div><strong>{route.label}</strong><small>{route.distance_km.toFixed(1)} km</small></div><span className="route-select-indicator">{active ? 'VIEWING' : 'EXPLORE'}</span></div>
      <div className="route-card-grid"><div><small>ETA</small><b>{formatDuration(route.duration_minutes)}</b></div><div><small>{route.energy_kwh ? 'Energy' : 'Fuel'}</small><b>{route.energy_kwh ? `${route.energy_kwh.toFixed(1)} kWh` : `${route.fuel_litres.toFixed(1)} L`}</b></div><div><small>Cost</small><b>₹{Math.round(route.fuel_cost).toLocaleString('en-IN')}</b></div><div><small>CO₂</small><b>{route.co2_kg.toFixed(1)} kg</b></div></div>
      <div className="route-meta"><span>Traffic delay {Math.round(route.traffic_delay_minutes || 0)} min</span>{route.kind !== 'fastest' && <span className="route-saving-mini">{Math.max(0, tradeoff.co2_saved_kg_vs_fastest).toFixed(1)} kg CO₂ saved</span>}</div>
    </button>
  )
}

export default function App() {
  const [form, setForm] = useState({
    origin_text: 'Aristo Public School, Cuddalore, Tamil Nadu 607104',
    destination_text: 'Sri Manakula Vinayagar Engineering College, Madagadipet, Puducherry 605107',
    origin_place: null,
    destination_place: null,
    load_kg: 500,
    fuel_price_per_litre: 92.5,
    electricity_price_per_kwh: 8,
    departure_mode: 'now',
    scheduled_departure: '',
    vehicle: INITIAL_VEHICLE,
  })
  const [vehicleCatalog, setVehicleCatalog] = useState([])
  const [routes, setRoutes] = useState(PREVIEW_ROUTES)
  const [selectedKind, setSelectedKind] = useState('balanced')
  const [loading, setLoading] = useState(false)
  const [routingMode, setRoutingMode] = useState('checking')
  const [message, setMessage] = useState('Connecting to the GreenRoute routing engine…')
  const [session, setSession] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [lastOptimization, setLastOptimization] = useState(null)
  const [lastOptimizationForm, setLastOptimizationForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [trips, setTrips] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const selectedRoute = useMemo(() => routes.find((route) => route.kind === selectedKind) || routes[0], [routes, selectedKind])
  const fastestRoute = useMemo(() => routes.find((route) => route.kind === 'fastest') || routes[0], [routes])
  const selectedVehicle = form.vehicle
  const loadRatio = Math.min(140, (form.load_kg / Math.max(selectedVehicle.max_payload_kg || 1, 1)) * 100)
  const loadInvalid = form.load_kg > (selectedVehicle.max_payload_kg || 0)
  const vehicleIncomplete = !selectedVehicle.manufacturer || !selectedVehicle.model || !selectedVehicle.manufacture_year
  const placesIncomplete = routingMode === 'live' && (!form.origin_place || !form.destination_place)
  const selectedSavings = useMemo(() => {
    if (!selectedRoute || !fastestRoute) return null
    const tradeoff = selectedRoute.tradeoff
    return {
      cost: tradeoff?.fuel_cost_saved_vs_fastest ?? Math.max(0, fastestRoute.fuel_cost - selectedRoute.fuel_cost),
      carbon: tradeoff?.co2_saved_kg_vs_fastest ?? Math.max(0, fastestRoute.co2_kg - selectedRoute.co2_kg),
      extraMinutes: tradeoff?.extra_minutes_vs_fastest ?? Math.max(0, selectedRoute.duration_minutes - fastestRoute.duration_minutes),
    }
  }, [selectedRoute, fastestRoute])

  const loadCloudData = useCallback(async (activeSession) => {
    if (!activeSession?.access_token) { setTrips([]); setDashboard(null); return }
    setHistoryLoading(true)
    try {
      const [historyData, dashboardData] = await Promise.all([getHistory(activeSession.access_token), getDashboard(activeSession.access_token)])
      setTrips(historyData.trips || [])
      setDashboard(dashboardData)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    Promise.all([getHealth(), getVehicleCatalog()]).then(([health, catalogData]) => {
      setRoutingMode(health.routing_mode)
      setVehicleCatalog(catalogData.vehicles || [])
      setMessage(health.routing_mode === 'live'
        ? 'Live mode ready — search and select exact TomTom places, then choose the real vehicle identity.'
        : 'Demo mode ready — precise TomTom place search requires the live API key.')
    }).catch(() => {
      setRoutingMode('offline')
      setMessage('Backend is offline. Preview routes remain available while you start FastAPI.')
    })
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    let mounted = true
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session || null) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { if (mounted) setSession(nextSession) })
    return () => { mounted = false; data.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (session?.access_token) loadCloudData(session)
    else { setTrips([]); setDashboard(null) }
  }, [session, loadCloudData])

  const change = (event) => {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: ['load_kg', 'fuel_price_per_litre', 'electricity_price_per_kwh'].includes(name) ? Number(value) : value,
    }))
  }

  function changeLocationText(kind, value) {
    setForm((current) => ({ ...current, [`${kind}_text`]: value, [`${kind}_place`]: null }))
  }

  function selectLocation(kind, place) {
    setForm((current) => ({
      ...current,
      [`${kind}_place`]: place,
      [`${kind}_text`]: place.address || place.label,
    }))
  }

  async function submit(event) {
    event.preventDefault()
    if (placesIncomplete) {
      setMessage('Choose an exact suggestion for both From and To. GreenRoute will route from those coordinates, not a city centre.')
      return
    }
    if (vehicleIncomplete) {
      setMessage('Select the vehicle company, exact model/variant and manufacturing year before optimizing.')
      return
    }
    if (loadInvalid) {
      setMessage(`${selectedVehicle.manufacturer} ${selectedVehicle.model} supports the entered rated payload of ${Number(selectedVehicle.max_payload_kg).toLocaleString('en-IN')} kg. Reduce the shipment load or correct the vehicle payload specification.`)
      return
    }

    setLoading(true)
    setMessage('Fetching precise route candidates and evaluating vehicle-specific time, energy and carbon trade-offs…')
    try {
      const departureTime = form.departure_mode === 'scheduled' && form.scheduled_departure ? `${form.scheduled_departure}:00+05:30` : 'now'
      const vehicle = {
        ...form.vehicle,
        emission_stage: form.vehicle.emission_stage || inferStage(form.vehicle.manufacture_year),
      }
      const requestPayload = {
        origin: form.origin_place || form.origin_text,
        destination: form.destination_place || form.destination_text,
        load_kg: form.load_kg,
        vehicle,
        fuel_price_per_litre: form.fuel_price_per_litre,
        electricity_price_per_kwh: form.electricity_price_per_kwh,
        departure_time: departureTime,
      }
      const data = await optimizeRoute(requestPayload)
      setRoutes(Object.entries(data.recommendations).map(([kind, route]) => ({ ...route, kind, label: kind.charAt(0).toUpperCase() + kind.slice(1) })))
      setSelectedKind('balanced')
      setRoutingMode(data.mode)
      setLastOptimization(data)
      setLastOptimizationForm(requestPayload)
      setMessage(`${data.mode === 'live' ? 'LIVE TRAFFIC' : 'DEMO SIMULATION'} · ${data.candidate_count} candidate routes analysed · ${data.notice}`)
    } catch (error) {
      setMessage(`${error.message}. Keeping the last available routes on screen.`)
    } finally { setLoading(false) }
  }

  async function saveTrip() {
    if (!session?.access_token) { setAuthOpen(true); setMessage('Sign in first, then GreenRoute can save this route decision to your private trip history.'); return }
    if (!lastOptimization || !lastOptimizationForm) { setMessage('Run an optimization before saving a trip.'); return }
    setSaving(true)
    try {
      await saveOptimization({ form: lastOptimizationForm, optimization: lastOptimization, selected_strategy: selectedKind }, session.access_token)
      setMessage(`${selectedRoute.label} decision saved to your GreenRoute history.`)
      await loadCloudData(session)
    } catch (error) { setMessage(error.message) } finally { setSaving(false) }
  }

  async function deleteTrip(runId) {
    if (!session?.access_token) return
    try { await deleteSavedTrip(runId, session.access_token); setMessage('Saved trip removed.'); await loadCloudData(session) } catch (error) { setMessage(error.message) }
  }

  const modeLabel = routingMode === 'live' ? '● Live traffic' : routingMode === 'demo' ? '◇ Demo mode' : routingMode === 'offline' ? '○ Backend offline' : '… Connecting'

  return (
    <main>
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="GreenRoute home"><span className="brand-mark">G</span>GreenRoute</a>
        <div className="nav-links"><a href="#planner">Route Lab</a><a href="#intelligence">Intelligence</a><a href="#history">History</a><span className="status-pill">{modeLabel}</span><button className="account-btn" type="button" onClick={() => setAuthOpen((current) => !current)}>{session ? '● Synced' : 'Sign in'}</button></div>
        {authOpen && <AuthPanel session={session} onClose={() => setAuthOpen(false)} />}
      </nav>

      <section className="hero" id="top"><div className="hero-copy"><div className="eyebrow">MULTI-OBJECTIVE LOGISTICS INTELLIGENCE</div><h1>Choose the route that matches <em>what matters now.</em></h1><p>GreenRoute blends live traffic, exact shipment locations, real vehicle identity, fuel economics and carbon analytics to surface the fastest, balanced and greenest shipment paths.</p><div className="hero-actions"><a className="primary-btn" href="#planner">Plan a route ↘</a><span className="live-chip"><i /> Interactive 3D logistics</span></div><div className="hero-stats"><div><b>3</b><span>route strategies</span></div><div><b>POI</b><span>coordinate-level search</span></div><div><b>CO₂</b><span>vehicle-aware analytics</span></div></div></div><HeroScene /></section>

      <section className="planner-section" id="planner">
        <div className="section-heading"><div><span>ROUTE LAB</span><h2>Turn shipment constraints into transparent choices.</h2></div><p>{message}</p></div>
        <div className="planner-grid v2-grid">
          <form className="planner-form glass-panel v2-form" onSubmit={submit}>
            <div className="form-title"><span>01</span><div><h3>Shipment & fleet details</h3><p>Select exact places and the actual vehicle used for this trip.</p></div></div>

            <LocationSearch label="From — exact pickup point" text={form.origin_text} selected={form.origin_place} onTextChange={(value) => changeLocationText('origin', value)} onSelect={(place) => selectLocation('origin', place)} placeholder="School, warehouse, address, pincode…" />
            <LocationSearch label="To — exact delivery point" text={form.destination_text} selected={form.destination_place} onTextChange={(value) => changeLocationText('destination', value)} onSelect={(place) => selectLocation('destination', place)} placeholder="College, factory, address, pincode…" />

            <div className="two-col"><label>Shipment load (kg)<input type="number" min="1" step="1" name="load_kg" value={form.load_kg} onChange={change} required /></label>{form.vehicle.fuel_type === 'electric' ? <label>Electricity price (₹/kWh)<input type="number" min="1" step="0.1" name="electricity_price_per_kwh" value={form.electricity_price_per_kwh} onChange={change} required /></label> : <label>Fuel price (₹/L)<input type="number" min="1" step="0.1" name="fuel_price_per_litre" value={form.fuel_price_per_litre} onChange={change} required /></label>}</div>

            <VehicleSelector catalog={vehicleCatalog} vehicle={form.vehicle} onChange={(vehicle) => setForm((current) => ({ ...current, vehicle }))} />

            <div className={`load-meter ${loadInvalid ? 'over' : ''}`}><div><span>Payload utilisation</span><b>{Math.round(loadRatio)}%</b></div><div className="load-track"><i style={{ width: `${Math.min(100, loadRatio)}%` }} /></div><small>{form.load_kg.toLocaleString('en-IN')} / {Number(selectedVehicle.max_payload_kg || 0).toLocaleString('en-IN')} kg rated payload</small></div>
            <div className="departure-block"><span>Departure</span><div className="departure-toggle"><label className={form.departure_mode === 'now' ? 'active' : ''}><input type="radio" name="departure_mode" value="now" checked={form.departure_mode === 'now'} onChange={change} />Now</label><label className={form.departure_mode === 'scheduled' ? 'active' : ''}><input type="radio" name="departure_mode" value="scheduled" checked={form.departure_mode === 'scheduled'} onChange={change} />Schedule</label></div>{form.departure_mode === 'scheduled' && <input type="datetime-local" name="scheduled_departure" value={form.scheduled_departure} onChange={change} required />}</div>
            <button className="optimize-btn" disabled={loading || loadInvalid || vehicleIncomplete || placesIncomplete} type="submit">{loading ? 'Optimizing…' : 'Optimize exact route'}<span>→</span></button>
            {placesIncomplete && <p className="form-warning">Choose a TomTom suggestion for both locations to lock exact coordinates.</p>}
            {loadInvalid && <p className="form-warning">Shipment exceeds the vehicle's entered rated payload.</p>}
          </form>
          <div className="map-panel glass-panel"><div className="map-topline"><div><span className="pulse-dot" /> Interactive route space</div><span>Drag · zoom · tilt</span></div><RouteMap routes={routes} selectedKind={selectedKind} onSelectKind={setSelectedKind} origin={lastOptimization?.origin} destination={lastOptimization?.destination} />{selectedRoute && <div className="map-float-card"><small>Selected strategy</small><b>{selectedRoute.label}</b><span>{formatDuration(selectedRoute.duration_minutes)} · {selectedRoute.co2_kg.toFixed(1)} kg CO₂</span></div>}</div>
        </div>
        <div className="route-cards">{routes.map((route) => <RouteCard key={route.kind} route={route} fastestRoute={fastestRoute} active={selectedKind === route.kind} onClick={() => setSelectedKind(route.kind)} />)}</div>
        <div id="intelligence"><RouteIntelligence route={selectedRoute} fastestRoute={fastestRoute} /></div>
        <div className="save-trip-bar glass-panel"><div><span>CLOUD TRIP MEMORY</span><strong>{lastOptimization ? `Save ${selectedRoute.label} as the chosen strategy` : 'Optimize a real trip to enable saving'}</strong><small>{session ? `Signed in as ${session.user.email}` : supabaseConfigured ? 'Sign in with a secure email magic link to sync history.' : 'Add the Supabase publishable key to enable cloud sync.'}</small></div><button type="button" className="primary-btn" onClick={saveTrip} disabled={saving || !lastOptimization}>{saving ? 'Saving…' : session ? 'Save Trip ↗' : 'Sign in to save'}</button></div>
      </section>

      <section className="impact-section" id="impact"><div className="impact-copy"><span>CARBON INTELLIGENCE</span><h2>Every route explains its trade-off.</h2><p>GreenRoute estimates energy from the actual vehicle profile and keeps Bharat Stage classification separate from fuel CO₂ accounting, so older vehicles are not assigned fake chemistry factors.</p>{selectedSavings && selectedKind !== 'fastest' && <p className="impact-saving">Choose {selectedRoute.label} and you currently trade about <b>{Math.round(selectedSavings.extraMinutes)} extra minutes</b> for roughly <b>₹{Math.max(0, Math.round(selectedSavings.cost)).toLocaleString('en-IN')}</b> in energy savings and <b>{Math.max(0, selectedSavings.carbon).toFixed(1)} kg less CO₂</b> versus Fastest.</p>}</div><div className="impact-orbit"><div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" /><div className="impact-core"><strong>{selectedRoute?.co2_kg.toFixed(1) || '—'}</strong><small>kg CO₂</small></div><span className="orbit-label one">TIME</span><span className="orbit-label two">COST</span><span className="orbit-label three">CARBON</span></div></section>

      <HistoryDashboard session={session} dashboard={dashboard} trips={trips} loading={historyLoading} onRefresh={() => loadCloudData(session)} onDelete={deleteTrip} />
      <footer><div><span className="brand-mark small">G</span><b>GreenRoute</b></div><p>Indian road logistics · exact POI routing · vehicle-aware carbon analytics · Supabase-backed history</p></footer>
    </main>
  )
}
