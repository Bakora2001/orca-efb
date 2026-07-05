import { useEffect, useState } from 'react'

export function useUTCClock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const hh = String(time.getUTCHours()).padStart(2, '0')
  const mm = String(time.getUTCMinutes()).padStart(2, '0')
  const ss = String(time.getUTCSeconds()).padStart(2, '0')
  const day = String(time.getUTCDate()).padStart(2, '0')
  const month = time.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()
  const year = time.getUTCFullYear()

  return {
    timeString: `${hh}:${mm}:${ss}`,
    dateString: `${day} ${month} ${year}`,
    raw: time
  }
}
