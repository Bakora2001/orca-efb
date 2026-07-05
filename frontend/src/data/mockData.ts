import type { Aircraft, Airport, DispatchRecord } from '../types'

export const mockAircraft: Aircraft[] = [
  { registration: '5Y-DWN', type: 'Dash 8 Q400', configuration: '78Y', basicWeight: 17185, fuelCapacity: 6526, status: 'active', cycles: 18452, hours: 32104 },
  { registration: '5Y-FTC', type: 'Dash 8 Q400', configuration: '76Y', basicWeight: 17210, fuelCapacity: 6526, status: 'active', cycles: 15203, hours: 28850 },
  { registration: '5Y-KQX', type: 'Dash 8 Q400', configuration: '78Y', basicWeight: 17150, fuelCapacity: 6526, status: 'maintenance', cycles: 21044, hours: 39220 },
  { registration: '5Y-PAL', type: 'Dash 8 Q400', configuration: '74Y', basicWeight: 17260, fuelCapacity: 6526, status: 'active', cycles: 9870, hours: 17640 },
]

export const mockAirports: Airport[] = [
  { icao: 'EGPD', iata: 'ABZ', name: 'Aberdeen International', country: 'United Kingdom', elevation: 215, lat: 57.2019, lon: -2.1978 },
  { icao: 'FTTC', iata: 'NJE', name: 'N\'Djamena International', country: 'Chad', elevation: 968, lat: 12.1337, lon: 15.0339 },
  { icao: 'HKJK', iata: 'NBO', name: 'Jomo Kenyatta International', country: 'Kenya', elevation: 5330, lat: -1.3192, lon: 36.9278 },
  { icao: 'HKMO', iata: 'MBA', name: 'Moi International', country: 'Kenya', elevation: 200, lat: -4.0348, lon: 39.5942 },
]

export const mockDispatches: DispatchRecord[] = [
  { id: 'DSP-2201', aircraft: '5Y-DWN', departure: 'EGPD', destination: 'FTTC', alternate: 'HKJK', status: 'approved', rtow: 28998, payload: 6420, time: '08:42 UTC' },
  { id: 'DSP-2202', aircraft: '5Y-FTC', departure: 'HKJK', destination: 'HKMO', alternate: 'HKKI', status: 'approved', rtow: 29150, payload: 7010, time: '09:15 UTC' },
  { id: 'DSP-2203', aircraft: '5Y-PAL', departure: 'HKMO', destination: 'HKJK', alternate: 'HKKI', status: 'marginal', rtow: 27880, payload: 5230, time: '10:03 UTC' },
  { id: 'DSP-2204', aircraft: '5Y-KQX', departure: 'EGPD', destination: 'FTTC', alternate: 'HKJK', status: 'not-dispatchable', rtow: 26100, payload: 3980, time: '11:27 UTC' },
]
