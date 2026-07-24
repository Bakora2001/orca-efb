/**
 * briefing.service.js
 * ────────────────────
 * Generates the full Operational Flight Plan (OFP) / Crew Brief PDF.
 * Uses PDFKit to assemble: company header, flight ID block, weight + fuel
 * summary, leg-by-leg navlog table, aerodrome briefs, and METAR/TAF weather.
 *
 * Install: npm install pdfkit
 */

import PDFDocument from 'pdfkit'
import { query } from '../../config/database.js'
import { calculatePayload } from '../payload/payload.service.js'
import { buildNavlog } from '../navlog/navlog.service.js'
import { getWeather } from '../weather/weather.service.js'
import AppError from '../../utils/AppError.js'

// ─── Colour palette (matches design system) ──────────────────────
const NAVY  = '#050d1f'
const BLUE  = '#1a6fff'
const SKY   = '#38beff'
const GREEN = '#00d68f'
const AMBER = '#ffb400'
const WHITE = '#ffffff'
const LGREY = '#e8edf5'
const DGREY = '#555555'

// ── Main entry point ──────────────────────────────────────────────
export async function generateOFP({
  aircraft_id,
  waypoints,
  alt_id      = null,
  alt2_id     = null,
  oat,
  flap        = 'auto',
  dep_date    = null,
  dep_time    = null,
  extra_fuel_lb = 0,
  reserve_min   = null,
  include_weather = true,
}) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    throw new AppError('At least 2 waypoints required', 400)
  }

  const dep_id  = waypoints[0].id
  const dest_id = waypoints[waypoints.length - 1].id

  // ── Parallel data fetch ───────────────────────────────────────
  const [payloadData, navlogData, depAp, destAp, altAp, alt2Ap, aircraft, config] =
    await Promise.all([
      calculatePayload({ aircraft_id, dep_id, dest_id, alt_id, oat, flap, extra_fuel_lb, reserve_min }),
      buildNavlog(aircraft_id, waypoints),
      fetchAirport(dep_id),
      fetchAirport(dest_id),
      alt_id  ? fetchAirport(alt_id)  : null,
      alt2_id ? fetchAirport(alt2_id) : null,
      fetchAircraft(aircraft_id),
      fetchConfig(),
    ])

  // ── Weather (optional, non-blocking) ─────────────────────────
  let depWx = null, destWx = null, altWx = null
  if (include_weather) {
    const wxResults = await Promise.allSettled([
      depAp?.icao_code  ? getWeather(depAp.icao_code)  : Promise.resolve(null),
      destAp?.icao_code ? getWeather(destAp.icao_code) : Promise.resolve(null),
      altAp?.icao_code  ? getWeather(altAp.icao_code)  : Promise.resolve(null),
    ])
    depWx  = wxResults[0].status === 'fulfilled' ? wxResults[0].value : null
    destWx = wxResults[1].status === 'fulfilled' ? wxResults[1].value : null
    altWx  = wxResults[2].status === 'fulfilled' ? wxResults[2].value : null
  }

  // ── Build PDF ─────────────────────────────────────────────────
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    info: {
      Title: `OFP ${depAp?.icao_code ?? '????'}-${destAp?.icao_code ?? '????'}`,
      Author: config.company_name || 'Orca Aviation',
      Creator: 'Orca EFB',
    },
  })

  const chunks = []
  doc.on('data', chunk => chunks.push(chunk))

  // ── Build PDF ─────────────────────────────────────────────────
  drawHeader(doc, config, dep_date, dep_time, aircraft)
  drawFlightBlock(doc, aircraft, depAp, destAp, altAp, alt2Ap, oat, payloadData, dep_date, dep_time)
  drawWeightFuelTable(doc, payloadData)
  
  drawNavlog(doc, navlogData, payloadData)
  
  drawAerodromeBriefs(doc, [depAp, destAp, altAp, alt2Ap].filter(Boolean))
  
  if (include_weather && (depWx || destWx || altWx)) {
    drawWeatherSection(doc, [
      { label: `${depAp?.icao_code} DEP`, wx: depWx },
      { label: `${destAp?.icao_code} DEST`, wx: destWx },
      altAp ? { label: `${altAp.icao_code} ALT`, wx: altWx } : null,
    ].filter(Boolean))
  }

  doc.end()

  // Wait for PDF to finish generating
  await new Promise(resolve => doc.on('end', resolve))

  return Buffer.concat(chunks)
}

