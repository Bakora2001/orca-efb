export type DispatchStatus = 'approved' | 'marginal' | 'not-dispatchable'

export interface Aircraft {
  registration: string
  type: string
  configuration: string
  basicWeight: number
  fuelCapacity: number
  status: 'active' | 'maintenance' | 'grounded'
  cycles: number
  hours: number
}

export interface Airport {
  icao: string
  iata: string
  name: string
  country: string
  elevation: number
  lat: number
  lon: number
}

export interface DispatchRecord {
  id: string
  aircraft: string
  departure: string
  destination: string
  alternate: string
  status: DispatchStatus
  rtow: number
  payload: number
  time: string
}

export interface RTOWInput {
  aircraft: string
  airport: string
  temperature: number
  pressureAltitude: number
  qnh: number
  runway: string
  flap: string
  passengers: number
  cargo: number
  fuel: number
}

export interface RTOWResult {
  rtow: number
  maxPayload: number
  maxPassengers: number
  takeoffWeight: number
  landingWeight: number
  zeroFuelWeight: number
  limitingFactor: string
  status: DispatchStatus
  margin: number
}
