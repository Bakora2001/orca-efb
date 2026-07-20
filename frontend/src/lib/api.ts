/**
 * api.ts — Orca EFB Central API Client
 *
 * Auth strategy:
 *   • Access token stored in memory only (never localStorage / sessionStorage)
 *   • Refresh token lives in an httpOnly cookie — XSS cannot read it
 *   • On 401, automatically calls POST /api/auth/refresh to get a new access token
 *   • On failed refresh (cookie expired / revoked), clears state and redirects to /login
 */

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

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

// ─── Authenticated blob fetcher ───────────────────────────────────────────────
// Use for protected endpoints that return binary data (images, PDFs).
// Returns a blob: URL — caller MUST call URL.revokeObjectURL() when done.

export async function fetchBlobUrl(path: string): Promise<string> {
  const headers: Record<string, string> = {}
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  let res = await fetch(`${BASE_URL}${path}`, {
    headers,
    credentials: 'include',
  })

  if (res.status === 401) {
    // try refresh once
    if (!_refreshing) {
      _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
    }
    const refreshed = await _refreshing
    if (refreshed) {
      const headers2: Record<string, string> = {}
      if (_accessToken) headers2['Authorization'] = `Bearer ${_accessToken}`
      res = await fetch(`${BASE_URL}${path}`, { headers: headers2, credentials: 'include' })
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try {
      const body = await res.json()
      msg = body.message || body.error || msg
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  const blob = await res.blob()
  return URL.createObjectURL(blob)
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
  country_iso: string | null
  region: string | null
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
  extra_fuel_lb?: number  // alternative to extra_fuel_kg (backend accepts both)
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
  pax: number
  rtow_kg: number
  rtow_factor: string
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
  point_type: string   // 'WAYPOINT' | 'VOR' | 'NDB' | 'INTERSECTION' | 'USER' | 'AIRPORT'
  type?: string        // legacy alias
  country?: string | null
  lat: number
  lon: number
  region?: string | null
  provider?: string | null
}


export interface ApiAirwaySegment {
  id: string
  route_name: string
  from_ident: string
  from_lat: number
  from_lon: number
  to_ident: string
  to_lat: number
  to_lon: number
  lower_limit: string | null
  upper_limit: string | null
  direction: string | null
  provider: string | null
  effective_date: string | null
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
async function apiDelete<T>(path: string): Promise<T> {
  const res = await apiFetch<{ success: boolean; data: T }>(path, { method: 'DELETE' })
  return res.data
}

// Aircraft
export const aircraft = {
  list: (includeInactive = false) =>
    apiGet<ApiAircraft[]>(`/api/aircraft${includeInactive ? '?includeInactive=true' : ''}`),
  get: (id: string) => apiGet<ApiAircraft>(`/api/aircraft/${id}`),
  create: (data: Partial<ApiAircraft>) => apiPost<ApiAircraft>('/api/aircraft', data),
  update: (id: string, data: Partial<ApiAircraft>) => apiPatch<ApiAircraft>(`/api/aircraft/${id}`, data),
  delete: (id: string) => apiDelete<void>(`/api/aircraft/${id}`),
  bulkImport: (data: Partial<ApiAircraft>[]) => apiPost<{ imported: number }>('/api/aircraft/bulk', { aircrafts: data }),
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
  list: () => apiFetch<ApiNavpoint[]>('/api/navpoints/all'),
  search: (q: string) => apiFetch<ApiNavpoint[]>(`/api/navpoints/search?q=${encodeURIComponent(q)}`),
  legSuggestions: (depId: string, destId: string, limit?: number, attempt?: number) =>
    apiFetch<ApiNavpoint[]>(`/api/navpoints/leg-suggestions?dep_id=${depId}&dest_id=${destId}${limit ? `&limit=${limit}` : ''}${attempt ? `&attempt=${attempt}` : ''}`),
}

// Navlog — returns { success, data: NavlogResult }
export const navlog = {
  generate: (body: NavlogInput) => apiPost<NavlogResult>('/api/navlog', body),
}

// Airways — real published route segments (Victor/Jet airways), scoped to
// a map viewport bbox. Controller returns a plain array (no envelope), same
// pattern as `navpoints`.
export const airways = {
  getByBbox: (
    bounds: { south: number; north: number; west: number; east: number },
    limit = 1500
  ) => {
    const q = new URLSearchParams({
      south: String(bounds.south),
      north: String(bounds.north),
      west:  String(bounds.west),
      east:  String(bounds.east),
      limit: String(limit),
    })
    return apiFetch<ApiAirwaySegment[]>(`/api/airways?${q.toString()}`)
  },
}

// Activity / audit log
export interface ApiActivity {
  id: string
  action: string
  table_name: string | null
  record_id: string | null
  new_data: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  username: string | null
  full_name: string | null
}

export const activity = {
  recent: (limit = 20) => apiGet<ApiActivity[]>(`/api/activity?limit=${limit}`),
}

export interface ChartDataParams {
  aircraft_id: string
  airport_id: string
  oat: number
  flap?: string
  table_type?: string
}

export interface WatCurvePoint { temp_c: number; value_kg: number }
export interface WatCurve { elevation_ft: number; points: WatCurvePoint[] }
export interface WatFlapData { flap: string; curves: WatCurve[]; interpolated_kg: number | null }
export interface WatChartData {
  flap_used: string | null
  interpolated_kg: number | null
  oat_c: number
  elevation_ft: number
  flapCurves: WatFlapData[]
}

export interface FieldWeightPoint {
  weight_kg: number
  required_m: number
}
export interface FieldWeightMatrixRow {
  weight_kg: number
  temp_20: number | null
  temp_30: number | null
  temp_40: number | null
}
export interface FieldFlapData {
  flap: string
  weight_points: FieldWeightPoint[]
  weight_matrix: FieldWeightMatrixRow[]
  limiting_weight_kg: number | null
}
export interface FieldChartData {
  available_rwy_m: number | null
  eff_rwy_m: number | null
  surface_factor: number
  limiting_weight_kg: number | null
  oat_c: number
  elevation_ft: number
  flapData: FieldFlapData[]
}

export interface ChartDataResult {
  aircraft: { id: string; registration: string; type: string; mtow_kg: number }
  airport:  { id: string; icao: string; name: string; elevation_ft: number; rwy_m: number | null; surface: string | null }
  oat_c: number
  flap: string
  wat:  WatChartData | null
  toda: FieldChartData | null
  asda: FieldChartData | null
}

export const performanceChart = {
  getData: (params: ChartDataParams) => {
    const q = new URLSearchParams({
      aircraft_id: params.aircraft_id,
      airport_id:  params.airport_id,
      oat:         String(params.oat),
      ...(params.flap       ? { flap: params.flap }             : {}),
      ...(params.table_type ? { table_type: params.table_type } : {}),
    })
    return apiGet<ChartDataResult>(`/api/performance/chart-data?${q.toString()}`)
  },

  /** Returns a URL that, when fetched, serves a JPEG of the AFM chart with
   *  the nomograph solution lines drawn on top.  Call this from an <img src> */
  chartImageUrl: (params: {
    aircraft_id: string
    airport_id:  string
    table_type:  string
    flap:        string
    oat:         number
    rtow_kg?:    number | null
    factor?:     string | null
  }) => {
    const q = new URLSearchParams({
      aircraft_id: params.aircraft_id,
      airport_id:  params.airport_id,
      table_type:  params.table_type,
      flap:        params.flap,
      oat:         String(params.oat),
      ...(params.rtow_kg != null ? { rtow_kg: String(params.rtow_kg) } : {}),
      ...(params.factor          ? { factor:  params.factor }          : {}),
    })
    return `/api/performance/chart-image?${q.toString()}`
  },
}


export const performanceReport = {
  generate: (body: any) => apiPost<any>('/api/performance/report', body),
  downloadPdfUrl: '/api/performance/report/pdf'
}

// ─── OFP / Briefing ────────────────────────────────────────────────────────────
export interface OfpInput {
  aircraft_id: string
  waypoints: { kind: 'airport' | 'fix'; id: string }[]
  alt_id?: string | null
  alt2_id?: string | null
  oat: number
  flap?: string
  dep_date?: string | null
  dep_time?: string | null
  extra_fuel_lb?: number
  reserve_min?: number | null
  include_weather?: boolean
}

export const briefing = {
  /** Returns a PDF blob — caller must handle raw fetch */
  ofpUrl: '/api/briefing/ofp',
}


// /**
//  * api.ts — Orca EFB Central API Client
//  *
//  * Auth strategy:
//  *   • Access token stored in memory only (never localStorage / sessionStorage)
//  *   • Refresh token lives in an httpOnly cookie — XSS cannot read it
//  *   • On 401, automatically calls POST /api/auth/refresh to get a new access token
//  *   • On failed refresh (cookie expired / revoked), clears state and redirects to /login
//  */

// export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

// // ─── In-memory token store ────────────────────────────────────────────────────
// // Stored as a module-level variable. Not accessible from outside this module.

// let _accessToken: string | null = null
// let _user: { id: string; username: string; role: string; full_name?: string | null } | null = null
// let _refreshing: Promise<boolean> | null = null  // deduplicate concurrent refresh calls

// export function setSession(token: string, user: typeof _user): void {
//   _accessToken = token
//   _user = user
// }

// export function getToken(): string | null {
//   return _accessToken
// }

// export function getUser(): typeof _user {
//   return _user
// }

// export function clearSession(): void {
//   _accessToken = null
//   _user = null
// }

// export function logout(): void {
//   // Fire-and-forget: tell the server to clear the httpOnly cookie
//   fetch(`${BASE_URL}/api/auth/logout`, {
//     method:      'POST',
//     credentials: 'include',
//     headers:     _accessToken ? { Authorization: `Bearer ${_accessToken}` } : {},
//   }).catch(() => { /* ignore network errors on logout */ })

//   clearSession()
//   window.location.href = '/login'
// }

// // ─── Refresh access token ─────────────────────────────────────────────────────

// async function refreshAccessToken(): Promise<boolean> {
//   try {
//     const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
//       method:      'POST',
//       credentials: 'include', // sends the httpOnly refreshToken cookie
//     })
//     if (!res.ok) return false

//     const body = await res.json()
//     const data = body.data || body
//     if (data.token && data.user) {
//       setSession(data.token, data.user)
//       return true
//     }
//     return false
//   } catch {
//     return false
//   }
// }

// // ─── Core fetch wrapper ───────────────────────────────────────────────────────

// async function apiFetch<T>(
//   path: string,
//   options: RequestInit = {},
//   isRetry = false
// ): Promise<T> {
//   const headers: Record<string, string> = {
//     'Content-Type': 'application/json',
//     ...(options.headers as Record<string, string>),
//   }
//   if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

//   const res = await fetch(`${BASE_URL}${path}`, {
//     ...options,
//     headers,
//     credentials: 'include', // always include cookies for refresh endpoint
//   })

//   // Auto-refresh on 401 (once)
//   if (res.status === 401 && !isRetry) {
//     // Deduplicate: if a refresh is already in flight, wait for it
//     if (!_refreshing) {
//       _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
//     }
//     const refreshed = await _refreshing

//     if (refreshed) {
//       return apiFetch<T>(path, options, true) // retry with new token
//     }

//     // Refresh failed — session is dead
//     clearSession()
//     window.location.href = '/login'
//     throw new Error('Session expired. Please sign in again.')
//   }

//   if (!res.ok) {
//     let msg = `HTTP ${res.status}`
//     try {
//       const body = await res.json()
//       msg = body.message || body.error || msg
//     } catch { /* ignore parse errors */ }
//     throw new Error(msg)
//   }

//   if (res.status === 204) return undefined as T
//   return res.json() as Promise<T>
// }

// // ─── Authenticated blob fetcher ───────────────────────────────────────────────
// // Use for protected endpoints that return binary data (images, PDFs).
// // Returns a blob: URL — caller MUST call URL.revokeObjectURL() when done.

// export async function fetchBlobUrl(path: string): Promise<string> {
//   const headers: Record<string, string> = {}
//   if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

//   let res = await fetch(`${BASE_URL}${path}`, {
//     headers,
//     credentials: 'include',
//   })

//   if (res.status === 401) {
//     // try refresh once
//     if (!_refreshing) {
//       _refreshing = refreshAccessToken().finally(() => { _refreshing = null })
//     }
//     const refreshed = await _refreshing
//     if (refreshed) {
//       const headers2: Record<string, string> = {}
//       if (_accessToken) headers2['Authorization'] = `Bearer ${_accessToken}`
//       res = await fetch(`${BASE_URL}${path}`, { headers: headers2, credentials: 'include' })
//     }
//   }

//   if (!res.ok) {
//     let msg = `HTTP ${res.status}`
//     try {
//       const body = await res.json()
//       msg = body.message || body.error || msg
//     } catch { /* ignore */ }
//     throw new Error(msg)
//   }

//   const blob = await res.blob()
//   return URL.createObjectURL(blob)
// }

// // ─── Types (API shapes) ──────────────────────────────────────────────────────

// export interface ApiAircraft {
//   id: string
//   registration: string
//   type: string
//   manufacturer: string | null
//   mtow_kg: number | null
//   mlw_kg: number | null
//   mzfw_kg: number | null
//   bew_kg: number | null
//   max_pax: number | null
//   max_fuel_kg: number | null
//   cruise_tas_kt: number | null
//   fuel_burn_kg_hr: number | null
//   flaps: string[]
//   notes: string | null
//   is_active: boolean
// }

// export interface ApiAirport {
//   id: string
//   icao: string
//   iata: string | null
//   name: string
//   city: string | null
//   country: string | null
//   country_iso: string | null
//   region: string | null
//   elevation_ft: number | null
//   lat: number | null
//   lon: number | null
//   is_active: boolean
// }

// export interface WeatherResult {
//   icao: string
//   metar: string
//   taf: string
//   fetchedAt: number
//   cached: boolean
// }

// export interface ComputePayload {
//   aircraft_id: string
//   airport_id: string
//   oat: number
//   flap?: string
// }

// export interface ComputeResult {
//   rtow_kg: number
//   factor: string
//   wat_flap: string
//   field_limit_note: string
//   detail: {
//     wat_kg: number | null
//     toda_kg: number | null
//     asda_kg: number | null
//     mtow_kg: number
//     elevation_ft: number
//     rwy_m: number | null
//     eff_rwy_m: number | null
//     oat_c: number
//     surface_factor: number
//     flap_evaluated: string[]
//     field_tables_ready: boolean
//   }
// }

// export interface PayloadInput {
//   aircraft_id: string
//   dep_id: string
//   dest_id: string
//   alt_id?: string
//   oat: number
//   flap?: string
//   pax?: number
//   cargo_kg?: number
//   fuel_kg?: number
//   alt_dist_nm?: number
//   extra_fuel_kg?: number
//   extra_fuel_lb?: number  // alternative to extra_fuel_kg (backend accepts both)
//   reserve_min?: number
// }

// export interface PayloadResult {
//   fuel: {
//     trip_kg: number
//     trip_lb: number
//     alt_kg: number
//     alt_lb: number
//     cont_kg: number
//     cont_lb: number
//     reserve_kg: number
//     reserve_lb: number
//     extra_kg: number
//     extra_lb: number
//     total_kg: number
//     total_lb: number
//   }
//   max_payload_kg: number
//   payload_kg: number
//   zfw_kg: number
//   tow_kg: number
//   ldw_kg: number
//   bew_kg: number
//   fob_kg: number
//   max_pax: number
//   rtow_kg: number
//   limiting_factor: string
//   trip_nm: number
//   max_fuel_kg?: number
//   fuel_exceeded?: boolean
//   fuel_over_by_kg?: number
// }

// export interface ApiUser {
//   id: string
//   username: string
//   email: string | null
//   full_name: string | null
//   role: 'admin' | 'dispatcher'
//   is_active: boolean
//   last_login: string | null
//   created_at: string
// }

// export interface ApiNavpoint {
//   id: string
//   ident: string
//   name: string | null
//   point_type: string   // 'WAYPOINT' | 'VOR' | 'NDB' | 'INTERSECTION' | 'USER' | 'AIRPORT'
//   type?: string        // legacy alias
//   country?: string | null
//   lat: number
//   lon: number
//   region?: string | null
//   provider?: string | null
// }


// export interface NavlogInput {
//   aircraft_id: string
//   waypoints: { kind: 'airport' | 'fix'; id: string }[]
// }

// export interface NavlogResult {
//   aircraft: { id: string; registration: string }
//   legs: {
//     from_ident: string
//     to_ident: string
//     from_kind: string
//     to_kind: string
//     track_deg: number
//     dist_nm: number
//     ete_min: number
//     ete_hhmm: string
//     fuel_kg: number
//     fuel_lb: number
//   }[]
//   totals: {
//     dist_nm: number
//     ete_min: number
//     ete_hhmm: string
//     fuel_lb: number
//     fuel_kg: number
//   }
//   note: string
// }


// // ─── Endpoints ────────────────────────────────────────────────────────────────

// // Auth — these endpoints return flat objects, not the { success, data } envelope
// export const auth = {
//   login: (body: { username: string; password: string }) =>
//     apiFetch<{ token: string; user: ApiUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
//   register: (body: { username: string; password: string; role?: string }) =>
//     apiFetch<{ user: ApiUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
//   refresh: () =>
//     apiFetch<{ token: string; user: ApiUser }>('/api/auth/refresh', { method: 'POST' }),
//   logout: () =>
//     apiFetch<void>('/api/auth/logout', { method: 'POST' }),
//   profile: () =>
//     apiFetch<ApiUser>('/api/auth/profile'),
//   changePassword: (body: { currentPassword: string; newPassword: string }) =>
//     apiFetch<{ message: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify(body) }),
// }

// // ─── API response unwrapper ─────────────────────────────────────────────────
// // The backend always wraps responses as { success: true, data: T }.
// // This helper unwraps the envelope so callers receive T directly.
// async function apiGet<T>(path: string): Promise<T> {
//   const res = await apiFetch<{ success: boolean; data: T }>(path)
//   return res.data
// }
// async function apiPost<T>(path: string, body?: unknown): Promise<T> {
//   const options: RequestInit = { method: 'POST' }
//   if (body !== undefined) options.body = JSON.stringify(body)
//   const res = await apiFetch<{ success: boolean; data: T }>(path, options)
//   return res.data
// }
// async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
//   const res = await apiFetch<{ success: boolean; data: T }>(path, { method: 'PATCH', ...(body ? { body: JSON.stringify(body) } : {}) })
//   return res.data
// }

// // Aircraft
// export const aircraft = {
//   list: (includeInactive = false) =>
//     apiGet<ApiAircraft[]>(`/api/aircraft${includeInactive ? '?includeInactive=true' : ''}`),
//   get: (id: string) => apiGet<ApiAircraft>(`/api/aircraft/${id}`),
// }

// // Airports
// export const airports = {
//   list: () => apiGet<ApiAirport[]>('/api/airports'),
//   search: (q: string) => apiFetch<ApiAirport[]>(`/api/airports/search?q=${encodeURIComponent(q)}`),
//   get: (id: string) => apiGet<ApiAirport>(`/api/airports/${id}`),
// }

// // Weather — backend: { success, data: { metar, taf, ... } }
// export const weather = {
//   get: (icao: string) => apiGet<WeatherResult>(`/api/weather?icao=${encodeURIComponent(icao)}`),
// }

// // RTOW Compute
// export const compute = {
//   rtow: (body: ComputePayload) => apiPost<ComputeResult>('/api/compute', body),
// }

// // Payload
// export const payload = {
//   calculate: (body: PayloadInput) => apiPost<PayloadResult>('/api/payload', body),
// }

// // Users (admin only)
// export const users = {
//   list: () => apiGet<ApiUser[]>('/api/users'),
//   get: (id: string) => apiGet<ApiUser>(`/api/users/${id}`),
//   create: (body: Partial<ApiUser> & { password: string }) => apiPost<ApiUser>('/api/users', body),
//   deactivate: (id: string) => apiPatch<ApiUser>(`/api/users/${id}/deactivate`),
// }

// // Health check — /health returns the object directly (no envelope)
// export const health = {
//   check: () => apiFetch<{ api: string; database: string; uptime: number }>('/health'),
// }

// // Navpoints — controller returns plain array (no envelope wrapper)
// export const navpoints = {
//   list: () => apiFetch<ApiNavpoint[]>('/api/navpoints/all'),
//   search: (q: string) => apiFetch<ApiNavpoint[]>(`/api/navpoints/search?q=${encodeURIComponent(q)}`),
//   legSuggestions: (depId: string, destId: string, limit?: number) =>
//     apiFetch<ApiNavpoint[]>(`/api/navpoints/leg-suggestions?dep_id=${depId}&dest_id=${destId}${limit ? `&limit=${limit}` : ''}`),
// }

// // Navlog — returns { success, data: NavlogResult }
// export const navlog = {
//   generate: (body: NavlogInput) => apiPost<NavlogResult>('/api/navlog', body),
// }

// // Activity / audit log
// export interface ApiActivity {
//   id: string
//   action: string
//   table_name: string | null
//   record_id: string | null
//   new_data: Record<string, unknown> | null
//   ip_address: string | null
//   created_at: string
//   username: string | null
//   full_name: string | null
// }

// export const activity = {
//   recent: (limit = 20) => apiGet<ApiActivity[]>(`/api/activity?limit=${limit}`),
// }

// export interface ChartDataParams {
//   aircraft_id: string
//   airport_id: string
//   oat: number
//   flap?: string
//   table_type?: string
// }

// export interface WatCurvePoint { temp_c: number; value_kg: number }
// export interface WatCurve { elevation_ft: number; points: WatCurvePoint[] }
// export interface WatFlapData { flap: string; curves: WatCurve[]; interpolated_kg: number | null }
// export interface WatChartData {
//   flap_used: string | null
//   interpolated_kg: number | null
//   oat_c: number
//   elevation_ft: number
//   flapCurves: WatFlapData[]
// }

// export interface FieldWeightPoint {
//   weight_kg: number
//   required_m: number
// }
// export interface FieldWeightMatrixRow {
//   weight_kg: number
//   temp_20: number | null
//   temp_30: number | null
//   temp_40: number | null
// }
// export interface FieldFlapData {
//   flap: string
//   weight_points: FieldWeightPoint[]
//   weight_matrix: FieldWeightMatrixRow[]
//   limiting_weight_kg: number | null
// }
// export interface FieldChartData {
//   available_rwy_m: number | null
//   eff_rwy_m: number | null
//   surface_factor: number
//   limiting_weight_kg: number | null
//   oat_c: number
//   elevation_ft: number
//   flapData: FieldFlapData[]
// }

// export interface ChartDataResult {
//   aircraft: { id: string; registration: string; type: string; mtow_kg: number }
//   airport:  { id: string; icao: string; name: string; elevation_ft: number; rwy_m: number | null; surface: string | null }
//   oat_c: number
//   flap: string
//   wat:  WatChartData | null
//   toda: FieldChartData | null
//   asda: FieldChartData | null
// }

// export const performanceChart = {
//   getData: (params: ChartDataParams) => {
//     const q = new URLSearchParams({
//       aircraft_id: params.aircraft_id,
//       airport_id:  params.airport_id,
//       oat:         String(params.oat),
//       ...(params.flap       ? { flap: params.flap }             : {}),
//       ...(params.table_type ? { table_type: params.table_type } : {}),
//     })
//     return apiGet<ChartDataResult>(`/api/performance/chart-data?${q.toString()}`)
//   },

//   /** Returns a URL that, when fetched, serves a JPEG of the AFM chart with
//    *  the nomograph solution lines drawn on top.  Call this from an <img src> */
//   chartImageUrl: (params: {
//     aircraft_id: string
//     airport_id:  string
//     table_type:  string
//     flap:        string
//     oat:         number
//     rtow_kg?:    number | null
//     factor?:     string | null
//   }) => {
//     const q = new URLSearchParams({
//       aircraft_id: params.aircraft_id,
//       airport_id:  params.airport_id,
//       table_type:  params.table_type,
//       flap:        params.flap,
//       oat:         String(params.oat),
//       ...(params.rtow_kg != null ? { rtow_kg: String(params.rtow_kg) } : {}),
//       ...(params.factor          ? { factor:  params.factor }          : {}),
//     })
//     return `/api/performance/chart-image?${q.toString()}`
//   },
// }


// export const performanceReport = {
//   generate: (body: any) => apiPost<any>('/api/performance/report', body),
//   downloadPdfUrl: '/api/performance/report/pdf'
// }

// // ─── OFP / Briefing ────────────────────────────────────────────────────────────
// export interface OfpInput {
//   aircraft_id: string
//   waypoints: { kind: 'airport' | 'fix'; id: string }[]
//   alt_id?: string | null
//   alt2_id?: string | null
//   oat: number
//   flap?: string
//   dep_date?: string | null
//   dep_time?: string | null
//   extra_fuel_lb?: number
//   reserve_min?: number | null
//   include_weather?: boolean
// }

// export const briefing = {
//   /** Returns a PDF blob — caller must handle raw fetch */
//   ofpUrl: '/api/briefing/ofp',
// }