// ── Drawing functions ─────────────────────────────────────────────

function drawDivider(doc) {
  doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor('#dddddd').lineWidth(1).stroke()
  doc.moveDown(0.5)
  doc.fillColor('#000000') // reset
}

function drawSectionTitle(doc, title) {
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#000000')
    .text(title, 36, doc.y)
  doc.moveDown(0.5)
}

function drawHeader(doc, config, depDate, depTime, ac) {
  doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
    .text(`${config.company_name || 'Orca Aviation'} — Operational Flight Plan`, 36, 36)

  const dateStr = depDate
    ? `${depDate}${depTime ? ' ' + depTime + 'Z' : ''}`
    : new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z'
    
  const acStr = ac ? `${ac.registration} (${ac.type})` : 'Unknown Aircraft'

  doc.fontSize(9).font('Helvetica')
    .text(`Generated ${dateStr} · ${acStr}`, 36, 54)
    
  doc.y = 80
}

function drawFlightBlock(doc, ac, dep, dest, alt, alt2, oat, pd, depDate, depTime) {
  drawSectionTitle(doc, 'FLIGHT SUMMARY')

  const col1 = 36, col2 = 180
  const row = (label, val) => {
    doc.font('Helvetica').fontSize(9).text(label, col1, doc.y)
    doc.font('Helvetica').text(val || '—', col2, doc.y - 10.5)
  }

  const route = `${dep?.icao_code ?? '????'} -> ${dest?.icao_code ?? '????'}`
  const acStr = ac ? `${ac.registration} (${ac.type})` : '—'
  const dateStr = depDate || new Date().toISOString().slice(0, 10)
  const timeStr = depTime ? `${depTime} UTC` : '—'
  
  const rtowStr = `${pd.rtow_kg.toLocaleString()} kg (${Math.round(pd.rtow_kg * 2.20462).toLocaleString()} lb) — ${pd.rtow_factor}`
  const payloadStr = `${pd.payload_kg.toLocaleString()} kg » ${pd.pax} pax @ ${pd.pax_weight_kg} kg (limit: ${pd.payload_governing})`
  const distStr = `${pd.trip_nm} nm`

  row('Route', route)
  row('Aircraft', acStr)
  row('Flight date', dateStr)
  row('Est. departure (ETD)', timeStr)
  row('Departure OAT', `${oat} °C`)
  row('RTOW', rtowStr)
  row('Payload', payloadStr)
  row('Trip distance', distStr)

  doc.y += 15
  drawDivider(doc)
}

function drawWeightFuelTable(doc, pd) {
  drawSectionTitle(doc, 'FUEL PLAN (lb)')

  const col1 = 36, col2 = 180
  const row = (label, val, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(label, col1, doc.y)
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').text(val, col2, doc.y - 10.5)
  }

  row('Trip', pd.fuel.trip_lb.toLocaleString())
  row('Alternate', pd.fuel.alt_lb.toLocaleString())
  row('Contingency', pd.fuel.cont_lb.toLocaleString())
  row('Final reserve', pd.fuel.reserve_lb.toLocaleString())
  row('Extra / tankering', pd.fuel.extra_lb.toLocaleString())
  row('TOTAL', `${pd.fuel.total_lb.toLocaleString()}  (${pd.fuel.total_kg.toLocaleString()} kg)`, true)

  doc.y += 15
  drawDivider(doc)
}

