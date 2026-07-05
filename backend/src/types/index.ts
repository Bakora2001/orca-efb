export type DispatchStatus = 'approved' | 'marginal' | 'not-dispatchable'
export type UserRole = 'dispatcher' | 'administrator'

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
  hasFuel: boolean
  hasWeatherSupport: boolean
  hasNotamSupport: boolean
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

export interface PerformanceDataPoint {
  aircraftType: string
  airportIcao: string
  temperature: number
  pressureAltitude: number
  runway: string
  flap: string
  weightLimit: number
  obstacleLimit: number
  watLimit: number
}
