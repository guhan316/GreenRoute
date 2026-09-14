export const DEFAULT_WEIGHTS = { time: 50, cost: 30, carbon: 20 }
export default function ObjectiveWeights({ value, onChange }) {
  const total = Object.values(value).reduce((sum, n) => sum + Number(n), 0)
  return <fieldset className="objective-weights"><legend>Balanced priorities</legend>
    <div className="weight-presets">{[['Time first', {time:70,cost:20,carbon:10}], ['Balanced', DEFAULT_WEIGHTS], ['Carbon first',{time:20,cost:20,carbon:60}]].map(([name, weights]) => <button type="button" key={name} onClick={() => onChange({...weights})}>{name}</button>)}</div>
    {Object.entries(value).map(([key, weight]) => <label key={key}><span>{key === 'carbon' ? 'CO₂' : key === 'time' ? 'Time' : 'Cost'} <b>{total ? Math.round(weight / total * 100) : 0}%</b></span><input type="range" min="0" max="100" step="5" aria-label={`${key} priority`} value={weight} onChange={event => onChange({...value, [key]:Number(event.target.value)})} /></label>)}
    <small>{total ? 'Relative priorities are normalized to 100%. Recalculate to apply.' : 'Set at least one priority above zero.'}</small>
  </fieldset>
}
