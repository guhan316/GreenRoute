import Emissions, { emissionsLabel } from './components/Emissions.jsx'
import MultiStopPlanner from './components/MultiStopPlanner.jsx'
import DispatchPlanner from './components/DispatchPlanner.jsx'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AuthPanel from './components/AuthPanel.jsx'
import ObjectiveWeights, { DEFAULT_WEIGHTS } from './components/ObjectiveWeights.jsx'
import './minimal.css'
import HistoryDashboard from './components/HistoryDashboard.jsx'
import LocationSearch from './components/LocationSearch.jsx'
import RouteIntelligence from './components/RouteIntelligence.jsx'
import RouteMap from './components/RouteMap.jsx'
import VehicleSelector from './components/VehicleSelector.jsx'
import { deleteSavedTrip, getDashboard, getHealth, getHistory, getVehicleCatalog, optimizeRoute, saveOptimization } from './lib/api.js'
import { supabase, supabaseConfigured } from './lib/supabase.js'

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

function buildMapRoutes(data, strategyRoutes) {
  const byCandidate = new Map()

  for (const route of strategyRoutes) {
    const candidateId = route.candidate_id || `${route.distance_km}-${route.duration_minutes}`
    const existing = byCandidate.get(candidateId)
    if (existing) {
      if (!existing.strategyKinds.includes(route.kind)) existing.strategyKinds.push(route.kind)
      continue
    }
    byCandidate.set(candidateId, {
      ...route,
      mapKey: candidateId,
      strategyKinds: [route.kind],
      isAlternative: false,
    })
  }

  const mapRoutes = [...byCandidate.values()]
  const seen = new Set(byCandidate.keys())
  for (const candidate of data.candidates || []) {
    if (mapRoutes.length >= 10) break
    const candidateId = candidate.candidate_id || `${candidate.distance_km}-${candidate.duration_minutes}`
    if (seen.has(candidateId)) continue
    seen.add(candidateId)
    mapRoutes.push({
      ...candidate,
      mapKey: candidateId,
      kind: 'alternative',
      label: `Road alternative ${mapRoutes.length + 1}`,
      strategyKinds: [],
      isAlternative: true,
    })
  }
  return mapRoutes
}

function RouteCard({ route, fastestRoute, active, onClick }) {
  const icon = route.kind === 'fastest' ? '01' : route.kind === 'balanced' ? '02' : '03'
  const tradeoff = route.tradeoff || {
    extra_minutes_vs_fastest: route.duration_minutes - fastestRoute.duration_minutes,
    fuel_cost_saved_vs_fastest: fastestRoute.fuel_cost - route.fuel_cost,
    co2_saved_kg_vs_fastest: fastestRoute.co2_kg - route.co2_kg,
  }
  const energyQuantity = route.energy_quantity ?? (route.energy_kwh || route.fuel_litres || 0)
  const energyUnit = route.energy_unit || (route.energy_kwh ? 'kWh' : 'L')
  const sourceType = route.source_route_type ? route.source_route_type.toUpperCase() : null
  const sharedCount = Array.isArray(route.shared_physical_route_with) ? route.shared_physical_route_with.length : 0

  return (
    <button className={`route-card ${active ? 'active' : ''} ${route.kind}`} onClick={onClick} type="button">
      <div className="route-card-head"><span className="route-icon">{icon}</span><div><strong>{route.label}</strong><small>{route.distance_km.toFixed(1)} km{sourceType ? ` · ${sourceType}` : ''}{sharedCount ? ' · SHARED ROAD' : ''}</small></div><span className="route-select-indicator">{active ? 'VIEWING' : 'EXPLORE'}</span></div>
      <div className="route-card-grid"><div><small>ETA</small><b>{formatDuration(route.duration_minutes)}</b></div><div><small>Energy</small><b>{Number(energyQuantity).toFixed(1)} {energyUnit}</b></div><div><small>Cost</small><b>₹{Math.round(route.fuel_cost).toLocaleString('en-IN')}</b></div><Emissions route={route} /></div>
      <div className="route-meta"><span>Traffic delay {Math.round(route.traffic_delay_minutes || 0)} min</span>{route.kind !== 'fastest' && <span className="route-saving-mini">{Math.max(0, tradeoff.co2_saved_kg_vs_fastest).toFixed(1)} kg CO₂ saved</span>}</div>
    </button>
  )
}

