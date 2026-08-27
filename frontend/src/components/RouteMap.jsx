import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { reverseGeocode } from '../lib/api.js'

const ROUTE_COLORS = {
  fastest: '#4c9dff',
  balanced: '#f3b94f',
  greenest: '#28d77f',
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
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-opacity': 1,
        'raster-saturation': -0.08,
        'raster-contrast': 0.03,
      },
    },
  ],
}

function makeMarker(kind, label) {
  const element = document.createElement('div')
  element.className = `route-endpoint-marker ${kind}`
  element.style.zIndex = '20'
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

function cleanCoordinates(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((point) => Array.isArray(point) && point.length >= 2
      ? [Number(point[0]), Number(point[1])]
      : null)
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1])
      && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90)
}

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const mapReadyRef = useRef(false)
  const pendingRefitRef = useRef(false)
  const markersRef = useRef([])
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

  function clearMarkers() {
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
  }

  function syncMap(map, { refit = false } = {}) {
    if (!map || !mapReadyRef.current) {
      pendingRefitRef.current = pendingRefitRef.current || refit
      return
    }

    const state = stateRef.current
    const features = (state.routes || [])
      .map((route) => ({ route, coordinates: cleanCoordinates(route.coordinates) }))
      .filter(({ coordinates }) => coordinates.length > 1)
      .map(({ route, coordinates }) => ({
        type: 'Feature',
        properties: {
          kind: route.kind,
          candidateId: route.candidate_id || '',
          sourceRouteType: route.source_route_type || '',
        },
        geometry: { type: 'LineString', coordinates },
      }))

    const data = { type: 'FeatureCollection', features }
    const source = map.getSource('greenroute-routes')
    if (source) {
      source.setData(data)
    } else {
      map.addSource('greenroute-routes', { type: 'geojson', data })
    }

    if (!map.getLayer('greenroute-route-shadow')) {
      map.addLayer({
        id: 'greenroute-route-shadow',
        type: 'line',
        source: 'greenroute-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#07150e',
          'line-width': 10,
          'line-opacity': 0.58,
        },
      })
    }
    if (!map.getLayer('greenroute-route-alternatives')) {
      map.addLayer({
        id: 'greenroute-route-alternatives',
        type: 'line',
        source: 'greenroute-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'fastest', ROUTE_COLORS.fastest,
            'balanced', ROUTE_COLORS.balanced,
            ROUTE_COLORS.greenest,
          ],
          'line-width': 5,
          'line-opacity': 0.72,
        },
      })
    }
    if (!map.getLayer('greenroute-route-selected')) {
      map.addLayer({
        id: 'greenroute-route-selected',
        type: 'line',
        source: 'greenroute-routes',
        filter: ['==', ['get', 'kind'], state.selectedKind],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'fastest', ROUTE_COLORS.fastest,
            'balanced', ROUTE_COLORS.balanced,
            ROUTE_COLORS.greenest,
          ],
          'line-width': 8,
          'line-opacity': 1,
        },
      })
    }
    map.setFilter('greenroute-route-selected', ['==', ['get', 'kind'], state.selectedKind])

    clearMarkers()
    const endpointPoints = []
    const addEndpoint = (place, kind, fallbackLabel) => {
      if (place?.lat == null || place?.lon == null) return
      const coordinates = [Number(place.lon), Number(place.lat)]
      if (!Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return
      const label = place.address || place.label || fallbackLabel
      endpointPoints.push(coordinates)
      const popup = new maplibregl.Popup({ offset: 24, closeButton: false })
        .setDOMContent(makePopupContent(kind, label))
      const marker = new maplibregl.Marker({ element: makeMarker(kind, label), anchor: 'bottom' })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map)
      marker.getElement().style.zIndex = '20'
      markersRef.current.push(marker)
    }

    addEndpoint(state.origin, 'origin', 'Pickup')
    addEndpoint(state.destination, 'destination', 'Delivery')

    const previewFeature = endpointPoints.length === 2 && features.length === 0
      ? {
          type: 'Feature',
          properties: { kind: 'preview' },
          geometry: { type: 'LineString', coordinates: endpointPoints },
        }
      : null
    const previewData = {
      type: 'FeatureCollection',
      features: previewFeature ? [previewFeature] : [],
    }
    const previewSource = map.getSource('greenroute-preview')
    if (previewSource) {
      previewSource.setData(previewData)
    } else {
      map.addSource('greenroute-preview', { type: 'geojson', data: previewData })
    }

    if (!map.getLayer('greenroute-preview-shadow')) {
      map.addLayer({
        id: 'greenroute-preview-shadow',
        type: 'line',
        source: 'greenroute-preview',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#07150e',
          'line-width': 9,
          'line-opacity': 0.68,
        },
      })
    }
    if (!map.getLayer('greenroute-preview-line')) {
      map.addLayer({
        id: 'greenroute-preview-line',
        type: 'line',
        source: 'greenroute-preview',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#35df8a',
          'line-width': 5,
          'line-opacity': 1,
          'line-dasharray': [1.5, 1.2],
        },
      })
    }

    const routePoints = features.flatMap((feature) => feature.geometry.coordinates)
    const allPoints = [...routePoints, ...endpointPoints]
    if (!allPoints.length) return

    const signature = `${allPoints[0]?.join(',')}|${allPoints[allPoints.length - 1]?.join(',')}|${features.length}`
    const shouldRefit = refit || pendingRefitRef.current || fitSignatureRef.current !== signature
    pendingRefitRef.current = false
    if (!shouldRefit) return
    fitSignatureRef.current = signature

    const bounds = allPoints.reduce(
      (acc, coordinate) => acc.extend(coordinate),
      new maplibregl.LngLatBounds(allPoints[0], allPoints[0]),
    )
    map.fitBounds(bounds, {
      padding: { top: 112, right: 72, bottom: 90, left: 72 },
      duration: 650,
      maxZoom: endpointPoints.length === 1 ? 15 : 13,
    })
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

    const resize = () => requestAnimationFrame(() => mapRef.current?.resize())
    const markReadyAndSync = () => {
      mapReadyRef.current = true
      resize()
      syncMap(map, { refit: true })
    }

    map.on('load', markReadyAndSync)
    map.on('style.load', markReadyAndSync)
    map.on('click', async (event) => {
      const activePickMode = pickModeRef.current
      if (activePickMode && !pickingRef.current) {
        setPicking(true)
        pickingRef.current = true
        try {
          const place = await reverseGeocode(event.lngLat.lat, event.lngLat.lng)
          onPickPlaceRef.current?.(activePickMode, place)
          setPickMode(null)
          pickModeRef.current = null
        } catch {
          onPickPlaceRef.current?.(activePickMode, {
            label: 'Pinned location',
            address: `${event.lngLat.lat.toFixed(6)}, ${event.lngLat.lng.toFixed(6)}`,
            lat: event.lngLat.lat,
            lon: event.lngLat.lng,
            result_type: 'Map pin',
          })
          setPickMode(null)
          pickModeRef.current = null
        } finally {
          setPicking(false)
          pickingRef.current = false
        }
        return
      }

      if (!map.getLayer('greenroute-route-alternatives')) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ['greenroute-route-selected', 'greenroute-route-alternatives'],
      })
      const kind = hits?.[0]?.properties?.kind
      if (kind) onSelectKindRef.current?.(kind)
    })
    map.on('mousemove', (event) => {
      if (pickModeRef.current) {
        map.getCanvas().style.cursor = 'crosshair'
        return
      }
      if (!map.getLayer('greenroute-route-alternatives')) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ['greenroute-route-selected', 'greenroute-route-alternatives'],
      })
      map.getCanvas().style.cursor = hits.length ? 'pointer' : ''
    })

    const observer = new ResizeObserver(resize)
    observer.observe(containerRef.current)
    window.addEventListener('resize', resize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      clearMarkers()
      mapReadyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncMap(map, { refit: true })
  }, [routes, origin, destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    syncMap(map, { refit: false })
  }, [selectedKind])

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

  const hasPreview = !routes?.length && origin?.lat != null && origin?.lon != null && destination?.lat != null && destination?.lon != null

  return (
    <div className="route-map-shell">
      <div ref={containerRef} className="route-map" />

      <div className="map-pick-controls">
        <button type="button" className={pickMode === 'origin' ? 'active' : ''} onClick={() => setPickMode((current) => current === 'origin' ? null : 'origin')}>
          <b>A</b> Pin pickup
        </button>
        <button type="button" className={pickMode === 'destination' ? 'active' : ''} onClick={() => setPickMode((current) => current === 'destination' ? null : 'destination')}>
          <b>B</b> Pin delivery
        </button>
      </div>

      {pickMode && (
        <div className="map-pick-hint">
          {picking ? 'Identifying this point…' : `Click the exact ${pickMode === 'origin' ? 'pickup' : 'delivery'} point on the map`}
        </div>
      )}

      {hasPreview && <div className="map-preview-chip">A → B coordinate preview · Optimize for live roads</div>}

      <div className="map-legend">
        <span><i className="pickup-dot" />Pickup</span>
        <span><i className="drop-dot" />Delivery</span>
        {hasPreview && <span><i className="preview-line" />Point preview</span>}
        <span><i className="fastest-line" />Fastest</span>
        <span><i className="balanced-line" />Balanced</span>
        <span><i className="green-line" />Greenest</span>
      </div>
    </div>
  )
}
