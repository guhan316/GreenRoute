import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'

const ROUTE_COLORS = {
  fastest: '#55a7ff',
  balanced: '#ffbf5b',
  greenest: '#35df8a',
}

const PRIMARY_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const FALLBACK_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

export default function RouteMap({ routes, selectedKind, onSelectKind, origin, destination }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const stateRef = useRef({ routes: [], selectedKind: 'balanced', origin: null, destination: null })
  const fallbackRef = useRef(false)
  const errorCountRef = useRef(0)

  stateRef.current = { routes: routes || [], selectedKind, origin, destination }

  function syncLayers(map) {
    if (!map?.isStyleLoaded()) return
    const state = stateRef.current
    const features = (state.routes || [])
      .filter((route) => route.coordinates?.length > 1)
      .map((route) => ({
        type: 'Feature',
        properties: { kind: route.kind },
        geometry: { type: 'LineString', coordinates: route.coordinates },
      }))

    const routeData = { type: 'FeatureCollection', features }
    const routeSource = map.getSource('greenroute-routes')
    if (routeSource) routeSource.setData(routeData)
    else {
      map.addSource('greenroute-routes', { type: 'geojson', data: routeData })
      map.addLayer({
        id: 'greenroute-routes-shadow',
        type: 'line',
        source: 'greenroute-routes',
        paint: { 'line-color': '#04100b', 'line-width': 10, 'line-opacity': 0.55 },
      })
      map.addLayer({
        id: 'greenroute-routes',
        type: 'line',
        source: 'greenroute-routes',
        paint: {
          'line-color': [
            'match', ['get', 'kind'],
            'fastest', ROUTE_COLORS.fastest,
            'balanced', ROUTE_COLORS.balanced,
            ROUTE_COLORS.greenest,
          ],
          'line-width': ['case', ['==', ['get', 'kind'], state.selectedKind], 6, 3.5],
          'line-opacity': ['case', ['==', ['get', 'kind'], state.selectedKind], 1, 0.55],
        },
      })
    }

    if (map.getLayer('greenroute-routes')) {
      map.setPaintProperty('greenroute-routes', 'line-width', [
        'case', ['==', ['get', 'kind'], state.selectedKind], 6, 3.5,
      ])
      map.setPaintProperty('greenroute-routes', 'line-opacity', [
        'case', ['==', ['get', 'kind'], state.selectedKind], 1, 0.55,
      ])
    }

    const endpoints = []
    if (state.origin?.lat != null && state.origin?.lon != null) {
      endpoints.push({
        type: 'Feature',
        properties: { kind: 'origin', label: state.origin.address || state.origin.label || 'Pickup' },
        geometry: { type: 'Point', coordinates: [state.origin.lon, state.origin.lat] },
      })
    }
    if (state.destination?.lat != null && state.destination?.lon != null) {
      endpoints.push({
        type: 'Feature',
        properties: { kind: 'destination', label: state.destination.address || state.destination.label || 'Drop' },
        geometry: { type: 'Point', coordinates: [state.destination.lon, state.destination.lat] },
      })
    }

    const endpointData = { type: 'FeatureCollection', features: endpoints }
    const endpointSource = map.getSource('greenroute-endpoints')
    if (endpointSource) endpointSource.setData(endpointData)
    else {
      map.addSource('greenroute-endpoints', { type: 'geojson', data: endpointData })
      map.addLayer({
        id: 'greenroute-endpoints-halo',
        type: 'circle',
        source: 'greenroute-endpoints',
        paint: {
          'circle-radius': 13,
          'circle-color': ['match', ['get', 'kind'], 'origin', '#35df8a', '#ffbf5b'],
          'circle-opacity': 0.18,
        },
      })
      map.addLayer({
        id: 'greenroute-endpoints',
        type: 'circle',
        source: 'greenroute-endpoints',
        paint: {
          'circle-radius': 6,
          'circle-color': ['match', ['get', 'kind'], 'origin', '#35df8a', '#ffbf5b'],
          'circle-stroke-color': '#06100c',
          'circle-stroke-width': 2,
        },
      })
    }

    const boundsPoints = features.flatMap((feature) => feature.geometry.coordinates)
    endpoints.forEach((feature) => boundsPoints.push(feature.geometry.coordinates))
    if (boundsPoints.length) {
      const bounds = boundsPoints.reduce(
        (acc, coordinate) => acc.extend(coordinate),
        new maplibregl.LngLatBounds(boundsPoints[0], boundsPoints[0]),
      )
      map.fitBounds(bounds, { padding: 72, duration: 900, pitch: fallbackRef.current ? 20 : 42, maxZoom: 14 })
    }
  }

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const container = containerRef.current
    const map = new maplibregl.Map({
      container,
      style: PRIMARY_STYLE,
      center: [78.9629, 20.5937],
      zoom: 4.2,
      pitch: 42,
      bearing: -8,
      canvasContextAttributes: { antialias: true },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    mapRef.current = map

    const resizeMap = () => requestAnimationFrame(() => mapRef.current?.resize())
    const onStyleLoad = () => {
      errorCountRef.current = 0
      resizeMap()
      syncLayers(map)
    }

    map.on('style.load', onStyleLoad)
    map.on('error', () => {
      if (fallbackRef.current) return
      errorCountRef.current += 1
      if (errorCountRef.current >= 6) {
        fallbackRef.current = true
        map.setPitch(20)
        map.setBearing(0)
        map.setStyle(FALLBACK_STYLE)
      }
    })

    map.on('click', (event) => {
      const features = map.queryRenderedFeatures(event.point, { layers: map.getLayer('greenroute-routes') ? ['greenroute-routes'] : [] })
      const kind = features?.[0]?.properties?.kind
      if (kind) onSelectKind?.(kind)
    })

    const resizeObserver = new ResizeObserver(resizeMap)
    resizeObserver.observe(container)
    window.addEventListener('resize', resizeMap)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', resizeMap)
      map.remove()
      mapRef.current = null
    }
  }, [onSelectKind])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (map.isStyleLoaded()) syncLayers(map)
  }, [routes, selectedKind, origin, destination])

  return (
    <div className="route-map-shell">
      <div ref={containerRef} className="route-map" />
      <div className="map-legend" aria-hidden="true">
        <span><i className="pickup-dot" />Pickup</span>
        <span><i className="drop-dot" />Drop</span>
        {fallbackRef.current && <span>Fallback basemap</span>}
      </div>
    </div>
  )
}