const currentView = () => ['planner','multi-stop','dispatch','intelligence','history'].includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : 'planner'

export default function App() {
  const [activeView, setActiveView] = useState(currentView)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  useEffect(() => {
    function navigate() { setActiveView(currentView()); window.scrollTo(0,0) }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const [form, setForm] = useState({
    origin_text: '',
    destination_text: '',
    origin_place: null,
    destination_place: null,
    load_kg: '',
    fuel_price_per_litre: '',
    electricity_price_per_kwh: '',
    departure_mode: 'now',
    scheduled_departure: '',
    vehicle: INITIAL_VEHICLE,
  })
  const [vehicleCatalog, setVehicleCatalog] = useState([])
  const [routes, setRoutes] = useState([])
  const [mapRoutes, setMapRoutes] = useState([])
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
  const [trafficMonitoring, setTrafficMonitoring] = useState(false)
  const [trafficRefreshing, setTrafficRefreshing] = useState(false)
  const [lastTrafficCheck, setLastTrafficCheck] = useState(null)
  const [trafficNotice, setTrafficNotice] = useState('Run a route with departure set to Now to start live traffic monitoring.')

  const selectedRoute = useMemo(() => routes.find((route) => route.kind === selectedKind) || routes[0] || null, [routes, selectedKind])
  const fastestRoute = useMemo(() => routes.find((route) => route.kind === 'fastest') || routes[0] || null, [routes])
  const distinctStrategyRoads = useMemo(() => new Set(routes.map((route) => route.candidate_id)).size, [routes])
  const selectedVehicle = form.vehicle
  const loadValue = Number(form.load_kg || 0)
  const fuelPriceValue = Number(form.fuel_price_per_litre || 0)
  const electricityPriceValue = Number(form.electricity_price_per_kwh || 0)
  const gaseousFuel = ['cng', 'lng'].includes(selectedVehicle.fuel_type)
  const loadRatio = Math.min(140, (loadValue / Math.max(selectedVehicle.max_payload_kg || 1, 1)) * 100)
  const loadInvalid = loadValue > (selectedVehicle.max_payload_kg || 0)
  const vehicleIncomplete = !selectedVehicle.manufacturer || !selectedVehicle.model || !selectedVehicle.manufacture_year || (selectedVehicle.fuel_type !== 'electric' && !selectedVehicle.emission_stage)
  const placesIncomplete = routingMode === 'live' && (!form.origin_place || !form.destination_place)
  const numericIncomplete = loadValue <= 0 || (selectedVehicle.fuel_type === 'electric' ? electricityPriceValue <= 0 : fuelPriceValue <= 0)

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
        ? 'Live mode ready — choose exact pickup and delivery points, then enter the actual shipment and vehicle details.'
        : 'Demo mode ready — precise TomTom place search requires the live API key.')
    }).catch(() => {
      setRoutingMode('offline')
      setMessage('Backend is offline. Start the GreenRoute API to search places and optimize routes.')
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

  function invalidateOptimization() {
    setRoutes([])
    setMapRoutes([])
    setLastOptimization(null)
    setLastOptimizationForm(null)
    setTrafficMonitoring(false)
    setLastTrafficCheck(null)
    setTrafficNotice('Run a route with departure set to Now to start live traffic monitoring.')
  }

  const change = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    invalidateOptimization()
  }

  function changeVehicle(vehicle) {
    setForm((current) => ({ ...current, vehicle }))
    invalidateOptimization()
  }

  function changeLocationText(kind, value) {
    setForm((current) => ({ ...current, [`${kind}_text`]: value, [`${kind}_place`]: null }))
    invalidateOptimization()
  }

  function selectLocation(kind, place) {
    setForm((current) => ({
      ...current,
      [`${kind}_place`]: place,
      [`${kind}_text`]: place.address || place.label,
    }))
    invalidateOptimization()
  }

  async function submit(event) {
    event.preventDefault()
    if (placesIncomplete) {
      setMessage('Choose an exact suggestion for both From and To, or pin the locations directly on the map.')
      return
    }
    if (vehicleIncomplete) {
      setMessage('Select the vehicle company, exact model/variant, manufacturing year and Bharat Stage before optimizing.')
      return
    }
    if (numericIncomplete) {
      setMessage('Enter the shipment load and the applicable fuel or electricity price before optimizing.')
      return
    }
    if (loadInvalid) {
      setMessage(`${selectedVehicle.manufacturer} ${selectedVehicle.model} has an entered rated payload of ${Number(selectedVehicle.max_payload_kg).toLocaleString('en-IN')} kg. Reduce the shipment load or correct the vehicle payload specification.`)
      return
    }

    setLoading(true)
    setMessage('Fetching diverse live route candidates and evaluating vehicle-specific time, energy and carbon trade-offs…')
    try {
      const departureTime = form.departure_mode === 'scheduled' && form.scheduled_departure ? `${form.scheduled_departure}:00+05:30` : 'now'
      const vehicle = {
        ...form.vehicle,
        emission_stage: form.vehicle.fuel_type === 'electric' ? 'Not applicable (EV)' : form.vehicle.emission_stage,
      }
      const requestPayload = {
        origin: form.origin_place || form.origin_text,
        destination: form.destination_place || form.destination_text,
        load_kg: loadValue,
        vehicle,
        fuel_price_per_litre: selectedVehicle.fuel_type === 'electric' ? 1 : fuelPriceValue,
        electricity_price_per_kwh: selectedVehicle.fuel_type === 'electric' ? electricityPriceValue : 1,
        departure_time: departureTime,
        objective_weights: weights,
      }
      const data = await optimizeRoute(requestPayload)
      const strategyRoutes = Object.entries(data.recommendations).map(([kind, route]) => ({ ...route, kind, label: kind.charAt(0).toUpperCase() + kind.slice(1) }))
      setRoutes(strategyRoutes)
      setMapRoutes(buildMapRoutes(data, strategyRoutes))
      setSelectedKind('balanced')
      setRoutingMode(data.mode)
      setLastOptimization(data)
      setLastOptimizationForm(requestPayload)
      const liveMonitorReady = requestPayload.departure_time === 'now' && data.traffic_aware
      setTrafficMonitoring(liveMonitorReady)
      setLastTrafficCheck(liveMonitorReady ? new Date() : null)
      setTrafficNotice(liveMonitorReady
        ? 'Live traffic monitoring is ON. GreenRoute will re-check traffic every 60 seconds and refresh the route when traffic conditions change.'
        : data.traffic_aware
          ? 'Traffic-aware route calculated for the scheduled departure. Automatic monitoring is available only for trips departing now.'
          : 'Live traffic is temporarily unavailable; GreenRoute is using its real-road fallback.')
      const distinctCount = new Set(strategyRoutes.map((route) => route.candidate_id)).size
      const distinctText = distinctCount < 3
        ? ` · ${distinctCount} distinct strategy road${distinctCount === 1 ? '' : 's'}; other TomTom roads shown in grey`
        : ' · 3 distinct strategy roads'
      setMessage(`${data.traffic_aware ? 'LIVE TRAFFIC' : data.mode === 'live' ? 'LIVE ROAD ROUTING' : 'DEMO SIMULATION'} · ${data.candidate_count} candidate routes analysed${distinctText} · ${data.notice}`)
    } catch (error) {
      setMessage(error.message)
    } finally { setLoading(false) }
  }

  const refreshTraffic = useCallback(async (automatic = false) => {
    if (!lastOptimizationForm || lastOptimizationForm.departure_time !== 'now' || trafficRefreshing) return
    setTrafficRefreshing(true)
    try {
      const previous = routes.find((route) => route.kind === selectedKind) || routes[0] || null
      const data = await optimizeRoute({ ...lastOptimizationForm, departure_time: 'now' })
      const strategyRoutes = Object.entries(data.recommendations).map(([kind, route]) => ({
        ...route,
        kind,
        label: kind.charAt(0).toUpperCase() + kind.slice(1),
      }))
      const next = strategyRoutes.find((route) => route.kind === selectedKind) || strategyRoutes[0] || null

      if (data.traffic_aware) {
        const roadChanged = Boolean(previous && next && (
          previous.candidate_id !== next.candidate_id
          || Math.abs(Number(previous.distance_km || 0) - Number(next.distance_km || 0)) >= 0.5
        ))
        const delayDelta = previous && next
          ? Number(next.traffic_delay_minutes || 0) - Number(previous.traffic_delay_minutes || 0)
          : 0

        setRoutes(strategyRoutes)
        setMapRoutes(buildMapRoutes(data, strategyRoutes))
        setLastOptimization(data)
        setRoutingMode(data.mode)
        setLastTrafficCheck(new Date())

        if (roadChanged) {
          setTrafficNotice(`${automatic ? 'Auto-rerouted' : 'Rerouted'} ${selectedKind}: a different road is now preferred using current traffic. Live delay: ${Math.round(next?.traffic_delay_minutes || 0)} min.`)
        } else if (Math.abs(delayDelta) >= 2) {
          setTrafficNotice(`Traffic refreshed: ${selectedKind} stays on the same road, but live delay changed by ${delayDelta > 0 ? '+' : ''}${Math.round(delayDelta)} min.`)
        } else {
          setTrafficNotice(`Traffic refreshed: ${selectedKind} remains the preferred road. Current live delay: ${Math.round(next?.traffic_delay_minutes || 0)} min.`)
        }
      } else {
        setTrafficMonitoring(false)
        setTrafficNotice('Live traffic provider is temporarily unavailable. Automatic traffic rerouting is paused; GraphHopper fallback is still available.')
      }
    } catch (error) {
      setTrafficNotice(`Traffic refresh failed: ${error.message}`)
    } finally {
      setTrafficRefreshing(false)
    }
  }, [lastOptimizationForm, trafficRefreshing, routes, selectedKind])

  useEffect(() => {
    if (!trafficMonitoring || !lastOptimizationForm || lastOptimizationForm.departure_time !== 'now') return undefined
    const timer = window.setInterval(() => refreshTraffic(true), 60000)
    return () => window.clearInterval(timer)
  }, [trafficMonitoring, lastOptimizationForm, refreshTraffic])

  async function saveTrip() {
    if (!session?.access_token) { setAuthOpen(true); setMessage('Sign in first, then GreenRoute can save this route decision to your private trip history.'); return }
    if (!lastOptimization || !lastOptimizationForm || !selectedRoute) { setMessage('Run an optimization before saving a trip.'); return }
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

  const modeLabel = routingMode === 'live' ? 'Live traffic' : routingMode === 'demo' ? 'Demo mode' : routingMode === 'offline' ? 'Backend offline' : 'Connecting'
  const modeDetail = routingMode === 'live'
    ? 'TomTom live traffic with GraphHopper fallback'
    : routingMode === 'demo'
      ? 'Synthetic routes — safe for interface testing'
      : routingMode === 'offline'
        ? 'Route API is currently unreachable'
        : 'Checking routing and vehicle services'

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a className="brand" href="#top" aria-label="GreenRoute home">
          <span className="brand-mark">G</span>
          <span>Green<span>Route</span></span>
        </a>
        <div className="nav-links">
          <a href="#planner" aria-current={activeView === 'planner' ? 'page' : undefined}>Route planner</a>
          <a href="#multi-stop" aria-current={activeView === 'multi-stop' ? 'page' : undefined}>Multi-stop</a>
          <a href="#dispatch" aria-current={activeView === 'dispatch' ? 'page' : undefined}>Dispatch</a>
          <a href="#intelligence" aria-current={activeView === 'intelligence' ? 'page' : undefined}>Scoring</a>
          <a href="#history" aria-current={activeView === 'history' ? 'page' : undefined}>History</a>
        </div>
        <div className="nav-actions">
          <span className={`status-pill ${routingMode}`}><i />{modeLabel}</span>
          <button className="account-btn" type="button" onClick={() => setAuthOpen((current) => !current)}>{session ? 'Synced account' : 'Sign in'}</button>
        </div>
        {authOpen && <AuthPanel session={session} onClose={() => setAuthOpen(false)} />}
      </nav>

      <header className="workspace-header" id="top">
        <div><span className="eyebrow">GREENROUTE / LOGISTICS WORKSPACE</span><h1>{{planner:'Every delivery, a better decision.', 'multi-stop':'One depot. Every stop.', dispatch:'Orders in. Fleet assigned.', intelligence:'Understand every route choice.', history:'Your delivery record.'}[activeView]}</h1><p>{{planner:'Compare time, cost and carbon on real roads.', 'multi-stop':'Build your itinerary anywhere in India.', dispatch:'Create orders, manage fleet availability and let OR-Tools build the dispatch plan.', intelligence:'Clear objectives. Visible trade-offs.', history:'Review saved trips and estimated savings.'}[activeView]}</p></div>
        {activeView !== 'intelligence' && <a className="secondary-btn" href="#intelligence">See how routes are scored ↗</a>}
      </header>
      <MultiStopPlanner vehicle={form.vehicle} catalog={vehicleCatalog} hidden={activeView !== 'multi-stop'} />
      <DispatchPlanner hidden={activeView !== 'dispatch'} />

      <section className="planner-section" id="planner" hidden={activeView !== 'planner'}>
        <div className={`planner-status ${routingMode}`} role="status">
          <span className="planner-status-icon"><i /></span>
          <div><strong>{modeLabel}</strong><small>{modeDetail}</small></div>
          <p>{message}</p>
        </div>

        <div className="planner-grid v2-grid">
          <form className="planner-form glass-panel v2-form" onSubmit={submit}>
            <div className="form-title"><div><h3>Shipment details</h3><p>Search an address or pin it on the map.</p></div></div>

            <div className="form-group route-point-group">
              <div className="form-group-label"><span>Route points</span><small>Required</small></div>
              <LocationSearch label="Pickup location" text={form.origin_text} selected={form.origin_place} onTextChange={(value) => changeLocationText('origin', value)} onSelect={(place) => selectLocation('origin', place)} placeholder="Search warehouse, street, business or pincode…" />
              <div className="route-point-line" aria-hidden="true" />
              <LocationSearch label="Delivery location" text={form.destination_text} selected={form.destination_place} onTextChange={(value) => changeLocationText('destination', value)} onSelect={(place) => selectLocation('destination', place)} placeholder="Search destination, landmark or pincode…" />
            </div>

            <div className="form-group shipment-group">
              <div className="form-group-label"><span>Shipment economics</span><small>Actual values</small></div>
              <div className="two-col">
                <label>Shipment load (kg)<input type="number" min="1" step="1" name="load_kg" value={form.load_kg} onChange={change} placeholder="e.g. 500" required /></label>
                {form.vehicle.fuel_type === 'electric'
                  ? <label>Electricity price (₹/kWh)<input type="number" min="0.01" step="0.01" name="electricity_price_per_kwh" value={form.electricity_price_per_kwh} onChange={change} placeholder="e.g. 8.00" required /></label>
                  : <label>Fuel price (₹/{gaseousFuel ? 'kg' : 'L'})<input type="number" min="0.01" step="0.01" name="fuel_price_per_litre" value={form.fuel_price_per_litre} onChange={change} placeholder={gaseousFuel ? 'e.g. 86.00' : 'e.g. 92.50'} required /></label>}
              </div>
            </div>

            <VehicleSelector catalog={vehicleCatalog} vehicle={form.vehicle} onChange={changeVehicle} />

            <ObjectiveWeights value={weights} onChange={setWeights} />
            <div className={`load-meter ${loadInvalid ? 'over' : ''}`}><div><span>Payload utilisation</span><b>{Math.round(loadRatio)}%</b></div><div className="load-track"><i style={{ width: `${Math.min(100, loadRatio)}%` }} /></div><small>{loadValue.toLocaleString('en-IN')} / {Number(selectedVehicle.max_payload_kg || 0).toLocaleString('en-IN')} kg rated payload</small></div>
            <div className="departure-block"><span>Departure</span><div className="departure-toggle"><label className={form.departure_mode === 'now' ? 'active' : ''}><input type="radio" name="departure_mode" value="now" checked={form.departure_mode === 'now'} onChange={change} />Now</label><label className={form.departure_mode === 'scheduled' ? 'active' : ''}><input type="radio" name="departure_mode" value="scheduled" checked={form.departure_mode === 'scheduled'} onChange={change} />Schedule</label></div>{form.departure_mode === 'scheduled' && <input type="datetime-local" name="scheduled_departure" value={form.scheduled_departure} onChange={change} required />}</div>
            <button className="optimize-btn" disabled={loading || loadInvalid || vehicleIncomplete || placesIncomplete || numericIncomplete || !Object.values(weights).some(value => value > 0)} type="submit"><span>{loading ? 'Comparing roads…' : 'Compare route strategies'}</span><b>→</b></button>
            {placesIncomplete && <p className="form-warning">Choose a suggestion or pin both locations directly on the map.</p>}
            {loadInvalid && <p className="form-warning">Shipment exceeds the vehicle's entered rated payload.</p>}
          </form>

          <div className="map-panel glass-panel map-panel-v3">
            <div className="map-topline"><div><span className="pulse-dot" /> Live decision map</div><span>Pin · zoom · compare roads</span></div>
            <RouteMap routes={mapRoutes.length ? mapRoutes : routes} selectedKind={selectedKind} onSelectKind={setSelectedKind} origin={form.origin_place || lastOptimization?.origin} destination={form.destination_place || lastOptimization?.destination} onPickPlace={selectLocation} />
            {!selectedRoute && <div className="map-empty-card"><span>01</span><div><strong>Your routes will appear here</strong><small>Select both locations and enter the shipment details to begin.</small></div></div>}
            {selectedRoute && <div className={`map-float-card ${selectedRoute.kind}`}><small>SELECTED STRATEGY</small><b>{selectedRoute.label}</b><span>{formatDuration(selectedRoute.duration_minutes)} · ₹{Math.round(selectedRoute.fuel_cost).toLocaleString('en-IN')} · {selectedRoute.co2_kg.toFixed(1)} kg {emissionsLabel(selectedRoute.fuel_type)}</span></div>}
          </div>
        </div>

        {routes.length > 0 && fastestRoute && <div className="route-results-heading"><div><span>ROUTE COMPARISON</span><h3>Choose what matters for this delivery</h3></div><small>Select a card to highlight its physical road.</small></div>}
        {routes.length > 0 && fastestRoute && <div className="route-cards">{routes.map((route) => <RouteCard key={route.kind} route={route} fastestRoute={fastestRoute} active={selectedKind === route.kind} onClick={() => setSelectedKind(route.kind)} />)}</div>}
        {routes.length > 0 && lastOptimizationForm?.departure_time === 'now' && <div className={`traffic-monitor-card ${lastOptimization?.traffic_aware ? 'active' : 'paused'}`}>
          <div className="traffic-monitor-copy">
            <span>LIVE TRAFFIC MONITOR</span>
            <strong>{lastOptimization?.traffic_aware ? 'Real-time traffic-aware rerouting' : 'Traffic monitoring paused'}</strong>
            <p>{trafficNotice}</p>
            <small>{lastTrafficCheck ? `Last checked ${lastTrafficCheck.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Not checked yet'}{lastOptimization?.traffic_aware ? ' · TomTom live traffic' : ' · GraphHopper fallback'}</small>
          </div>
          <div className="traffic-monitor-actions">
            <label><input type="checkbox" checked={trafficMonitoring} disabled={!lastOptimization?.traffic_aware} onChange={(event) => setTrafficMonitoring(event.target.checked)} /> Auto-reroute every 60 sec</label>
            <button type="button" onClick={() => refreshTraffic(false)} disabled={trafficRefreshing}>{trafficRefreshing ? 'Checking traffic…' : 'Check traffic now'}</button>
          </div>
        </div>}

        {routes.length > 0 && distinctStrategyRoads < 3 && <div className="strategy-overlap-note"><b>{distinctStrategyRoads === 1 ? 'One physical road wins multiple objectives.' : 'Two strategy labels share a physical road.'}</b> The current vehicle’s cost and CO₂ estimates both depend on energy use. Shared roads can therefore win multiple objectives. Adjust Balanced priorities and recalculate to explore the trade-off.</div>}
        {selectedRoute && fastestRoute && <RouteIntelligence route={selectedRoute} fastestRoute={fastestRoute} />}
        <div className="save-trip-bar glass-panel"><div><span>TRIP MEMORY</span><strong>{lastOptimization && selectedRoute ? `Save ${selectedRoute.label} as the chosen strategy` : 'Your chosen route can be saved here'}</strong><small>{session ? `Signed in as ${session.user.email}` : supabaseConfigured ? 'Sign in with a secure email magic link to sync history.' : 'Cloud sync is not configured yet.'}</small></div><button type="button" className="primary-btn" onClick={saveTrip} disabled={saving || !lastOptimization}>{saving ? 'Saving…' : session ? 'Save trip' : 'Sign in to save'}<span>↗</span></button></div>
      </section>

      <section id="intelligence" className="scoring-page" hidden={activeView !== 'intelligence'}>
        <div className="scoring-cards">
          <article><span>01 / FASTEST</span><h2>Time comes first.</h2><p>Uses the lowest live-traffic ETA when TomTom is available. For departures set to Now, GreenRoute can re-check traffic and reroute automatically as conditions change.</p></article>
          <article><span>02 / BALANCED</span><h2>Your priorities, combined.</h2><p>Uses adjustable time, cost and CO₂ weights. Defaults to 50% time, 30% cost and 20% CO₂. Each metric is scaled from 0 to 1 across the evaluated candidates.</p></article>
          <article><span>03 / GREENEST</span><h2>Lower estimated carbon.</h2><p>Selects the lowest estimated CO₂ among Pareto-efficient roads, using cost and time to break ties.</p></article>
        </div>
        <article className="method-card"><h2>Why can two strategies use the same road?</h2><p>A strategy is an objective, not a guarantee of a different road. For the same vehicle, cost and carbon both depend on energy consumed. A road that uses less fuel often wins both. Some locations also have only one practical road option.</p><p>Balanced considers a distinct Pareto-efficient middle road only when its normalized score is within 0.05 of the best weighted score. Roads that are worse on every objective are excluded.</p><code>Balanced score = time weight × normalized time + cost weight × normalized cost + CO₂ weight × normalized CO₂</code><p>A lower score is better. A Pareto-efficient road has no evaluated alternative that is at least as good on every metric and better on one.</p><a className="primary-btn" href="#planner">Adjust priorities in the planner →</a></article>
        <article className="method-card"><h2>What the carbon number includes</h2><p>Combustion vehicles show estimated tailpipe CO₂. EVs show zero tailpipe CO₂ and a separate charging electricity estimate using 0.716 kg CO₂/kWh, the dated CEA FY 2022–23 baseline. Manufacturing, upstream fuel production and charging losses are excluded.</p><p>Multi-stop strategies combine the selected road for each leg in your chosen stop order. Fleet-wide capacity assignment is available in the Dispatch workspace; service-time and charging-stop constraints remain future extensions.</p></article>
        {selectedRoute && fastestRoute && <RouteIntelligence route={selectedRoute} fastestRoute={fastestRoute} />}
      </section>
      <div hidden={activeView !== 'history'}><HistoryDashboard session={session} dashboard={dashboard} trips={trips} loading={historyLoading} onRefresh={() => loadCloudData(session)} onDelete={deleteTrip} /></div>
      <footer><div><span className="brand-mark small">G</span><b>GreenRoute</b></div><p>Indian road logistics · exact location routing · vehicle-aware carbon analytics</p></footer>
    </main>
  )
}
