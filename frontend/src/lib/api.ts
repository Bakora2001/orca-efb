/**
 * api.ts — Orca EFB Central API Client
 *
 * Auth strategy:
 *   • Access token stored in memory only (never localStorage / sessionStorage)
 *   • Refresh token lives in an httpOnly cookie — XSS cannot read it
 *   • On 401, automatically calls POST /api/auth/refresh to get a new access token
 *   • On failed refresh (cookie expired / revoked), clears state and redirects to /login
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// ─── In-memory token store ────────────────────────────────────────────────────
// Stored as a module-level variable. Not accessible from outside this module.

let _accessToken: string | null = null
let _user: { id: string; username: string; role: string; full_name?: string | null } | null = null
let _refreshing: Promise<boolean> | null = null  // deduplicate concurrent refresh calls

export function setSession(token: string, user: typeof _user): void {
  _accessToken = token
  _user = user
}

export function getToken(): string | null {
  return _accessToken
}

export function getUser(): typeof _user {
  return _user
}

export function clearSession(): void {
  _accessToken = null
  _user = null
}

export function logout(): void {
  // Fire-and-forget: tell the server to clear the httpOnly cookie
  fetch(`${BASE_URL}/api/auth/logout`, {
    method:      'POST',
    credentials: 'include',
    headers:     _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
  }).catch(() => { /* ignore network errors on logout */ })

  clearSession()
  window.location.href = '/login'
}

// ─── Refresh access token ─────────────────────────────────────────────────────

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method:      'POST',
      credentials: 'include', // sends the httpOnly refreshToken cookie
    })
    if (!res.ok) return false

    const body = await res.json()
    const data = body.data || body
    if (data.token && data.user) {
      setSession(data.token, data.user)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // always include cookies for refresh endpoint
  })

  // Auto-refresh on 401 (once)
  if (res.status === 401 && !isRetry) {
    // Deduplicate: if a refresh is already in flight, wait for it
    if (!_refreshing) {
      _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
    }
    const refreshed = await _refreshing

    if (refreshed) {
      return apiFetch<T>(path, options, true) // retry with new token
    }

    // Refresh failed — session is dead
    clearSession()
    window.location.href = '/login'
    throw new Error('Session expired. Please sign in again.')
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      msg = body.message || body.error || msg
    } catch { /* ignore parse errors */ }
    throw new Error(msg)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Types (API shapes) ──────────────────────────────────────────────────────

export interface ApiAircraft {
  id: string
  registration: string
  type: string
  manufacturer: string | null
  mtow_kg: number | null
  mlw_kg: number | null
  mzfw_kg: number | null
  bew_kg: number | null
  max_pax: number | null
  max_fuel_kg: number | null
  cruise_tas_kt: number | null
  fuel_burn_kg_hr: number | null
  flaps: string[]
  notes: string | null
  is_active: boolean
}

export interface ApiAirport {
  id: string
  icao: string
  iata: string | null
  name: string
  city: string | null
  country: string | null
  elevation_ft: number | null
  lat: number | null
  lon: number | null
  is_active: boolean
}

export interface WeatherResult {
  icao: string
  metar: string
  taf: string
  fetchedAt: number
  cached: boolean
}

export interface ComputePayload {
  aircraft_id: string
  airport_id: string
  oat: number
  flap?: string
}

export interface ComputeResult {
  rtow_kg: number
  factor: string
  wat_flap: string
  field_limit_note: string
  detail: {
    wat_kg: number | null
    toda_kg: number | null
    asda_kg: number | null
    mtow_kg: number
    elevation_ft: number
    rwy_m: number | null
    eff_rwy_m: number | null
    oat_c: number
    surface_factor: number
    flap_evaluated: string[]
    field_tables_ready: boolean
  }
}

export interface PayloadInput {
  aircraft_id: string
  dep_id: string
  dest_id: string
  alt_id?: string
  oat: number
  flap?: string
  pax?: number
  cargo_kg?: number
  fuel_kg?: number
  alt_dist_nm?: number
  extra_fuel_kg?: number
  reserve_min?: number
}

export interface PayloadResult {
  fuel: {
    trip_kg: number
    trip_lb: number
    alt_kg: number
    alt_lb: number
    cont_kg: number
    cont_lb: number
    reserve_kg: number
    reserve_lb: number
    extra_kg: number
    extra_lb: number
    total_kg: number
    total_lb: number
  }
  max_payload_kg: number
  payload_kg: number
  zfw_kg: number
  tow_kg: number
  ldw_kg: number
  bew_kg: number
  fob_kg: number
  max_pax: number
  rtow_kg: number
  limiting_factor: string
  trip_nm: number
  max_fuel_kg?: number
  fuel_exceeded?: boolean
  fuel_over_by_kg?: number
}

