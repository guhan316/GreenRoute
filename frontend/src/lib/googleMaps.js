let googleMapsPromise = null

export function googleMapsConfigured() {
  return Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())
}

export function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google)
  if (googleMapsPromise) return googleMapsPromise

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  if (!apiKey) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not configured'))
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const callbackName = '__greenRouteGoogleMapsReady'
    const existing = document.querySelector('script[data-greenroute-google-maps="true"]')

    window[callbackName] = () => {
      delete window[callbackName]
      if (window.google?.maps) resolve(window.google)
      else reject(new Error('Google Maps JavaScript API loaded without maps support'))
    }

    if (existing) {
      existing.addEventListener('error', () => reject(new Error('Google Maps JavaScript API failed to load')), { once: true })
      return
    }

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      loading: 'async',
      libraries: 'places,marker',
      callback: callbackName,
      region: 'IN',
      language: 'en',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.defer = true
    script.dataset.greenrouteGoogleMaps = 'true'
    script.onerror = () => {
      delete window[callbackName]
      googleMapsPromise = null
      reject(new Error('Google Maps JavaScript API failed to load'))
    }
    document.head.appendChild(script)
  })

  return googleMapsPromise
}
