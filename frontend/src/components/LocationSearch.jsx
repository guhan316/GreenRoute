import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../lib/api.js'

export default function LocationSearch({ label, text, selected, onTextChange, onSelect, placeholder }) {
  const inputId = useId()
  const listId = `${inputId}-results`
  const fieldRef = useRef(null)
  const requestId = useRef(0)
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searched, setSearched] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)

  const query = text.trim()
  const canSearch = query.length >= 2 && !selected
  const unresolved = query.length >= 2 && !selected

  useEffect(() => {
    function handleOutsidePointer(event) {
      if (fieldRef.current && !fieldRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [])

  useEffect(() => {
    if (!canSearch) {
      setResults([])
      setOpen(false)
      setActiveIndex(0)
      setSearched(false)
      setSearchFailed(false)
      setBusy(false)
      return undefined
    }

    const id = ++requestId.current
    setOpen(true)
    setBusy(true)
    setSearched(false)
    setSearchFailed(false)

    const timer = setTimeout(async () => {
      try {
        const data = await searchPlaces(query, 7)
        if (requestId.current === id) {
          const nextResults = data.results || []
          setResults(nextResults)
          setActiveIndex(0)
          setSearched(true)
        }
      } catch {
        if (requestId.current === id) {
          setResults([])
          setSearched(true)
          setSearchFailed(true)
        }
      } finally {
        if (requestId.current === id) setBusy(false)
      }
    }, 260)

    return () => clearTimeout(timer)
  }, [canSearch, query])

  function choose(place) {
    onSelect(place)
    setOpen(false)
    setResults([])
    setActiveIndex(0)
    setSearched(false)
    setSearchFailed(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      return
    }

    if (!results.length) return

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
    }
  }

  const panelVisible = open && canSearch

  return (
    <div className="location-field" ref={fieldRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`location-input-wrap ${selected ? 'resolved' : unresolved ? 'unresolved' : ''}`}>
        <input
          id={inputId}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onFocus={() => { if (canSearch) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          required
        />
        <i>{busy ? '…' : selected ? '✓' : unresolved ? '⌖' : '⌖'}</i>
      </div>

      {selected && (
        <small className="resolved-place">✓ Exact place pinned at {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</small>
      )}
      {!selected && query.length === 1 && (
        <small className="location-help">Type one more character to search exact places.</small>
      )}

      {panelVisible && (
        <div className="place-results autocomplete-panel" id={listId} role="listbox">
          {busy && (
            <div className="autocomplete-state" role="status">
              <span className="autocomplete-spinner" aria-hidden="true" />
              <div><strong>Searching places…</strong><small>Finding addresses, landmarks and POIs in India</small></div>
            </div>
          )}

          {!busy && results.map((place, index) => (
            <button
              id={`${listId}-${index}`}
              key={`${place.tomtom_id || place.label}-${place.lat}-${place.lon}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? 'active' : ''}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(place)}
            >
              <span className="place-result-icon" aria-hidden="true">⌖</span>
              <span className="place-result-copy">
                <strong>{place.label}</strong>
                <span>{place.address}</span>
                <small>{place.result_type || 'Place'}{place.postal_code ? ` · ${place.postal_code}` : ''}</small>
              </span>
              {index === activeIndex && <span className="place-result-enter" aria-hidden="true">↵</span>}
            </button>
          ))}

          {!busy && searched && !results.length && !searchFailed && (
            <div className="autocomplete-state">
              <span className="autocomplete-state-icon" aria-hidden="true">⌕</span>
              <div><strong>No matching place yet</strong><small>Add locality, district, landmark or pincode.</small></div>
            </div>
          )}

          {!busy && searchFailed && (
            <div className="autocomplete-state error-state">
              <span className="autocomplete-state-icon" aria-hidden="true">!</span>
              <div><strong>Place search unavailable</strong><small>GreenRoute could not reach the place-search service. Edit the query to retry.</small></div>
            </div>
          )}

          <div className="autocomplete-footer"><span>Search suggestions</span><b>TomTom</b></div>
        </div>
      )}
    </div>
  )
}
