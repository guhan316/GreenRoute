import { useEffect, useRef, useState } from 'react'
import { searchPlaces } from '../lib/api.js'

export default function LocationSearch({ label, text, selected, onTextChange, onSelect, placeholder }) {
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const query = text.trim()
    if (query.length < 3 || (selected && query === (selected.address || selected.label))) {
      setResults([])
      setOpen(false)
      return undefined
    }

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const data = await searchPlaces(query, 6)
        if (requestId.current === id) {
          setResults(data.results || [])
          setOpen(true)
        }
      } catch {
        if (requestId.current === id) setResults([])
      } finally {
        if (requestId.current === id) setBusy(false)
      }
    }, 320)

    return () => clearTimeout(timer)
  }, [text, selected])

  function choose(place) {
    onSelect(place)
    setOpen(false)
    setResults([])
  }

  return (
    <label className="location-field">
      <span>{label}</span>
      <div className={`location-input-wrap ${selected ? 'resolved' : ''}`}>
        <input
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          required
        />
        <i>{busy ? '…' : selected ? '✓' : '⌖'}</i>
      </div>
      {selected && <small className="resolved-place">Pinned at {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</small>}
      {open && results.length > 0 && (
        <div className="place-results">
          {results.map((place) => (
            <button key={`${place.tomtom_id || place.label}-${place.lat}-${place.lon}`} type="button" onClick={() => choose(place)}>
              <strong>{place.label}</strong>
              <span>{place.address}</span>
              <small>{place.result_type || 'Place'}{place.postal_code ? ` · ${place.postal_code}` : ''}</small>
            </button>
          ))}
        </div>
      )}
    </label>
  )
}
