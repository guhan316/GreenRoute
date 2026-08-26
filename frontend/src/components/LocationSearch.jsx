import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../lib/api.js'

export default function LocationSearch({ label, text, selected, onTextChange, onSelect, placeholder }) {
  const inputId = useId()
  const listId = `${inputId}-results`
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searched, setSearched] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const requestId = useRef(0)

  const query = text.trim()
  const unresolved = query.length >= 3 && !selected

  useEffect(() => {
    if (query.length < 3 || (selected && query === (selected.address || selected.label))) {
      setResults([])
      setOpen(false)
      setActiveIndex(0)
      setSearched(false)
      setSearchFailed(false)
      return undefined
    }

    const id = ++requestId.current
    setSearched(false)
    setSearchFailed(false)

    const timer = setTimeout(async () => {
      setBusy(true)
      try {
        const data = await searchPlaces(query, 6)
        if (requestId.current === id) {
          const nextResults = data.results || []
          setResults(nextResults)
          setActiveIndex(0)
          setOpen(nextResults.length > 0)
          setSearched(true)
        }
      } catch {
        if (requestId.current === id) {
          setResults([])
          setOpen(false)
          setSearched(true)
          setSearchFailed(true)
        }
      } finally {
        if (requestId.current === id) setBusy(false)
      }
    }, 320)

    return () => clearTimeout(timer)
  }, [query, selected])

  function choose(place) {
    onSelect(place)
    setOpen(false)
    setResults([])
    setActiveIndex(0)
    setSearched(false)
    setSearchFailed(false)
  }

  function handleKeyDown(event) {
    if (!results.length) {
      if (event.key === 'Escape') setOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => (current + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => (current - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && unresolved) {
      event.preventDefault()
      choose(results[activeIndex] || results[0])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="location-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={`location-input-wrap ${selected ? 'resolved' : unresolved ? 'unresolved' : ''}`}>
        <input
          id={inputId}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          required
        />
        <i>{busy ? '…' : selected ? '✓' : unresolved ? '!' : '⌖'}</i>
      </div>

      {selected && (
        <small className="resolved-place">✓ Exact place pinned at {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</small>
      )}
      {!selected && busy && <small className="location-help">Searching TomTom places…</small>}
      {!selected && !busy && unresolved && results.length > 0 && (
        <small className="location-help unresolved-help">Choose a result below — or press Enter to use the highlighted match.</small>
      )}
      {!selected && !busy && unresolved && searched && !results.length && !searchFailed && (
        <small className="location-help unresolved-help">No matching place found yet. Add locality, district or pincode and try again.</small>
      )}
      {!selected && !busy && unresolved && searchFailed && (
        <small className="location-help unresolved-help">Place search could not load. Try the search again.</small>
      )}

      {open && results.length > 0 && (
        <div className="place-results" id={listId} role="listbox">
          {results.map((place, index) => (
            <button
              key={`${place.tomtom_id || place.label}-${place.lat}-${place.lon}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(place)}
            >
              <strong>{place.label}</strong>
              <span>{place.address}</span>
              <small>{place.result_type || 'Place'}{place.postal_code ? ` · ${place.postal_code}` : ''}{index === activeIndex ? ' · Press Enter' : ''}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
