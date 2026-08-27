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

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination, onPickPlace }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const stateRef = useRef({ routes: [], selectedKind: 'balanced', origin: null, destination: null })
  const fitSignatureRef = useRef('')
  const [pickMode, setPickMode] = useState(null)
  const [picking, setPicking] = useState(false)

  stateRef.current = { routes: routes || [], selectedKind, origin, destination }

  function clearMarkers() {
    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = []
  }

  function syncMap(map, { refit = false } = {}) {
    if (!map?.isStyleLoaded()) return

    const state = stateRef.current
    const features = (state.routes || [])
      .filter((route) => Array.isArray(route.coordinates) && route.coordinates.length > 1)
      .map((route) => ({
        type: 'Feature',
        properties: { kind: route.kind },
        geometry: { type: 'LineString', coordinates: route.coordinates },
      }))

    const data = { type: 'FeatureCollection', features }
    const source = map.getSource('greenroute-routes')
    if (source) source.setData(data)
    else {
      map.addSource('greenroute-routes', { type: 'geojson', data })
      map.addLayer({
        id: 'greenroute-route-shadow',
        type: 'line',
        source: 'greenroute-routes',
        paint: {
          'line-color': '#0a1712',
          'line-width': 8,
          'line-opacity': 0.42,
        },
      })
      map.addLayer({
        id: 'greenroute-route-alternatives',
        type: 'line',
        source: 'greenroute-routes',
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'fastest', ROUTE_COLORS.fastest,
            'balanced', ROUTE_COLORS.balanced,
            ROUTE_COLORS.greenest,
          ],
          'line-width': 4,
          'line-opacity': 0.42,
        },
      })
      map.addLayer({
        id: 'greenroute-route-selected',
        type: 'line',
        source: 'greenroute-routes',
        filter: ['==', ['get', 'kind'], state.selectedKind],
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'fastest', ROUTE_COLORS.fastest,
            'balanced', ROUTE_COLORS.balanced,
            ROUTE_COLORS.greenest,
          ],
          'line-width': 7,
          'line-opacity': 1,
        },
      })
    }

    if (map.getLayer('greenroute-route-selected')) {
      map.setFilter('greenroute-route-selected', ['==', ['get', 'kind'], state.selectedKind])
    }

    clearMarkers()
    const endpointPoints = []
    const addEndpoint = (place, kind, fallbackLabel) => {
      if (place?.lat == null || place?.lon == null) return
      const label = place.address || place.label || fallbackLabel
      const coordinates = [Number(place.lon), Number(place.lat)]
      endpointPoints.push(coordinates)
      const popup = new maplibregl.Popup({ offset: 24, closeButton: false }).setDOMContent(makePopupContent(kind, label))
      const marker = new maplibregl.Marker({ element: makeMarker(kind, label), anchor: 'bottom' })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map)
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
    if (previewSource) previewSource.setData(previewData)
    else {
      map.addSource('greenroute-preview', { type: 'geojson', data: previewData })
      map.addLayer({
        id: 'greenroute-preview-line',
        type: 'line',
        source: 'greenroute-preview',
        paint: {
          'line-color': '#63e7a2',
          'line-width': 3,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
      })
    }

    const routePoints = features.flatMap((feature) => feature.geometry.coordinates)
    const allPoints = [...routePoints, ...endpointPoints]
    if (!allPoints.length) return

    const signature = `${allPoints[0]?.join(',')}|${allPoints[allPoints.length - 1]?.join(',')}|${features.length}`
    if (!refit && fitSignatureRef.current === signature) return
    fitSignatureRef.current = signature

    const bounds = allPoints.reduce(
      (acc, coordinate) => acc.extend(coordinate),
      new maplibregl.LngLatBounds(allPoints[0], allPoints[0]),
    )
    map.fitBounds(bounds, {
      padding: { top: 82, right: 72, bottom: 92, left: 72 },
      duration: 750,
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
    const onLoad = () => {
      resize()
      syncMap(map, { refit: true })
    }

    map.on('load', onLoad)
    map.on('click', async (event) => {
      if (pickMode && !picking) {
        setPicking(true)
        try {
          const place = await reverseGeocode(event.lngLat.lat, event.lngLat.lng)
          onPickPlace?.(pickMode, place)
          setPickMode(null)
        } catch {
          onPickPlace?.(pickMode, {
            label: 'Pinned location',
            address: `${event.lngLat.lat.toFixed(6)}, ${event.lngLat.lng.toFixed(6)}`,
            lat: event.lngLat.lat,
            lon: event.lngLat.lng,
            result_type: 'Map pin',
          })
          setPickMode(null)
        } finally {
          setPicking(false)
        }
        return
      }

      if (!map.getLayer('greenroute-route-alternatives')) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ['greenroute-route-selected', 'greenroute-route-alternatives'],
      })
      const kind = hits?.[0]?.properties?.kind
      if (kind) onSelectKind?.(kind)
    })
    map.on('mousemove', (event) => {
      if (pickMode) {
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
      map.remove()
      mapRef.current = null
    }
  }, [onSelectKind, onPickPlace, pickMode, picking])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncMap(map, { refit: true })
  }, [routes, origin, destination])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    syncMap(map, { refit: false })
  }, [selectedKind])

  useEffect(() => {
    const canvas = mapRef.current?.getCanvas()
    if (canvas) canvas.style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode])

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

      <div className="map-legend">
        <span><i className="pickup-dot" />Pickup</span>
        <span><i className="drop-dot" />Delivery</span>
        {!routes?.length && origin && destination && <span><i className="preview-line" />Point preview</span>}
        <span><i className="fastest-line" />Fastest</span>
        <span><i className="balanced-line" />Balanced</span>
        <span><i className="green-line" />Greenest</span>
      </div>
    </div>
  )
}
