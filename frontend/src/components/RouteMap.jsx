import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../lib/api.js'
import './RouteMap.css'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const ROUTE_SOURCE_ID = 'greenroute-routes'
const ROUTE_CASING_ID = 'greenroute-route-casing'
const ROUTE_LINE_ID = 'greenroute-route-lines'
const PREVIEW_CASING_ID = 'greenroute-preview-casing'
const PREVIEW_LINE_ID = 'greenroute-preview-line'

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

function supportsWebGL2() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

function makeMarker(kind, label) {
  const element = document.createElement('div')
  element.className = `route-endpoint-marker ${kind}`
  const badge = document.createElement('span')
  badge.textContent = kind === 'origin' ? 'A' : 'B'
  element.appendChild(badge)
  element.setAttribute('aria-label', label)
  return element
}

function makePopupContent(kind, label) {
  const wrapper = document.createElement('div')
  const title = document.createElement('strong')
  const detail = document.createElement('span')
  title.textContent = kind === 'origin' ? 'Pickup' : 'Delivery'
  detail.textContent = label
  wrapper.append(title, document.createElement('br'), detail)
  return wrapper
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

function routeFeatures(state) {
  const entries = (state.routes || [])
    .map((route) => ({ route, coordinates: simplifyCoordinates(cleanCoordinates(route.coordinates)) }))
    .filter(({ coordinates }) => coordinates.length > 1)

  const ordered = [
    ...entries.filter(({ route }) => !routeIsSelected(route, state.selectedKind)),
    ...entries.filter(({ route }) => routeIsSelected(route, state.selectedKind)),
  ]

  const features = ordered.map(({ route, coordinates }, index) => {
    const strategies = strategyKindsFor(route)
    const selected = routeIsSelected(route, state.selectedKind)
    return {
      type: 'Feature',
      id: route.mapKey || route.candidate_id || index,
      properties: {
        selected,
        alternative: Boolean(route.isAlternative || !strategies.length),
        preview: false,
        color: routeColor(route, state.selectedKind),
        strategyKind: strategies.includes(state.selectedKind) ? state.selectedKind : (strategies[0] || ''),
      },
      geometry: { type: 'LineString', coordinates },
    }
  })

  if (!features.length) {
    const endpoints = [state.origin, state.destination]
      .filter((place) => place?.lat != null && place?.lon != null)
      .map((place) => [Number(place.lon), Number(place.lat)])
      .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
    if (endpoints.length === 2) {
      features.push({
        type: 'Feature',
        id: 'coordinate-preview',
        properties: {
          selected: false,
          alternative: false,
          preview: true,
          color: '#20d982',
          strategyKind: '',
        },
        geometry: { type: 'LineString', coordinates: endpoints },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

function addRouteLayers(map, data) {
  if (map.getSource(ROUTE_SOURCE_ID)) {
    map.getSource(ROUTE_SOURCE_ID).setData(data)
    return
  }

  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data })
  map.addLayer({
    id: ROUTE_CASING_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'preview'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'selected'], '#ffffff', ['get', 'alternative'], '#26312d', '#18231f'],
      'line-width': ['case', ['get', 'selected'], 11, ['get', 'alternative'], 7, 8],
      'line-opacity': ['case', ['get', 'selected'], 0.96, ['get', 'alternative'], 0.58, 0.76],
    },
  })
  map.addLayer({
    id: ROUTE_LINE_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'preview'], false],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['case', ['get', 'selected'], 7, ['get', 'alternative'], 4, 4.5],
      'line-opacity': ['case', ['get', 'selected'], 1, ['get', 'alternative'], 0.7, 0.86],
    },
  })
  map.addLayer({
    id: PREVIEW_CASING_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'preview'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0a1b14', 'line-width': 8, 'line-opacity': 0.72 },
  })
  map.addLayer({
    id: PREVIEW_LINE_ID,
    type: 'line',
    source: ROUTE_SOURCE_ID,
    filter: ['==', ['get', 'preview'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#20d982', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 1 },
  })
}

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const readyRef = useRef(false)
  const stateRef = useRef({ routes: [], selectedKind: 'balanced', origin: null, destination: null })
  const fitSignatureRef = useRef('')
  const pickModeRef = useRef(null)
  const pickingRef = useRef(false)
  const onPickPlaceRef = useRef(onPickPlace)
  const onSelectKindRef = useRef(onSelectKind)
  const [pickMode, setPickMode] = useState(null)
  const [picking, setPicking] = useState(false)
  const [mapError, setMapError] = useState('')

  stateRef.current = { routes: routes || [], selectedKind, origin, destination }
  pickModeRef.current = pickMode
  pickingRef.current = picking
  onPickPlaceRef.current = onPickPlace
  onSelectKindRef.current = onSelectKind

  const endpointCoordinates = (state) => {
    const result = []
    for (const place of [state.origin, state.destination]) {
      if (place?.lat == null || place?.lon == null) continue
      const point = [Number(place.lon), Number(place.lat)]
      if (Number.isFinite(point[0]) && Number.isFinite(point[1])) result.push(point)
    }
    return result
  }

  function clearMarkers() {
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
  }

  function syncMarkers(map) {
    clearMarkers()
    const add = (place, kind, fallback) => {
      if (place?.lat == null || place?.lon == null) return
      const coordinates = [Number(place.lon), Number(place.lat)]
      if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return
      const label = place.address || place.label || fallback
      const popup = new maplibregl.Popup({ offset: 24, closeButton: false })
        .setDOMContent(makePopupContent(kind, label))
      const marker = new maplibregl.Marker({ element: makeMarker(kind, label), anchor: 'bottom' })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map)
      marker.getElement().style.zIndex = '25'
      markersRef.current.push(marker)
    }
    add(stateRef.current.origin, 'origin', 'Pickup')
    add(stateRef.current.destination, 'destination', 'Delivery')
  }

  function syncRoutes(map) {
    if (!map || !readyRef.current) return
    addRouteLayers(map, routeFeatures(stateRef.current))
  }

  function fitToState(map, force = false) {
    const state = stateRef.current
    const routePoints = (state.routes || []).flatMap((route) => cleanCoordinates(route.coordinates))
    const endpoints = endpointCoordinates(state)
    const allPoints = [...routePoints, ...endpoints]
    if (!allPoints.length) return

    const signature = `${allPoints[0].join(',')}|${allPoints[allPoints.length - 1].join(',')}|${routePoints.length}`
    if (!force && fitSignatureRef.current === signature) return
    fitSignatureRef.current = signature

    const bounds = allPoints.reduce(
      (acc, coordinate) => acc.extend(coordinate),
      new maplibregl.LngLatBounds(allPoints[0], allPoints[0]),
    )
    map.fitBounds(bounds, {
      padding: { top: 110, right: 64, bottom: 94, left: 64 },
      duration: 700,
      maxZoom: endpoints.length === 1 ? 15 : 12,
    })
  }

  function syncAll({ refit = false } = {}) {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncRoutes(map)
    syncMarkers(map)
    fitToState(map, refit)
  }

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return undefined
    if (!supportsWebGL2()) {
      setMapError('This browser cannot display the interactive map because WebGL2 is unavailable.')
      return undefined
    }

    let map
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [78.9629, 22.6],
        zoom: 4.1,
        pitch: 24,
        bearing: 0,
        attributionControl: true,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left')
      mapRef.current = map
      setMapError('')
    } catch {
      setMapError('The interactive map could not start. Route search and carbon calculations are still available.')
      return undefined
    }

    const ready = () => {
      readyRef.current = true
      setMapError('')
      map.resize()
      syncAll({ refit: true })
    }
    const handleStyleError = () => {
      if (!readyRef.current) setMapError('The map style could not be loaded. Check the connection and try again.')
    }
    const selectRoute = (event) => {
      if (pickModeRef.current) return
      const kind = event.features?.[0]?.properties?.strategyKind
      if (kind) onSelectKindRef.current?.(kind)
    }
    const showRouteCursor = () => {
      if (!pickModeRef.current) map.getCanvas().style.cursor = 'pointer'
    }
    const resetRouteCursor = () => {
      map.getCanvas().style.cursor = pickModeRef.current ? 'crosshair' : ''
    }

    map.on('load', ready)
    map.once('error', handleStyleError)
    map.on('click', ROUTE_LINE_ID, selectRoute)
    map.on('mouseenter', ROUTE_LINE_ID, showRouteCursor)
    map.on('mouseleave', ROUTE_LINE_ID, resetRouteCursor)
    map.on('click', async (event) => {
      const activePickMode = pickModeRef.current
      if (!activePickMode || pickingRef.current) return
      setPicking(true)
      pickingRef.current = true
      try {
        const place = await reverseGeocode(event.lngLat.lat, event.lngLat.lng)
        onPickPlaceRef.current?.(activePickMode, place)
      } catch {
        onPickPlaceRef.current?.(activePickMode, {
          label: 'Pinned location',
          address: `${event.lngLat.lat.toFixed(6)}, ${event.lngLat.lng.toFixed(6)}`,
          lat: event.lngLat.lat,
          lon: event.lngLat.lng,
          result_type: 'Map pin',
        })
      } finally {
        setPickMode(null)
        pickModeRef.current = null
        setPicking(false)
        pickingRef.current = false
      }
    })

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      clearMarkers()
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => { syncAll({ refit: true }) }, [routes, origin, destination])
  useEffect(() => { syncRoutes(mapRef.current) }, [selectedKind])
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : ''
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
    <div className="route-map-shell" data-map-ui="v5">
      <div ref={containerRef} className={`route-map ${mapError ? 'is-unavailable' : ''}`} />

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
