import { useEffect, useState } from 'react'

export type Forecast = { date: string; max: number; min: number; code: number }[]

// Open-Meteo: free, no key. The service worker keeps the last answer for offline.
export function useForecast(lat: number | null | undefined, lng: number | null | undefined) {
  const [f, setF] = useState<Forecast | null>(null)
  useEffect(() => {
    if (lat == null || lng == null) return
    let alive = true
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=5`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j.daily) return
        setF(j.daily.time.map((date: string, i: number) => ({
          date, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]), code: j.daily.weather_code[i]
        })))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [lat, lng])
  return f
}

export function weatherIcon(code: number) {
  if (code === 0) return '☀'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁'
  if (code <= 48) return '🌫'
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧'
  if (code <= 77 || code === 85 || code === 86) return '❄'
  return '⛈'
}