function drawNavlog(doc, navlog, pd) {
  drawSectionTitle(doc, 'NAVLOG')

  const cols = [
    { label: 'From',    x: 40,  w: 40  },
    { label: 'To',      x: 80,  w: 40  },
    { label: 'Airway',  x: 120, w: 50  },
    { label: 'Track',   x: 170, w: 40  },
    { label: 'Dist nm', x: 210, w: 50  },
    { label: 'ETE',     x: 260, w: 40  },
    { label: 'Fuel lb', x: 300, w: 50  },
  ]

  // Header row with light grey background
  doc.rect(36, doc.y - 2, doc.page.width - 72, 14).fill('#f4f4f4')
  doc.fillColor('#000000')
  cols.forEach(c => {
    doc.font('Helvetica-Bold').fontSize(9).text(c.label, c.x, doc.y, { width: c.w })
  })
  doc.y += 14

  // Legs
  navlog.legs.forEach((leg, idx) => {
    // Subtle alternating row color
    if (idx % 2 === 1) {
       doc.rect(36, doc.y, doc.page.width - 72, 12).fill('#fafafa')
       doc.fillColor('#000000')
    }

    const vals = [
      leg.from_ident,
      leg.to_ident,
      'DCT',
      String(leg.track_deg) + '°',
      String(leg.dist_nm),
      leg.ete_hhmm,
      leg.fuel_lb.toLocaleString(),
    ]
    const rowY = doc.y + 1.5
    cols.forEach((c, ci) => {
      doc.font('Helvetica').fontSize(9).text(vals[ci], c.x, rowY, { width: c.w })
    })
    doc.y += 12
  })

  // Totals row (with top border)
  doc.moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).strokeColor('#cccccc').lineWidth(1).stroke()
  doc.fillColor('#000000')
  doc.y += 3
  
  const tRowY = doc.y
  doc.font('Helvetica-Bold').fontSize(9).text('TOTAL', cols[0].x, tRowY, { width: cols[0].w })
  doc.text(String(navlog.totals.dist_nm), cols[4].x, tRowY, { width: cols[4].w })
  doc.text(navlog.totals.ete_hhmm, cols[5].x, tRowY, { width: cols[5].w })
  doc.text(navlog.totals.fuel_lb.toLocaleString(), cols[6].x, tRowY, { width: cols[6].w })
  doc.y += 16
  
  doc.font('Helvetica').fontSize(8).fillColor('#888888')
    .text("Airway 'DCT' = direct great-circle leg. Named airways require licensed nav data; enter manually where known.", 36, doc.y)
    
  doc.y += 20
  doc.fillColor('#000000')
  drawDivider(doc)
}

function drawAerodromeBriefs(doc, airports) {
  drawSectionTitle(doc, 'AERODROMES')

  airports.forEach((ap, idx) => {
    if (!ap) return
    const type = idx === 0 ? 'DEP' : idx === 1 ? 'DEST' : 'ALT'
    
    // Bold ICAO and light text
    doc.font('Helvetica-Bold').fontSize(9).text(`${type}: ${ap.name || 'Unknown Airport'} (${ap.icao_code})`, 36, doc.y, { continued: true })
    doc.font('Helvetica').text(` — Elev ${ap.elevation_ft != null ? ap.elevation_ft : '—'} ft · Rwy ${ap.rwy_m || '—'} m ${ap.surface || ''} [AIP]`)
    
    doc.y += 6
  })
  
  doc.y += 10
  drawDivider(doc)
}

function drawWeatherSection(doc, items) {
  drawSectionTitle(doc, 'WEATHER (METAR / TAF)')

  items.forEach(({ label, wx }) => {
    if (!wx) return
    
    const icao = label.split(' ')[0]
    
    doc.font('Helvetica-Bold').fontSize(9).text(icao, 36, doc.y)
    doc.y += 10

    if (wx.metar) {
      doc.font('Helvetica-Bold').fontSize(8).text('METAR: ', 36, doc.y, { continued: true })
      doc.font('Helvetica').text(wx.metar)
      doc.y += 4
    }
    if (wx.taf) {
      doc.font('Helvetica-Bold').fontSize(8).text('TAF: ', 36, doc.y, { continued: true })
      doc.font('Helvetica').text(wx.taf)
      doc.y += 4
    }

    doc.y += 8
  })
  
  doc.y += 10
  doc.font('Helvetica').fontSize(8).fillColor('#888888')
    .text("Decision-support only. Verify all figures against current AIP, NOTAM, AFM and signed load sheet before flight", 36, doc.y, { align: 'center', width: doc.page.width - 72 })
}

// ── DB helpers ────────────────────────────────────────────────────
async function fetchAirport(id) {
  if (!id) return null
  const { rows } = await query(
    `SELECT id, icao_code, name, city, country, elevation_ft,
            lat, lon, rwy_m, rwy_desc, surface, fuel, remarks, notam_notes
     FROM airports WHERE id = $1`,
    [id]
  )
  return rows[0] || null
}

async function fetchAircraft(id) {
  const { rows } = await query(
    'SELECT id, registration, type, cruise_tas_kt, fuel_burn_kg_hr FROM aircraft WHERE id = $1',
    [id]
  )
  return rows[0] || null
}

async function fetchConfig() {
  const { rows } = await query('SELECT key, value FROM app_config')
  const cfg = {}
  for (const row of rows) cfg[row.key] = row.value
  return cfg
}

function DARK_NAVY() { return '#0d1e3a' }