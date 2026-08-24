const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function optimizeRoute(payload) {
  const response = await fetch(`${API_BASE_URL}/api/routes/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || 'Unable to optimize route')
  }

  return response.json()
}

export async function getVehicles() {
  const response = await fetch(`${API_BASE_URL}/api/vehicles`)
  if (!response.ok) throw new Error('Unable to load vehicles')
  return response.json()
}
