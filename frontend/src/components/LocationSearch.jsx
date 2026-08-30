import { useEffect, useId, useRef, useState } from 'react'
import { googleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps.js'
import './LocationSearch.css'

function latValue(location) {
  return typeof location?.lat === 'function' ? location.lat() : Number(location?.lat)
}

function lngValue(location) {
  return typeof location?.lng === 'function' ? location.lng() : Number(location?.lng)
}

export default function LocationSearch({ label, text, selected, onTextChange, onSelect, placeholder }) {
  const inputId = useId()
  const hostRef = useRef(null)
  const elementRef = useRef(null)
  const textRef = useRef(text)
  const onTextChangeRef = useRef(onTextChange)
  const onSelectRef = useRef(onSelect)
  const [status, setStatus] = useState(googleMapsConfigured() ? 'loading' : 'unconfigured')
  const [error, setError] = useState('')

  textRef.current = text
  onTextChangeRef.current = onTextChange
  onSelectRef.current = onSelect

  useEffect(() => {
    let cancelled = false
    let autocomplete = null

    async function mountAutocomplete() {
      if (!googleMapsConfigured()) return

      try {
        await loadGoogleMaps()
        const { PlaceAutocompleteElement } = await google.maps.importLibrary('places')
        if (cancelled || !hostRef.current) return

        autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ['in'],
          placeholder,
          requestedLanguage: 'en',
          requestedRegion: 'in',
          value: textRef.current || '',
        })
        autocomplete.id = inputId
        autocomplete.className = 'gr-google-place-autocomplete'
        autocomplete.setAttribute('aria-label', label)

        const handleInput = () => {
          const value = autocomplete.value || ''
          if (value !== textRef.current) onTextChangeRef.current?.(value)
        }

        const handleSelection = async ({ placePrediction }) => {
          try {
            const place = placePrediction.toPlace()
            await place.fetchFields({
              fields: ['id', 'displayName', 'formattedAddress', 'location'],
            })
            const lat = latValue(place.location)
            const lon = lngValue(place.location)
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
              throw new Error('Google Places did not return coordinates')
            }

            const address = place.formattedAddress || place.displayName || autocomplete.value
            autocomplete.value = address || ''
            onSelectRef.current?.({
              google_place_id: place.id,
              label: place.displayName || address || 'Selected place',
              address: address || place.displayName || 'Selected place',
              lat,
              lon,
              result_type: 'Google Place',
            })
            setError('')
          } catch (selectionError) {
            setError(selectionError.message || 'Unable to read this Google place')
          }
        }

        autocomplete.addEventListener('input', handleInput)
        autocomplete.addEventListener('gmp-select', handleSelection)
        hostRef.current.replaceChildren(autocomplete)
        elementRef.current = autocomplete
        setStatus('ready')

        autocomplete.__greenrouteCleanup = () => {
          autocomplete.removeEventListener('input', handleInput)
          autocomplete.removeEventListener('gmp-select', handleSelection)
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus('error')
          setError(loadError.message || 'Google Places failed to load')
        }
      }
    }

    mountAutocomplete()

    return () => {
      cancelled = true
      if (elementRef.current?.__greenrouteCleanup) elementRef.current.__greenrouteCleanup()
      elementRef.current = null
      if (hostRef.current) hostRef.current.replaceChildren()
    }
  }, [inputId, label, placeholder])

  useEffect(() => {
    const autocomplete = elementRef.current
    if (!autocomplete) return
    if ((autocomplete.value || '') !== (text || '')) autocomplete.value = text || ''
  }, [text])

  return (
    <div className="location-field google-location-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={`google-autocomplete-shell ${selected ? 'resolved' : ''}`} ref={hostRef}>
        {status === 'loading' && <div className="google-place-loading">Loading Google Places…</div>}
        {status === 'unconfigured' && (
          <div className="google-place-error">
            Add <b>VITE_GOOGLE_MAPS_API_KEY</b> to enable Google place search.
          </div>
        )}
        {status === 'error' && <div className="google-place-error">{error}</div>}
      </div>

      {selected && (
        <small className="resolved-place">
          ✓ Google place pinned at {Number(selected.lat).toFixed(5)}, {Number(selected.lon).toFixed(5)}
        </small>
      )}
      {!selected && status === 'ready' && (
        <small className="location-help">Search Google for an address, business, landmark, road or pincode.</small>
      )}
      {error && status === 'ready' && <small className="google-place-inline-error">{error}</small>}
    </div>
  )
}