export interface ApiUser {
  id: string
  username: string
  email: string | null
  full_name: string | null
  role: 'admin' | 'dispatcher'
  is_active: boolean
  last_login: string | null
  created_at: string
}

export interface ApiNavpoint {
  id: string
  ident: string
  name: string | null
  type: string
  country: string | null
  lat: number
  lon: number
}

export interface NavlogInput {
  aircraft_id: string
  waypoints: { kind: 'airport' | 'fix'; id: string }[]
}

export interface NavlogResult {
  aircraft: { id: string; registration: string }
  legs: {
    from_ident: string
    to_ident: string
    from_kind: string
    to_kind: string
    track_deg: number
    dist_nm: number
    ete_min: number
    ete_hhmm: string
    fuel_kg: number
    fuel_lb: number
  }[]
  totals: {
    dist_nm: number
    ete_min: number
    ete_hhmm: string
    fuel_lb: number
    fuel_kg: number
  }
  note: string
}


// ─── Endpoints ────────────────────────────────────────────────────────────────

// Auth — these endpoints return flat objects, not the { success, data } envelope
export const auth = {
  login: (body: { username: string; password: string }) =>
    apiFetch<{ token: string; user: ApiUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: { username: string; password: string; role?: string }) =>
    apiFetch<{ user: ApiUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  refresh: () =>
    apiFetch<{ token: string; user: ApiUser }>('/api/auth/refresh', { method: 'POST' }),
  logout: () =>
    apiFetch<void>('/api/auth/logout', { method: 'POST' }),
  profile: () =>
    apiFetch<ApiUser>('/api/auth/profile'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
}

// ─── API response unwrapper ─────────────────────────────────────────────────
// The backend always wraps responses as { success: true, data: T }.
// This helper unwraps the envelope so callers receive T directly.
async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch<{ success: boolean; data: T }>(path)
  return res.data
}
async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const options: RequestInit = { method: 'POST' }
  if (body !== undefined) options.body = JSON.stringify(body)
  const res = await apiFetch<{ success: boolean; data: T }>(path, options)
  return res.data
}
async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch<{ success: boolean; data: T }>(path, { method: 'PATCH', ...(body ? { body: JSON.stringify(body) } : {}) })
  return res.data
}

// Aircraft
export const aircraft = {
  list: (includeInactive = false) =>
    apiGet<ApiAircraft[]>(`/api/aircraft${includeInactive ? '?includeInactive=true' : ''}`),
  get: (id: string) => apiGet<ApiAircraft>(`/api/aircraft/${id}`),
}

// Airports
export const airports = {
  list: () => apiGet<ApiAirport[]>('/api/airports'),
  search: (q: string) => apiFetch<ApiAirport[]>(`/api/airports/search?q=${encodeURIComponent(q)}`),
  get: (id: string) => apiGet<ApiAirport>(`/api/airports/${id}`),
}

// Weather — backend: { success, data: { metar, taf, ... } }
export const weather = {
  get: (icao: string) => apiGet<WeatherResult>(`/api/weather?icao=${encodeURIComponent(icao)}`),
}

// RTOW Compute
export const compute = {
  rtow: (body: ComputePayload) => apiPost<ComputeResult>('/api/compute', body),
}

// Payload
export const payload = {
  calculate: (body: PayloadInput) => apiPost<PayloadResult>('/api/payload', body),
}

// Users (admin only)
export const users = {
  list: () => apiGet<ApiUser[]>('/api/users'),
  get: (id: string) => apiGet<ApiUser>(`/api/users/${id}`),
  create: (body: Partial<ApiUser> & { password: string }) => apiPost<ApiUser>('/api/users', body),
  deactivate: (id: string) => apiPatch<ApiUser>(`/api/users/${id}/deactivate`),
}

// Health check — /health returns the object directly (no envelope)
export const health = {
  check: () => apiFetch<{ api: string; database: string; uptime: number }>('/health'),
}

// Navpoints — controller returns plain array (no envelope wrapper)
export const navpoints = {
  list: () => apiFetch<ApiNavpoint[]>('/api/navpoints'),
  search: (q: string) => apiFetch<ApiNavpoint[]>(`/api/navpoints/search?q=${encodeURIComponent(q)}`),
  legSuggestions: (depId: string, destId: string, limit?: number) =>
    apiFetch<ApiNavpoint[]>(`/api/navpoints/leg-suggestions?dep_id=${depId}&dest_id=${destId}${limit ? `&limit=${limit}` : ''}`),
}

// Navlog — returns { success, data: NavlogResult }
export const navlog = {
  generate: (body: NavlogInput) => apiPost<NavlogResult>('/api/navlog', body),
}

