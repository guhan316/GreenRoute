import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../lib/api.js'
import './RouteMap.css'

const ROUTE_COLORS = {
  fastest: '#4c9dff',
  balanced: '#f4b84a',
  greenest: '#2ddd86',
  alternative: '#9aa8a1',
}

const BASE_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

function cleanCoordinates(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((point) => Array.isArray(point) && point.length >= 2 ? [Number(point[0]), Number(point[1])] : null)
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
}

function simplifyCoordinates(points, target = 1000) {
  if (points.length <= target) return points
  const stride = Math.ceil(points.length / target)
  const sampled = points.filter((_point, index) => index % stride === 0)
  if (sampled[sampled.length - 1] !== points[points.length - 1]) sampled.push(points[points.length - 1])
  return sampled
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

function svgPathFor(map, coordinates) {
  return simplifyCoordinates(coordinates)
    .map(([lon, lat], index) => {
      const point = map.project([lon, lat])
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`
    })
    .join(' ')
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

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const overlayRef = useRef(null)
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

  function renderOverlay(map) {
    const svg = overlayRef.current
    if (!svg || !map || !readyRef.current) return

    const canvas = map.getCanvas()
    const width = canvas.clientWidth || canvas.width
    const height = canvas.clientHeight || canvas.height
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.replaceChildren()

    const state = stateRef.current
    const routeEntries = (state.routes || [])
      .map((route) => ({ route, coordinates: cleanCoordinates(route.coordinates) }))
      .filter(({ coordinates }) => coordinates.length > 1)

    const ordered = [
      ...routeEntries.filter(({ route }) => !routeIsSelected(route, state.selectedKind)),
      ...routeEntries.filter(({ route }) => routeIsSelected(route, state.selectedKind)),
    ]

    const namespace = 'http://www.w3.org/2000/svg'
    for (const { route, coordinates } of ordered) {
      const d = svgPathFor(map, coordinates)
      if (!d) continue
      const selected = routeIsSelected(route, state.selectedKind)
      const alternative = route.isAlternative || strategyKindsFor(route).length === 0

      const casing = document.createElementNS(namespace, 'path')
      casing.setAttribute('d', d)
      casing.setAttribute('fill', 'none')
      casing.setAttribute('stroke', selected ? '#ffffff' : '#17241f')
      casing.setAttribute('stroke-width', selected ? '11' : alternative ? '7' : '8')
      casing.setAttribute('stroke-opacity', selected ? '0.96' : alternative ? '0.58' : '0.76')
      casing.setAttribute('stroke-linecap', 'round')
      casing.setAttribute('stroke-linejoin', 'round')
      casing.setAttribute('vector-effect', 'non-scaling-stroke')
      svg.appendChild(casing)

      const line = document.createElementNS(namespace, 'path')
      line.setAttribute('d', d)
      line.setAttribute('fill', 'none')
      line.setAttribute('stroke', routeColor(route, state.selectedKind))
      line.setAttribute('stroke-width', selected ? '7' : alternative ? '4' : '4.5')
      line.setAttribute('stroke-opacity', selected ? '1' : alternative ? '0.68' : '0.84')
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('stroke-linejoin', 'round')
      line.setAttribute('vector-effect', 'non-scaling-stroke')

      const strategies = strategyKindsFor(route)
      if (strategies.length) {
        line.style.pointerEvents = 'stroke'
        line.style.cursor = 'pointer'
        line.addEventListener('click', (event) => {
          event.stopPropagation()
          const targetKind = strategies.includes(state.selectedKind) ? state.selectedKind : strategies[0]
          onSelectKindRef.current?.(targetKind)
        })
      }
      svg.appendChild(line)
    }

    if (!routeEntries.length) {
      const endpoints = endpointCoordinates(state)
      if (endpoints.length === 2) {
        const d = svgPathFor(map, endpoints)
        const previewCasing = document.createElementNS(namespace, 'path')
        previewCasing.setAttribute('d', d)
        previewCasing.setAttribute('fill', 'none')
        previewCasing.setAttribute('stroke', '#0b2117')
        previewCasing.setAttribute('stroke-width', '8')
        previewCasing.setAttribute('stroke-linecap', 'round')
        previewCasing.setAttribute('stroke-opacity', '0.7')
        previewCasing.setAttribute('vector-effect', 'non-scaling-stroke')
        svg.appendChild(previewCasing)

        const preview = document.createElementNS(namespace, 'path')
        preview.setAttribute('d', d)
        preview.setAttribute('fill', 'none')
        preview.setAttribute('stroke', '#35df8a')
        preview.setAttribute('stroke-width', '4')
        preview.setAttribute('stroke-dasharray', '10 9')
        preview.setAttribute('stroke-linecap', 'round')
        preview.setAttribute('stroke-opacity', '1')
        preview.setAttribute('vector-effect', 'non-scaling-stroke')
        svg.appendChild(preview)
      }
    }
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
      padding: { top: 105, right: 62, bottom: 82, left: 62 },
      duration: 700,
      maxZoom: endpoints.length === 1 ? 15 : 12,
    })
  }

  function syncAll({ refit = false } = {}) {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncMarkers(map)
    fitToState(map, refit)
    requestAnimationFrame(() => renderOverlay(map))
  }

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [78.9629, 22.6],
      zoom: 4.1,
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: true,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left')
    mapRef.current = map

    const redraw = () => requestAnimationFrame(() => renderOverlay(map))
    const ready = () => {
      readyRef.current = true
      map.resize()
      syncAll({ refit: true })
    }
    map.on('load', ready)
    map.on('move', redraw)
    map.on('zoom', redraw)
    map.on('resize', redraw)

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

    const observer = new ResizeObserver(() => {
      map.resize()
      redraw()
    })
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
  useEffect(() => { renderOverlay(mapRef.current) }, [selectedKind])
  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  const hasPreview = !routes?.length && origin?.lat != null && origin?.lon != null && destination?.lat != null && destination?.lon != null
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
    <div className="route-map-shell" data-map-ui="v4">
      <div ref={containerRef} className="route-map" />
      <svg ref={overlayRef} className="route-svg-overlay" aria-hidden="true" />

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

      {hasPreview && <div className="gr-map-preview-chip">A → B coordinate preview · Optimize for live roads</div>}

      <div className="gr-map-legend">
        <span><i className="pickup-dot" />Pickup</span>
        <span><i className="drop-dot" />Delivery</span>
        {hasPreview && <span><i className="preview-line" />Point preview</span>}
        <span><i className="fastest-line" />Fastest</span>
        <span><i className="balanced-line" />Balanced</span>
        <span><i className="green-line" />Greenest</span>
        {hasAlternativeRoads && <span><i className="candidate-line" />Other road</span>}
      </div>
    </div>
  )
}
