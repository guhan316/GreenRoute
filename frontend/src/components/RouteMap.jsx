import { useEffect, useRef, useState } from 'react'
import { googleMapsConfigured, loadGoogleMaps } from '../lib/googleMaps.js'
import './RouteMap.css'

const ROUTE_COLORS = {
  fastest: '#4285f4',
  balanced: '#fbbc04',
  greenest: '#22c55e',
  alternative: '#8b9490',
}

function cleanCoordinates(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((point) => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
}

function strategyKindsFor(route) {
  if (Array.isArray(route.strategyKinds) && route.strategyKinds.length) return route.strategyKinds
  if (['fastest', 'balanced', 'greenest'].includes(route.kind)) return [route.kind]
  return []
}

function routeIsSelected(route, selectedKind) {
  return strategyKindsFor(route).includes(selectedKind)
}

function routeColor(route, selectedKind) {
  const strategies = strategyKindsFor(route)
  if (strategies.includes(selectedKind)) return ROUTE_COLORS[selectedKind]
  if (route.isAlternative || !strategies.length) return ROUTE_COLORS.alternative
  return ROUTE_COLORS[strategies[0]] || ROUTE_COLORS.alternative
}

function pointLiteral(place) {
  if (place?.lat == null || place?.lon == null) return null
  const lat = Number(place.lat)
  const lng = Number(place.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const trafficLayerRef = useRef(null)
  const geocoderRef = useRef(null)
  const markersRef = useRef([])
  const routePolylinesRef = useRef([])
  const previewPolylineRef = useRef(null)
  const clickListenerRef = useRef(null)
  const stateRef = useRef({ routes: [], selectedKind: 'balanced', origin: null, destination: null })
  const pickModeRef = useRef(null)
  const pickingRef = useRef(false)
  const onPickPlaceRef = useRef(onPickPlace)
  const onSelectKindRef = useRef(onSelectKind)
  const [pickMode, setPickMode] = useState(null)
  const [picking, setPicking] = useState(false)
  const [mapStatus, setMapStatus] = useState(googleMapsConfigured() ? 'loading' : 'unconfigured')
  const [mapError, setMapError] = useState('')

  stateRef.current = { routes: routes || [], selectedKind, origin, destination }
  pickModeRef.current = pickMode
  pickingRef.current = picking
  onPickPlaceRef.current = onPickPlace
  onSelectKindRef.current = onSelectKind

  function clearMarkers() {
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []
  }

  function clearRoutes() {
    routePolylinesRef.current.forEach((polyline) => {
      if (polyline.__greenrouteClick) google.maps.event.removeListener(polyline.__greenrouteClick)
      polyline.setMap(null)
    })
    routePolylinesRef.current = []
    if (previewPolylineRef.current) {
      previewPolylineRef.current.setMap(null)
      previewPolylineRef.current = null
    }
  }

  function syncMarkers(map) {
    clearMarkers()
    const markerSpecs = [
      { place: stateRef.current.origin, label: 'A', title: 'Pickup', fill: '#35df8a' },
      { place: stateRef.current.destination, label: 'B', title: 'Delivery', fill: '#ffbd55' },
    ]

    for (const spec of markerSpecs) {
      const position = pointLiteral(spec.place)
      if (!position) continue
      const marker = new google.maps.Marker({
        map,
        position,
        title: spec.place.address || spec.place.label || spec.title,
        label: {
          text: spec.label,
          color: '#07130e',
          fontWeight: '800',
          fontSize: '12px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 13,
          fillColor: spec.fill,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
        zIndex: 30,
      })
      markersRef.current.push(marker)
    }
  }

  function syncRoutes(map) {
    clearRoutes()
    const state = stateRef.current
    const routeEntries = (state.routes || [])
      .map((route) => ({
        route,
        path: cleanCoordinates(route.coordinates).map(([lng, lat]) => ({ lat, lng })),
      }))
      .filter(({ path }) => path.length > 1)

    const ordered = [
      ...routeEntries.filter(({ route }) => !routeIsSelected(route, state.selectedKind)),
      ...routeEntries.filter(({ route }) => routeIsSelected(route, state.selectedKind)),
    ]

    for (const { route, path } of ordered) {
      const selected = routeIsSelected(route, state.selectedKind)
      const alternative = route.isAlternative || strategyKindsFor(route).length === 0
      const polyline = new google.maps.Polyline({
        map,
        path,
        geodesic: false,
        strokeColor: routeColor(route, state.selectedKind),
        strokeOpacity: selected ? 1 : alternative ? 0.72 : 0.86,
        strokeWeight: selected ? 7 : alternative ? 5 : 5.5,
        zIndex: selected ? 20 : alternative ? 8 : 12,
        clickable: strategyKindsFor(route).length > 0,
      })

      const strategies = strategyKindsFor(route)
      if (strategies.length) {
        polyline.__greenrouteClick = polyline.addListener('click', () => {
          const targetKind = strategies.includes(state.selectedKind) ? state.selectedKind : strategies[0]
          onSelectKindRef.current?.(targetKind)
        })
      }
      routePolylinesRef.current.push(polyline)
    }

    if (!routeEntries.length) {
      const from = pointLiteral(state.origin)
      const to = pointLiteral(state.destination)
      if (from && to) {
        previewPolylineRef.current = new google.maps.Polyline({
          map,
          path: [from, to],
          strokeColor: '#35df8a',
          strokeOpacity: 0,
          strokeWeight: 3,
          icons: [{
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#35df8a',
              fillOpacity: 1,
              strokeOpacity: 0,
              scale: 2.5,
            },
            offset: '0',
            repeat: '14px',
          }],
          zIndex: 5,
        })
      }
    }
  }

  function fitToState(map) {
    const bounds = new google.maps.LatLngBounds()
    let count = 0

    for (const route of stateRef.current.routes || []) {
      for (const [lng, lat] of cleanCoordinates(route.coordinates)) {
        bounds.extend({ lat, lng })
        count += 1
      }
    }

    for (const place of [stateRef.current.origin, stateRef.current.destination]) {
      const point = pointLiteral(place)
      if (point) {
        bounds.extend(point)
        count += 1
      }
    }

    if (!count) return
    if (count === 1) {
      map.setCenter(bounds.getCenter())
      map.setZoom(15)
      return
    }
    map.fitBounds(bounds, { top: 90, right: 50, bottom: 80, left: 50 })
  }

  function syncAll({ fit = false } = {}) {
    const map = mapRef.current
    if (!map) return
    syncMarkers(map)
    syncRoutes(map)
    if (fit) fitToState(map)
  }

  useEffect(() => {
    if (!containerRef.current || !googleMapsConfigured()) return undefined
    let cancelled = false

    async function initialise() {
      try {
        await loadGoogleMaps()
        await google.maps.importLibrary('maps')
        if (cancelled || !containerRef.current) return

        const map = new google.maps.Map(containerRef.current, {
          center: { lat: 22.6, lng: 78.9629 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: true,
          clickableIcons: true,
          gestureHandling: 'greedy',
          backgroundColor: '#e8eaed',
        })
        mapRef.current = map

        trafficLayerRef.current = new google.maps.TrafficLayer()
        trafficLayerRef.current.setMap(map)
        geocoderRef.current = new google.maps.Geocoder()

        clickListenerRef.current = map.addListener('click', async (event) => {
          const activeMode = pickModeRef.current
          if (!activeMode || pickingRef.current || !event.latLng) return

          const lat = event.latLng.lat()
          const lon = event.latLng.lng()
          setPicking(true)
          pickingRef.current = true

          try {
            const { results } = await geocoderRef.current.geocode({ location: { lat, lng: lon } })
            const result = results?.[0]
            onPickPlaceRef.current?.(activeMode, {
              google_place_id: result?.place_id,
              label: result?.formatted_address || 'Pinned location',
              address: result?.formatted_address || `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
              lat,
              lon,
              result_type: 'Google map pin',
            })
          } catch {
            onPickPlaceRef.current?.(activeMode, {
              label: 'Pinned location',
              address: `${lat.toFixed(6)}, ${lon.toFixed(6)}`,
              lat,
              lon,
              result_type: 'Google map pin',
            })
          } finally {
            setPickMode(null)
            pickModeRef.current = null
            setPicking(false)
            pickingRef.current = false
          }
        })

        setMapStatus('ready')
        syncAll({ fit: true })
      } catch (error) {
        if (!cancelled) {
          setMapStatus('error')
          setMapError(error.message || 'Google Maps failed to load')
        }
      }
    }

    initialise()

    return () => {
      cancelled = true
      if (clickListenerRef.current && window.google?.maps) google.maps.event.removeListener(clickListenerRef.current)
      clickListenerRef.current = null
      clearRoutes()
      clearMarkers()
      if (trafficLayerRef.current) trafficLayerRef.current.setMap(null)
      trafficLayerRef.current = null
      geocoderRef.current = null
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (mapRef.current) syncAll({ fit: true })
  }, [routes, origin, destination])

  useEffect(() => {
    if (mapRef.current) syncRoutes(mapRef.current)
  }, [selectedKind])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setOptions({ draggableCursor: pickMode ? 'crosshair' : null })
  }, [pickMode])

  const hasPreview = !routes?.length
    && origin?.lat != null && origin?.lon != null
    && destination?.lat != null && destination?.lon != null
  const hasAlternativeRoads = (routes || []).some((route) => route.isAlternative)

  const togglePickMode = (mode) => {
    if (picking) return
    setPickMode((current) => current === mode ? null : mode)
  }

  const pinButtonLabel = (mode, idleLabel) => {
    if (picking && pickMode === mode) return 'Locating…'
    if (pickMode === mode) return 'Click map…'
    return idleLabel
  }

  return (
    <div className="route-map-shell google-route-map-shell" data-map-provider="google">
      <div ref={containerRef} className="route-map google-route-map" />

      {mapStatus === 'loading' && <div className="gr-google-map-state">Loading Google Maps + live traffic…</div>}
      {mapStatus === 'unconfigured' && (
        <div className="gr-google-map-state error">
          Add <b>VITE_GOOGLE_MAPS_API_KEY</b> to enable the Google Maps milestone.
        </div>
      )}
      {mapStatus === 'error' && <div className="gr-google-map-state error">{mapError}</div>}

      <div className="gr-google-traffic-chip"><i /> Google live traffic</div>

      <div className="gr-map-pin-controls" role="group" aria-label="Choose locations directly on the Google map">
        <button
          type="button"
          className={pickMode === 'origin' ? 'active' : ''}
          onClick={() => togglePickMode('origin')}
          aria-pressed={pickMode === 'origin'}
          disabled={picking && pickMode !== 'origin'}
        >
          <b>A</b> {pinButtonLabel('origin', 'Pin pickup')}
        </button>
        <button
          type="button"
          className={pickMode === 'destination' ? 'active' : ''}
          onClick={() => togglePickMode('destination')}
          aria-pressed={pickMode === 'destination'}
          disabled={picking && pickMode !== 'destination'}
        >
          <b>B</b> {pinButtonLabel('destination', 'Pin delivery')}
        </button>
      </div>

      {hasPreview && <div className="gr-map-preview-chip">A → B preview · Optimize for Google traffic-aware roads</div>}

      <div className="gr-map-legend">
        <span><i className="pickup-dot" />Pickup</span>
        <span><i className="drop-dot" />Delivery</span>
        {hasPreview && <span><i className="preview-line" />Point preview</span>}
        <span><i className="fastest-line" />Fastest</span>
        <span><i className="balanced-line" />Balanced</span>
        <span><i className="green-line" />Greenest</span>
        {hasAlternativeRoads && <span><i className="candidate-line" />Google alternative</span>}
      </div>
    </div>
  )
}
