const STRATEGY_COPY = {
  fastest: {
    eyebrow: 'TIME PRIORITY',
    fallbackReason: 'Lowest estimated journey time among the evaluated route candidates.',
    fallbackBestFor: 'Hospitals, medicines, emergencies and time-critical shipments',
  },
  balanced: {
    eyebrow: 'SMART COMPROMISE',
    fallbackReason: "Best combined time, fuel-cost and carbon result under GreenRoute's 40/30/30 weighting.",
    fallbackBestFor: 'Everyday logistics where time, cost and sustainability all matter',
  },
  greenest: {
    eyebrow: 'CARBON PRIORITY',
    fallbackReason: 'Lowest estimated carbon emissions, with fuel cost and journey time used as tie-breakers.',
    fallbackBestFor: 'Planned, bulk and sustainability-prioritised deliveries',
  },
}

function signedMoney(value) {
  const absolute = Math.abs(Math.round(value || 0)).toLocaleString('en-IN')
  if (value > 0) return `₹${absolute} saved`
  if (value < 0) return `₹${absolute} extra`
  return 'Baseline cost'
}

function signedCarbon(value) {
  const absolute = Math.abs(value || 0).toFixed(1)
  if (value > 0) return `${absolute} kg saved`
  if (value < 0) return `${absolute} kg extra`
  return 'Baseline CO₂'
}

function signedTime(value) {
  const rounded = Math.round(value || 0)
  if (rounded > 0) return `+${rounded} min`
  if (rounded < 0) return `${rounded} min`
  return 'Fastest ETA'
}

function Metric({ label, value, detail, tone = 'neutral' }) {
  return (
    <div className={`intel-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ScoreBar({ label, value, hint }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className="score-row">
      <div><span>{label}</span><small>{hint}</small></div>
      <div className="score-track"><i style={{ width: `${clamped}%` }} /></div>
      <b>{Math.round(clamped)}</b>
    </div>
  )
}

export default function RouteIntelligence({ route, fastestRoute }) {
  if (!route) return null

  const copy = STRATEGY_COPY[route.kind] || STRATEGY_COPY.balanced
  const tradeoff = route.tradeoff || {
    extra_minutes_vs_fastest: route.duration_minutes - (fastestRoute?.duration_minutes || route.duration_minutes),
    fuel_cost_saved_vs_fastest: (fastestRoute?.fuel_cost || route.fuel_cost) - route.fuel_cost,
    co2_saved_kg_vs_fastest: (fastestRoute?.co2_kg || route.co2_kg) - route.co2_kg,
    fuel_cost_saved_pct_vs_fastest: fastestRoute?.fuel_cost
      ? (((fastestRoute.fuel_cost - route.fuel_cost) / fastestRoute.fuel_cost) * 100)
      : 0,
    co2_saved_pct_vs_fastest: fastestRoute?.co2_kg
      ? (((fastestRoute.co2_kg - route.co2_kg) / fastestRoute.co2_kg) * 100)
      : 0,
  }

  const score = route.score_breakdown || {}
  const timeFit = score.time == null ? Math.max(20, 100 - Math.max(0, tradeoff.extra_minutes_vs_fastest) * 1.35) : 100 - (score.time * 100)
  const costFit = score.cost == null ? 65 + Math.max(0, tradeoff.fuel_cost_saved_pct_vs_fastest) : 100 - (score.cost * 100)
  const carbonFit = score.carbon == null ? 65 + Math.max(0, tradeoff.co2_saved_pct_vs_fastest) : 100 - (score.carbon * 100)

  return (
    <section className={`route-intelligence ${route.kind}`} aria-live="polite">
      <div className="intel-copy">
        <span className="intel-eyebrow">{copy.eyebrow}</span>
        <h3>Why {route.label} wins this comparison</h3>
        <p>{route.reason || copy.fallbackReason}</p>
        <div className="best-for"><span>Best for</span><b>{route.best_for || copy.fallbackBestFor}</b></div>
      </div>

      <div className="intel-metrics">
        <Metric
          label="Time trade-off"
          value={signedTime(tradeoff.extra_minutes_vs_fastest)}
          detail="vs Fastest"
          tone={tradeoff.extra_minutes_vs_fastest > 0 ? 'amber' : 'blue'}
        />
        <Metric
          label="Fuel economics"
          value={signedMoney(tradeoff.fuel_cost_saved_vs_fastest)}
          detail={`${Math.max(0, tradeoff.fuel_cost_saved_pct_vs_fastest || 0).toFixed(1)}% vs Fastest`}
          tone="amber"
        />
        <Metric
          label="Carbon impact"
          value={signedCarbon(tradeoff.co2_saved_kg_vs_fastest)}
          detail={`${Math.max(0, tradeoff.co2_saved_pct_vs_fastest || 0).toFixed(1)}% vs Fastest`}
          tone="green"
        />
      </div>

      <div className="decision-profile">
        <div className="decision-title"><span>Decision profile</span><small>100 = strongest relative fit</small></div>
        <ScoreBar label="Speed" value={timeFit} hint="traffic-adjusted ETA" />
        <ScoreBar label="Affordability" value={costFit} hint="estimated fuel cost" />
        <ScoreBar label="Sustainability" value={carbonFit} hint="estimated CO₂" />
      </div>
    </section>
  )
}
