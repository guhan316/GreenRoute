import { useEffect, useMemo, useState } from 'react'
import LocationSearch from './LocationSearch.jsx'
import { optimizeDispatch } from '../lib/api.js'

const newOrder = (index) => ({
  order_id: `ORD-${String(index + 1).padStart(3, '0')}`,
  customer: '',
  place_text: '',
  place: null,
  weight_kg: '',
  priority: 3,
  deadline: '',
  cargo_type: 'general',
  status: 'pending',
})

const newVehicle = (index) => ({
  vehicle_id: `VEH-${String(index + 1).padStart(2, '0')}`,
  label: '',
  driver: '',
  capacity_kg: '',
  available: true,
})

function loadStored(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key))
    return Array.isArray(value) && value.length ? value : fallback
  } catch {
    return fallback
  }
}

export default function DispatchPlanner({ hidden = false }) {
  const [depotText, setDepotText] = useState('')
  const [depot, setDepot] = useState(null)
  const [orders, setOrders] = useState(() => loadStored('greenroute-orders', [newOrder(0), newOrder(1), newOrder(2)]))
  const [vehicles, setVehicles] = useState(() => loadStored('greenroute-fleet', [newVehicle(0), newVehicle(1)]))
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Create delivery orders and available fleet vehicles, then let OR-Tools assign them.')

  useEffect(() => { localStorage.setItem('greenroute-orders', JSON.stringify(orders)) }, [orders])
  useEffect(() => { localStorage.setItem('greenroute-fleet', JSON.stringify(vehicles)) }, [vehicles])

  const readyOrders = useMemo(() => orders.filter(order => order.place && Number(order.weight_kg) > 0 && order.customer.trim()), [orders])
  const readyVehicles = useMemo(() => vehicles.filter(vehicle => vehicle.available && Number(vehicle.capacity_kg) > 0 && vehicle.label.trim()), [vehicles])
  const demand = readyOrders.reduce((sum, order) => sum + Number(order.weight_kg || 0), 0)
  const capacity = readyVehicles.reduce((sum, vehicle) => sum + Number(vehicle.capacity_kg || 0), 0)

  const patchOrder = (index, patch) => setOrders(current => current.map((order, i) => i === index ? { ...order, ...patch } : order))
  const patchVehicle = (index, patch) => setVehicles(current => current.map((vehicle, i) => i === index ? { ...vehicle, ...patch } : vehicle))

  async function runDispatch(event) {
    event.preventDefault()
    if (!depot) { setMessage('Select the depot from search results first.'); return }
    if (!readyOrders.length) { setMessage('Add at least one complete order with a confirmed destination.'); return }
    if (!readyVehicles.length) { setMessage('Add at least one available fleet vehicle with capacity.'); return }
    if (demand > capacity) { setMessage(`Fleet capacity is short by ${Math.round(demand - capacity).toLocaleString('en-IN')} kg.`); return }

    setBusy(true)
    setMessage('OR-Tools is assigning orders to vehicles and optimizing visit order…')
    try {
      const data = await optimizeDispatch({
        depot,
        orders: readyOrders.map(({ place_text, ...order }) => ({
          ...order,
          weight_kg: Number(order.weight_kg),
          priority: Number(order.priority),
          deadline: order.deadline || null,
        })),
        vehicles: readyVehicles.map(vehicle => ({
          ...vehicle,
          capacity_kg: Number(vehicle.capacity_kg),
        })),
      })
      setResult(data)
      setMessage(`${data.assigned_order_count} orders assigned across ${data.assignments.filter(item => item.order_count).length} active routes · ${data.total_distance_km_estimate} km estimated dispatch distance.`)
    } catch (error) {
      setResult(null)
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (hidden) return null

  return <section className="dispatch-page" id="dispatch">
    <div className="dispatch-summary">
      <div><span>ORDERS</span><strong>{readyOrders.length}</strong><small>{Math.round(demand).toLocaleString('en-IN')} kg ready</small></div>
      <div><span>AVAILABLE FLEET</span><strong>{readyVehicles.length}</strong><small>{Math.round(capacity).toLocaleString('en-IN')} kg capacity</small></div>
      <div><span>CAPACITY HEADROOM</span><strong>{Math.round(capacity - demand).toLocaleString('en-IN')}</strong><small>kg after assignment</small></div>
    </div>

    <form onSubmit={runDispatch}>
      <div className="dispatch-grid">
        <section className="dispatch-panel">
          <div className="dispatch-panel-head"><div><span>01</span><h2>Orders</h2></div><button type="button" onClick={() => setOrders(current => [...current, newOrder(current.length)])}>+ Add order</button></div>
          <LocationSearch label="Dispatch depot" text={depotText} selected={depot} onTextChange={value => { setDepotText(value); setDepot(null); setResult(null) }} onSelect={place => { setDepot(place); setDepotText(place.address || place.label); setResult(null) }} placeholder="Search warehouse or depot…" />
          <div className="dispatch-list">
            {orders.map((order, index) => <article className="order-row" key={order.order_id + index}>
              <div className="row-title"><strong>{order.order_id}</strong><select value={order.status} onChange={e => patchOrder(index, { status: e.target.value })}><option value="pending">Pending</option><option value="assigned">Assigned</option><option value="in_transit">In transit</option><option value="delivered">Delivered</option></select></div>
              <div className="two-col">
                <label>Order ID<input value={order.order_id} onChange={e => patchOrder(index, { order_id: e.target.value })} /></label>
                <label>Customer<input value={order.customer} onChange={e => patchOrder(index, { customer: e.target.value })} placeholder="Customer / hospital / store" /></label>
              </div>
              <LocationSearch label="Delivery destination" text={order.place_text} selected={order.place} onTextChange={value => patchOrder(index, { place_text: value, place: null })} onSelect={place => patchOrder(index, { place, place_text: place.address || place.label })} placeholder="Search delivery point…" />
              <div className="three-col">
                <label>Weight (kg)<input type="number" min="1" value={order.weight_kg} onChange={e => patchOrder(index, { weight_kg: e.target.value })} /></label>
                <label>Priority<select value={order.priority} onChange={e => patchOrder(index, { priority: Number(e.target.value) })}><option value="5">5 · Critical</option><option value="4">4 · High</option><option value="3">3 · Normal</option><option value="2">2 · Low</option><option value="1">1 · Flexible</option></select></label>
                <label>Cargo<select value={order.cargo_type} onChange={e => patchOrder(index, { cargo_type: e.target.value })}><option value="general">General</option><option value="medical">Medical</option><option value="refrigerated">Refrigerated</option><option value="fragile">Fragile</option><option value="bulk">Bulk</option></select></label>
              </div>
              <label>Deadline<input type="datetime-local" value={order.deadline} onChange={e => patchOrder(index, { deadline: e.target.value })} /></label>
              {orders.length > 1 && <button className="remove-row" type="button" onClick={() => setOrders(current => current.filter((_, i) => i !== index))}>Remove order</button>}
            </article>)}
          </div>
        </section>

        <section className="dispatch-panel">
          <div className="dispatch-panel-head"><div><span>02</span><h2>Fleet</h2></div><button type="button" onClick={() => setVehicles(current => [...current, newVehicle(current.length)])}>+ Add vehicle</button></div>
          <p className="dispatch-help">Only vehicles marked available are sent to the solver.</p>
          <div className="dispatch-list">
            {vehicles.map((vehicle, index) => <article className="fleet-row" key={vehicle.vehicle_id + index}>
              <div className="row-title"><strong>{vehicle.vehicle_id}</strong><label className="availability"><input type="checkbox" checked={vehicle.available} onChange={e => patchVehicle(index, { available: e.target.checked })} /> Available</label></div>
              <div className="two-col">
                <label>Vehicle ID<input value={vehicle.vehicle_id} onChange={e => patchVehicle(index, { vehicle_id: e.target.value })} /></label>
                <label>Vehicle / model<input value={vehicle.label} onChange={e => patchVehicle(index, { label: e.target.value })} placeholder="e.g. Tata Intra V30" /></label>
              </div>
              <div className="two-col">
                <label>Driver<input value={vehicle.driver} onChange={e => patchVehicle(index, { driver: e.target.value })} placeholder="Driver name" /></label>
                <label>Payload capacity (kg)<input type="number" min="1" value={vehicle.capacity_kg} onChange={e => patchVehicle(index, { capacity_kg: e.target.value })} /></label>
              </div>
              {vehicles.length > 1 && <button className="remove-row" type="button" onClick={() => setVehicles(current => current.filter((_, i) => i !== index))}>Remove vehicle</button>}
            </article>)}
          </div>
        </section>
      </div>

      <div className="dispatch-action">
        <div><strong>Fleet dispatch optimization</strong><p>{message}</p><small>Assignment uses OR-Tools CVRP with capacity constraints. Distance is a road-factor proxy for allocation; GreenRoute road providers remain the source for final road geometry.</small></div>
        <button className="optimize-btn" disabled={busy || !depot || !readyOrders.length || !readyVehicles.length || demand > capacity} type="submit">{busy ? 'Optimizing fleet…' : 'Optimize fleet dispatch'} →</button>
      </div>
    </form>

    {result && <section className="dispatch-results">
      <div className="dispatch-result-head"><div><span>OR-TOOLS DISPATCH PLAN</span><h2>{result.assigned_order_count} orders · {result.total_distance_km_estimate} km estimated</h2></div><div><b>{result.fleet_utilization_pct}%</b><small>fleet utilisation</small></div></div>
      <div className="assignment-grid">
        {result.assignments.map(assignment => <article key={assignment.vehicle_id} className={assignment.order_count ? 'assignment-card active' : 'assignment-card'}>
          <div className="assignment-title"><div><span>{assignment.vehicle_id}</span><strong>{assignment.vehicle_label}</strong><small>{assignment.driver || 'Driver not assigned'}</small></div><b>{assignment.utilization_pct}%</b></div>
          <div className="assignment-metrics"><span><small>LOAD</small><b>{Math.round(assignment.load_kg).toLocaleString('en-IN')} / {Math.round(assignment.capacity_kg).toLocaleString('en-IN')} kg</b></span><span><small>ORDERS</small><b>{assignment.order_count}</b></span><span><small>DISTANCE</small><b>{assignment.distance_km_estimate} km</b></span></div>
          {assignment.order_count ? <ol>{assignment.orders.map(order => <li key={order.order_id}><div><strong>{order.order_id} · {order.customer}</strong><small>{order.place.label} · {order.weight_kg} kg · P{order.priority}{order.deadline ? ` · due ${order.deadline.replace('T',' ')}` : ''}</small></div></li>)}</ol> : <p className="unused-vehicle">No orders assigned — retained as spare capacity.</p>}
        </article>)}
      </div>
    </section>}
  </section>
}
