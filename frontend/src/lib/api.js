const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function parseResponse(response, fallback) {
  if (response.ok) return response.json()
  const detail = await response.json().catch(() => ({}))
  throw new Error(detail.detail || fallback)
}

function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

export async function optimizeRoute(payload) {
  const response = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseResponse(response, 'Unable to optimize route')
}

export async function searchPlaces(query, limit = 10) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const response = await fetch(`${API_BASE_URL}/api/places/search?${params}`)
  return parseResponse(response, 'Unable to search locations')
}

export async function reverseGeocode(lat, lon) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  const response = await fetch(`${API_BASE_URL}/api/places/reverse?${params}`)
  return parseResponse(response, 'Unable to identify this map location')
}

export async function getVehicleCatalog() {
  const response = await fetch(`${API_BASE_URL}/api/vehicle-catalog`)
  return parseResponse(response, 'Unable to load vehicle catalog')
}

export async function saveOptimization(payload, accessToken) {
  const response = await fetch(`${API_BASE_URL}/api/history/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(payload),
  })
  return parseResponse(response, 'Unable to save trip')
}

export async function getHistory(accessToken) {
  const response = await fetch(`${API_BASE_URL}/api/history`, {
    headers: authHeaders(accessToken),
  })
  return parseResponse(response, 'Unable to load trip history')
}

export async function getDashboard(accessToken) {
  const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
    headers: authHeaders(accessToken),
  })
  return parseResponse(response, 'Unable to load sustainability dashboard')
}

export async function deleteSavedTrip(runId, accessToken) {
  const response = await fetch(`${API_BASE_URL}/api/history/${runId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  })
  return parseResponse(response, 'Unable to delete saved trip')
}

export async function getVehicles() {
  const response = await fetch(`${API_BASE_URL}/api/vehicles`)
  return parseResponse(response, 'Unable to load vehicles')
}

export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`)
  return parseResponse(response, 'GreenRoute backend is unavailable')
}
