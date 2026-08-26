function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function HistoryDashboard({ session, dashboard, trips, loading, onRefresh, onDelete }) {
  if (!session) {
    return (
      <section className="history-section" id="history">
        <div className="section-heading"><div><span>TRIP MEMORY</span><h2>Sign in to build your sustainability record.</h2></div><p>Saved route decisions stay isolated to your account through Supabase Row Level Security.</p></div>
        <div className="history-empty glass-panel">Optimize routes freely now. Sign in when you want to save trip decisions and build the dashboard.</div>
      </section>
    )
  }

  const stats = [
    ['Trips saved', formatNumber(dashboard?.trip_count)],
    ['Distance', `${formatNumber(dashboard?.distance_km, 1)} km`],
    ['Fuel used', `${formatNumber(dashboard?.fuel_litres, 1)} L`],
    ['CO₂ tracked', `${formatNumber(dashboard?.co2_kg, 1)} kg`],
    ['CO₂ avoided', `${formatNumber(dashboard?.co2_saved_kg, 1)} kg`],
    ['Fuel cost saved', `₹${formatNumber(dashboard?.fuel_cost_saved)}`],
  ]

  return (
    <section className="history-section" id="history">
      <div className="section-heading">
        <div><span>SUSTAINABILITY DASHBOARD</span><h2>Your route choices become measurable evidence.</h2></div>
        <button type="button" className="secondary-btn" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh data'}</button>
      </div>

      <div className="dashboard-stats">
        {stats.map(([label, value]) => <div className="dashboard-stat glass-panel" key={label}><small>{label}</small><strong>{value}</strong></div>)}
      </div>

      <div className="strategy-strip glass-panel">
        <div><span>Fastest</span><b>{dashboard?.strategy_counts?.fastest || 0}</b></div>
        <div><span>Balanced</span><b>{dashboard?.strategy_counts?.balanced || 0}</b></div>
        <div><span>Greenest</span><b>{dashboard?.strategy_counts?.greenest || 0}</b></div>
        <div><span>Green route share</span><b>{formatNumber((dashboard?.green_route_share || 0) * 100, 0)}%</b></div>
      </div>

      <div className="history-list">
        {(trips || []).map((trip) => {
          const selected = (trip.route_candidates || []).find((candidate) => (candidate.recommended_as || []).includes(trip.selected_strategy))
          return (
            <article className="history-card glass-panel" key={trip.id}>
              <div className="history-card-head">
                <div><span>{trip.routing_mode === 'live' ? 'LIVE' : 'DEMO'} · {formatDate(trip.created_at)}</span><h3>{trip.origin_label} → {trip.destination_label}</h3></div>
                <button type="button" className="icon-btn danger" onClick={() => onDelete(trip.id)} aria-label="Delete saved trip">×</button>
              </div>
              <div className="history-metrics">
                <div><small>Strategy</small><b>{trip.selected_strategy || '—'}</b></div>
                <div><small>Distance</small><b>{selected ? `${formatNumber(selected.distance_km, 1)} km` : '—'}</b></div>
                <div><small>Fuel</small><b>{selected ? `${formatNumber(selected.fuel_litres, 1)} L` : '—'}</b></div>
                <div><small>CO₂</small><b>{selected ? `${formatNumber(selected.co2_kg, 1)} kg` : '—'}</b></div>
              </div>
            </article>
          )
        })}
        {!loading && !(trips || []).length && <div className="history-empty glass-panel">No trips saved yet. Optimize a route, choose a strategy, then press Save Trip.</div>}
      </div>
    </section>
  )
}
