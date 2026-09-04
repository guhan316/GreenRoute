import { useEffect, useRef, useState } from 'react'
import { reverseGeocode } from '../lib/api.js'
import './RouteMap.css'

const ROUTE_COLORS = {
  fastest: '#3f8cff',
  balanced: '#f3ad3d',
  greenest: '#16c978',
  alternative: '#77857f',
}

function cleanCoordinates(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((point) => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
}

function simplifyCoordinates(points, target = 1600) {
  if (points.length <= target) return points
  const stride = Math.ceil(points.length / target)
  const sampled = points.filter((_point, index) => index % stride === 0)
  if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1])
  return sampled
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

function toLeafletPoints(coordinates) {
  return simplifyCoordinates(cleanCoordinates(coordinates)).map(([lon, lat]) => [lat, lon])
}

function endpointLatLng(place) {
  if (place?.lat == null || place?.lon == null) return null
  const lat = Number(place.lat)
  const lon = Number(place.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return [lat, lon]
}

function safePopup(kind, place, fallback) {
  const wrapper = document.createElement('div')
  const title = document.createElement('strong')
  const detail = document.createElement('span')
  title.textContent = kind === 'origin' ? 'Pickup' : 'Delivery'
  detail.textContent = place?.address || place?.label || fallback
  wrapper.append(title, document.createElement('br'), detail)
  return wrapper
}

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markerLayerRef = useRef(null)
  const readyRef = useRef(false)
  const stateRef = useRef({ routes: [], selectedKind: 'balanced', origin: null, destination: null })
  const pickModeRef = useRef(null)
  const pickingRef = useRef(false)
  const onPickPlaceRef = useRef(onPickPlace)
  const onSelectKindRef = useRef(onSelectKind)
  const fitSignatureRef = useRef('')
  const [pickMode, setPickMode] = useState(null)
  const [picking, setPicking] = useState(false)
  const [mapError, setMapError] = useState('')

  stateRef.current = { routes: routes || [], selectedKind, origin, destination }
  pickModeRef.current = pickMode
  pickingRef.current = picking
  onPickPlaceRef.current = onPickPlace
  onSelectKindRef.current = onSelectKind

  function markerIcon(kind) {
    const L = window.L
    return L.divIcon({
      className: 'leaflet-greenroute-marker-wrap',
      html: `<div class="route-endpoint-marker ${kind}"><span>${kind === 'origin' ? 'A' : 'B'}</span></div>`,
      iconSize: [34, 42],
      iconAnchor: [17, 42],
      popupAnchor: [0, -42],
    })
  }

  function renderMarkers() {
    const L = window.L
    const layer = markerLayerRef.current
    if (!L || !layer) return
    layer.clearLayers()

    const add = (place, kind, fallback) => {
      const latLng = endpointLatLng(place)
      if (!latLng) return
      L.marker(latLng, { icon: markerIcon(kind), keyboard: true, riseOnHover: true })
        .bindPopup(safePopup(kind, place, fallback))
        .addTo(layer)
    }

    add(stateRef.current.origin, 'origin', 'Pickup')
    add(stateRef.current.destination, 'destination', 'Delivery')
  }

  function renderRoutes() {
    const L = window.L
    const layer = routeLayerRef.current
    if (!L || !layer) return
    layer.clearLayers()

    const entries = (stateRef.current.routes || [])
      .map((route) => ({ route, points: toLeafletPoints(route.coordinates) }))
      .filter(({ points }) => points.length > 1)

    const ordered = [
      ...entries.filter(({ route }) => !routeIsSelected(route, stateRef.current.selectedKind)),
      ...entries.filter(({ route }) => routeIsSelected(route, stateRef.current.selectedKind)),
    ]

    if (!ordered.length) {
      const a = endpointLatLng(stateRef.current.origin)
      const b = endpointLatLng(stateRef.current.destination)
      if (a && b) {
        L.polyline([a, b], {
          color: '#092017',
          weight: 8,
          opacity: 0.68,
          interactive: false,
        }).addTo(layer)
        L.polyline([a, b], {
          color: '#20d982',
          weight: 4,
          opacity: 1,
          dashArray: '10 9',
          interactive: false,
        }).addTo(layer)
      }
      return
    }

    for (const { route, points } of ordered) {
      const selected = routeIsSelected(route, stateRef.current.selectedKind)
      const alternative = Boolean(route.isAlternative || !strategyKindsFor(route).length)

      L.polyline(points, {
        color: selected ? '#ffffff' : alternative ? '#26312d' : '#18231f',
        weight: selected ? 11 : alternative ? 7 : 8,
        opacity: selected ? 0.96 : alternative ? 0.58 : 0.76,
        interactive: false,
      }).addTo(layer)

      const routeLine = L.polyline(points, {
        color: routeColor(route, stateRef.current.selectedKind),
        weight: selected ? 7 : alternative ? 4 : 4.5,
        opacity: selected ? 1 : alternative ? 0.7 : 0.86,
        bubblingMouseEvents: false,
      }).addTo(layer)

      const strategies = strategyKindsFor(route)
      if (strategies.length) {
        routeLine.on('click', (event) => {
          L.DomEvent.stopPropagation(event)
          if (pickModeRef.current) return
          const targetKind = strategies.includes(stateRef.current.selectedKind)
            ? stateRef.current.selectedKind
            : strategies[0]
          onSelectKindRef.current?.(targetKind)
        })
        routeLine.on('mouseover', () => {
          if (!pickModeRef.current && mapRef.current) mapRef.current.getContainer().style.cursor = 'pointer'
        })
        routeLine.on('mouseout', () => {
          if (mapRef.current) mapRef.current.getContainer().style.cursor = pickModeRef.current ? 'crosshair' : ''
        })
      }
    }
  }

  function fitToState(force = false) {
    const L = window.L
    const map = mapRef.current
    if (!L || !map || !readyRef.current) return

    const routePoints = (stateRef.current.routes || []).flatMap((route) => toLeafletPoints(route.coordinates))
    const endpoints = [endpointLatLng(stateRef.current.origin), endpointLatLng(stateRef.current.destination)].filter(Boolean)
    const allPoints = [...routePoints, ...endpoints]
    if (!allPoints.length) return

    const signature = `${allPoints[0].join(',')}|${allPoints[allPoints.length - 1].join(',')}|${routePoints.length}`
    if (!force && fitSignatureRef.current === signature) return
    fitSignatureRef.current = signature

    if (allPoints.length === 1) {
      map.setView(allPoints[0], 14, { animate: true })
      return
    }

    map.fitBounds(L.latLngBounds(allPoints), {
      paddingTopLeft: [64, 110],
      paddingBottomRight: [64, 94],
      maxZoom: 12,
      animate: true,
      duration: 0.65,
    })
  }

  function syncAll({ refit = false } = {}) {
    if (!readyRef.current) return
    // These are deliberately independent. A route rendering problem must never
    // prevent pickup/delivery markers or camera fitting from working.
    try { renderRoutes() } catch (error) { console.error('GreenRoute Leaflet route render failed', error) }
    try { renderMarkers() } catch (error) { console.error('GreenRoute Leaflet marker render failed', error) }
    try { fitToState(refit) } catch (error) { console.error('GreenRoute Leaflet fitBounds failed', error) }
  }

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined
    const L = window.L
    if (!L) {
      setMapError('Leaflet could not be loaded. Check the connection and refresh the page.')
      return undefined
    }

    let map
    try {
      map = L.map(containerRef.current, {
        center: [22.6, 78.9629],
        zoom: 5,
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)
      L.control.zoom({ position: 'topright' }).addTo(map)
      L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 110 }).addTo(map)
      routeLayerRef.current = L.layerGroup().addTo(map)
      markerLayerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      setMapError('')
    } catch (error) {
      console.error('GreenRoute Leaflet startup failed', error)
      setMapError('The interactive Leaflet map could not start. Route calculations are still available.')
      return undefined
    }

    const handleMapClick = async (event) => {
      const activePickMode = pickModeRef.current
      if (!activePickMode || pickingRef.current) return
      setPicking(true)
      pickingRef.current = true
      try {
        const place = await reverseGeocode(event.latlng.lat, event.latlng.lng)
        onPickPlaceRef.current?.(activePickMode, place)
      } catch {
        onPickPlaceRef.current?.(activePickMode, {
          label: 'Pinned location',
          address: `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`,
          lat: event.latlng.lat,
          lon: event.latlng.lng,
          result_type: 'Map pin',
        })
      } finally {
        setPickMode(null)
        pickModeRef.current = null
        setPicking(false)
        pickingRef.current = false
      }
    }

    map.on('click', handleMapClick)
    readyRef.current = true
    requestAnimationFrame(() => {
      map.invalidateSize()
      syncAll({ refit: true })
    })

    const observer = new ResizeObserver(() => map.invalidateSize(false))
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      map.off('click', handleMapClick)
      readyRef.current = false
      routeLayerRef.current = null
      markerLayerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => { syncAll({ refit: true }) }, [routes, origin, destination])
  useEffect(() => { syncAll() }, [selectedKind])
  useEffect(() => {
    const container = mapRef.current?.getContainer()
    if (container) container.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  const hasPreview = !routes?.length && origin?.lat != null && origin?.lon != null && destination?.lat != null && destination?.lon != null
  const hasAlternativeRoads = (routes || []).some((route) => route.isAlternative)

  const togglePickMode = (mode) => {
    if (picking || mapError) return
    setPickMode((current) => current === mode ? null : mode)
  }

  const pinButtonLabel = (mode, idleLabel) => {
    if (picking && pickMode === mode) return 'Locating…'
    if (pickMode === mode) return 'Click map…'
    return idleLabel
  }

  return (
    <div className="route-map-shell" data-map-engine="leaflet">
      <div ref={containerRef} className={`route-map leaflet-route-map ${mapError ? 'is-unavailable' : ''}`} />

      {mapError && (
        <div className="map-fallback" role="status">
          <span className="map-fallback-icon">◎</span>
          <strong>Interactive map unavailable</strong>
          <p>{mapError}</p>
          <small>You can continue using typed pickup and delivery locations.</small>
        </div>
      )}

      {!mapError && (
        <div className="gr-map-pin-controls" role="group" aria-label="Choose locations directly on the map">
          <button
            type="button"
            className={pickMode === 'origin' ? 'active' : ''}
            onClick={() => togglePickMode('origin')}
            aria-pressed={pickMode === 'origin'}
            disabled={picking && pickMode !== 'origin'}
            title={pickMode === 'origin' ? 'Click anywhere on the map to set pickup. Click this button again to cancel.' : 'Set pickup directly on the map'}
          >
            <b>A</b> {pinButtonLabel('origin', 'Pin pickup')}
          </button>
          <button
            type="button"
            className={pickMode === 'destination' ? 'active' : ''}
            onClick={() => togglePickMode('destination')}
            aria-pressed={pickMode === 'destination'}
            disabled={picking && pickMode !== 'destination'}
            title={pickMode === 'destination' ? 'Click anywhere on the map to set delivery. Click this button again to cancel.' : 'Set delivery directly on the map'}
          >
            <b>B</b> {pinButtonLabel('destination', 'Pin delivery')}
          </button>
        </div>
      )}

      {hasPreview && !mapError && <div className="gr-map-preview-chip">A → B preview · Optimize to follow real roads</div>}

      {!mapError && (
        <div className="gr-map-legend">
          <span><i className="pickup-dot" />Pickup</span>
          <span><i className="drop-dot" />Delivery</span>
          {hasPreview && <span><i className="preview-line" />Point preview</span>}
          <span><i className="fastest-line" />Fastest</span>
          <span><i className="balanced-line" />Balanced</span>
          <span><i className="green-line" />Greenest</span>
          {hasAlternativeRoads && <span><i className="candidate-line" />Other road</span>}
        </div>
      )}
    </div>
  )
}
