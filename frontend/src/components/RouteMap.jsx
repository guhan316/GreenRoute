import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

const ROUTE_COLORS = {
  fastest: '#55a7ff',
  balanced: '#ffbf5b',
  greenest: '#35df8a',
}

export default function RouteMap({ routes, selectedKind, onSelectKind }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [78.9629, 20.5937],
      zoom: 4.2,
      pitch: 48,
      bearing: -8,
      canvasContextAttributes: { antialias: true },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !routes?.length) return

    const update = () => {
      const features = routes
        .filter((route) => route.coordinates?.length > 1)
        .map((route) => ({
          type: 'Feature',
          properties: { kind: route.kind },
          geometry: { type: 'LineString', coordinates: route.coordinates },
        }))

      const geojson = { type: 'FeatureCollection', features }
      const existing = map.getSource('greenroute-routes')
      if (existing) existing.setData(geojson)
      else {
        map.addSource('greenroute-routes', { type: 'geojson', data: geojson })
        map.addLayer({
          id: 'greenroute-routes-shadow',
          type: 'line',
          source: 'greenroute-routes',
          paint: {
            'line-color': '#04100b',
            'line-width': 9,
            'line-opacity': 0.45,
          },
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
            'line-width': [
              'case', ['==', ['get', 'kind'], selectedKind], 6, 3.5,
            ],
            'line-opacity': [
              'case', ['==', ['get', 'kind'], selectedKind], 1, 0.58,
            ],
          },
        })

        map.on('click', 'greenroute-routes', (event) => {
          const kind = event.features?.[0]?.properties?.kind
          if (kind) onSelectKind?.(kind)
        })
        map.on('mouseenter', 'greenroute-routes', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'greenroute-routes', () => { map.getCanvas().style.cursor = '' })
      }

      if (map.getLayer('greenroute-routes')) {
        map.setPaintProperty('greenroute-routes', 'line-width', [
          'case', ['==', ['get', 'kind'], selectedKind], 6, 3.5,
        ])
        map.setPaintProperty('greenroute-routes', 'line-opacity', [
          'case', ['==', ['get', 'kind'], selectedKind], 1, 0.58,
        ])
      }

      const points = features.flatMap((feature) => feature.geometry.coordinates)
      if (points.length) {
        const bounds = points.reduce(
          (acc, coordinate) => acc.extend(coordinate),
          new maplibregl.LngLatBounds(points[0], points[0]),
        )
        map.fitBounds(bounds, { padding: 70, duration: 1100, pitch: 48 })
      }
    }

    if (map.isStyleLoaded()) update()
    else map.once('load', update)
  }, [routes, selectedKind, onSelectKind])

  return <div ref={containerRef} className="route-map" />
}
