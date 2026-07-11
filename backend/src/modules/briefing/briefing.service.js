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

  // ── Page 1: Header + Flight ID + Weights + Fuel ──────────────
  drawHeader(doc, config, depAp, destAp, dep_date, dep_time)
  drawFlightBlock(doc, aircraft, depAp, destAp, altAp, alt2Ap, oat, payloadData)
  drawWeightFuelTable(doc, payloadData)
  doc.addPage()

  // ── Page 2: Navlog ────────────────────────────────────────────
  drawNavlog(doc, navlogData, payloadData)
  doc.addPage()

  // ── Page 3: Aerodrome Briefs ──────────────────────────────────
  drawAerodromeBriefs(doc, [depAp, destAp, altAp, alt2Ap].filter(Boolean))

  // ── Page 4: Weather (if requested) ───────────────────────────
  if (include_weather && (depWx || destWx || altWx)) {
    doc.addPage()
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

function drawHeader(doc, config, dep, dest, depDate, depTime) {
  // Navy banner
  doc.rect(36, 36, doc.page.width - 72, 48).fill(NAVY)

  doc.fillColor(BLUE).fontSize(18).font('Helvetica-Bold')
    .text(config.company_name || 'ORCA AVIATION', 48, 46)

  doc.fillColor(WHITE).fontSize(10).font('Helvetica')
    .text('OPERATIONAL FLIGHT PLAN', 48, 66)

  // Right side: route + date
  const route = `${dep?.icao_code ?? '????'} → ${dest?.icao_code ?? '????'}`
  const dateStr = depDate
    ? `${depDate}${depTime ? ' ' + depTime + 'Z' : ''}`
    : new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z'

  doc.fillColor(SKY).fontSize(14).font('Helvetica-Bold')
    .text(route, 300, 46, { align: 'right', width: doc.page.width - 350 })

  doc.fillColor(LGREY).fontSize(9).font('Helvetica')
    .text(dateStr, 300, 66, { align: 'right', width: doc.page.width - 350 })

  doc.fillColor(NAVY)
  doc.y = 100
}

function drawFlightBlock(doc, ac, dep, dest, alt, alt2, oat, pd) {
  doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY)
    .text('FLIGHT INFORMATION', 36, doc.y + 8)
  doc.moveTo(36, doc.y + 2).lineTo(doc.page.width - 36, doc.y + 2)
    .strokeColor(BLUE).lineWidth(1).stroke()
  doc.moveDown(0.5)

  const col1 = 36, col2 = 200, col3 = 370
  const row  = (label, val, x, y) => {
    doc.fillColor(DGREY).font('Helvetica').fontSize(8).text(label, x, y)
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(val || '—', x, y + 10)
  }

  const y0 = doc.y
  row('AIRCRAFT REG', ac?.registration, col1, y0)
  row('TYPE',         ac?.type,         col2, y0)
  row('OAT (°C)',     String(oat),       col3, y0)

  const y1 = y0 + 26
  row('DEP',  dep?.icao_code,  col1, y1)
  row('DEST', dest?.icao_code, col2, y1)
  row('ALT1', alt?.icao_code || 'NIL',  col3, y1)

  const y2 = y1 + 26
  row('DEP ELEVATION',  dep?.elevation_ft != null  ? `${dep.elevation_ft}ft`  : '—', col1, y2)
  row('DEST ELEVATION', dest?.elevation_ft != null ? `${dest.elevation_ft}ft` : '—', col2, y2)
  row('ALT2', alt2?.icao_code || 'NIL', col3, y2)

  doc.y = y2 + 36
}

function drawWeightFuelTable(doc, pd) {
  doc.fontSize(9).font('Helvetica-Bold').fillColor(NAVY)
    .text('WEIGHTS & FUEL', 36, doc.y)
  doc.moveTo(36, doc.y + 2).lineTo(doc.page.width - 36, doc.y + 2)
    .strokeColor(BLUE).lineWidth(1).stroke()
  doc.moveDown(0.5)

  // Two-column weight + fuel layout
  const half = (doc.page.width - 72) / 2
  const x1 = 36, x2 = 36 + half + 12

  // Weight column
  const wRows = [
    ['RTOW', `${pd.rtow_kg.toLocaleString()} kg`, pd.factor === 'STRUCT' ? AMBER : GREEN],
    ['TOW',  `${pd.tow_kg.toLocaleString()} kg`,  NAVY],
    ['LW',   `${pd.lw_kg.toLocaleString()} kg`,   pd.lw_limit_ok ? NAVY : '#ff3d57'],
    ['ZFW',  `${pd.zfw_kg.toLocaleString()} kg`,  NAVY],
    ['PAYLOAD', `${pd.payload_kg.toLocaleString()} kg`, GREEN],
    ['MAX PAX',  String(pd.pax), NAVY],
  ]

  // Fuel column
  const fRows = [
    ['TRIP FUEL',   `${pd.fuel.trip_lb.toLocaleString()} lb`],
    ['ALT FUEL',    `${pd.fuel.alt_lb.toLocaleString()} lb`],
    ['CONTINGENCY', `${pd.fuel.cont_lb.toLocaleString()} lb`],
    ['RESERVE',     `${pd.fuel.reserve_lb.toLocaleString()} lb`],
    ['EXTRA',       `${pd.fuel.extra_lb.toLocaleString()} lb`],
    ['TOTAL',       `${pd.fuel.total_lb.toLocaleString()} lb  (${pd.fuel.total_kg.toLocaleString()} kg)`],
  ]

  let y = doc.y
  wRows.forEach(([label, val, color], i) => {
    const rowY = y + i * 16
    if (i % 2 === 0) doc.rect(x1, rowY, half, 15).fill(LGREY)
    doc.fillColor(DGREY).font('Helvetica').fontSize(8).text(label, x1 + 4, rowY + 4)
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(val, x1 + 90, rowY + 4)
  })

  fRows.forEach(([label, val], i) => {
    const rowY = y + i * 16
    if (i % 2 === 0) doc.rect(x2, rowY, half, 15).fill(LGREY)
    doc.fillColor(DGREY).font('Helvetica').fontSize(8).text(label, x2 + 4, rowY + 4)
    doc.fillColor(i === 5 ? GREEN : NAVY).font('Helvetica-Bold').fontSize(8)
      .text(val, x2 + 90, rowY + 4)
  })

  doc.y = y + wRows.length * 16 + 12

  // Governing limit note
  doc.fillColor(AMBER).font('Helvetica-Oblique').fontSize(8)
    .text(`RTOW factor: ${pd.rtow_factor}  |  Payload limit: ${pd.payload_governing}`, 36, doc.y)

  if (pd.field_limit_note) {
    doc.fillColor(DGREY).fontSize(7).text(pd.field_limit_note, 36, doc.y + 10)
  }

  doc.y = doc.y + 24
}

function drawNavlog(doc, navlog, pd) {
  // Page header
  doc.rect(36, 36, doc.page.width - 72, 24).fill(NAVY)
  doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
    .text('NAVLOG', 48, 43)
  doc.fillColor(SKY).fontSize(9).font('Helvetica')
    .text(`${navlog.totals.dist_nm} NM  ·  ${navlog.totals.ete_hhmm} ETE  ·  ${navlog.totals.fuel_lb.toLocaleString()} lb`, 200, 44)

  doc.y = 72

  // Column headers
  const cols = [
    { label: 'FROM',    x: 36,  w: 60  },
    { label: 'TO',      x: 100, w: 60  },
    { label: 'TRK°',   x: 164, w: 44  },
    { label: 'DIST NM',x: 210, w: 60  },
    { label: 'ETE',     x: 272, w: 50  },
    { label: 'FUEL LB', x: 324, w: 70  },
    { label: 'FUEL KG', x: 396, w: 70  },
  ]

  doc.rect(36, doc.y, doc.page.width - 72, 14).fill(DARK_NAVY())
  cols.forEach(c => {
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
      .text(c.label, c.x, doc.y + 3, { width: c.w })
  })
  doc.y += 14

  let cumFuelLb = 0
  navlog.legs.forEach((leg, i) => {
    const rowY = doc.y
    if (i % 2 === 0) doc.rect(36, rowY, doc.page.width - 72, 14).fill(LGREY)
    cumFuelLb += leg.fuel_lb

    const vals = [
      leg.from_ident,
      leg.to_ident,
      String(leg.track_deg) + '°',
      String(leg.dist_nm),
      leg.ete_hhmm,
      leg.fuel_lb.toLocaleString(),
      leg.fuel_kg.toLocaleString(),
    ]
    cols.forEach((c, ci) => {
      doc.fillColor(NAVY).font(ci === 0 || ci === 1 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8).text(vals[ci], c.x, rowY + 3, { width: c.w })
    })
    doc.y += 14
  })

  // Totals row
  doc.rect(36, doc.y, doc.page.width - 72, 16).fill(NAVY)
  doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(8)
    .text('TOTALS', 36, doc.y + 4)
    .text(String(navlog.totals.dist_nm), 210, doc.y + 4)
    .text(navlog.totals.ete_hhmm,        272, doc.y + 4)
    .text(navlog.totals.fuel_lb.toLocaleString(), 324, doc.y + 4)
    .text(navlog.totals.fuel_kg.toLocaleString(), 396, doc.y + 4)
  doc.y += 20
}

function drawAerodromeBriefs(doc, airports) {
  doc.rect(36, 36, doc.page.width - 72, 24).fill(NAVY)
  doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
    .text('AERODROME BRIEFS', 48, 43)
  doc.y = 72

  airports.forEach(ap => {
    if (!ap) return
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10)
      .text(`${ap.icao_code} — ${ap.name}`, 36, doc.y)
    doc.moveDown(0.2)

    const details = [
      ['CITY',      ap.city      || '—'],
      ['COUNTRY',   ap.country   || '—'],
      ['ELEVATION', ap.elevation_ft != null ? `${ap.elevation_ft} ft` : '—'],
      ['RUNWAY',    ap.rwy_m     ? `${ap.rwy_m} m` : '—'],
      ['RWY DESC',  ap.rwy_desc  || '—'],
      ['SURFACE',   ap.surface   || '—'],
      ['FUEL',      ap.fuel      || '—'],
      ['LAT / LON', ap.lat && ap.lon ? `${parseFloat(ap.lat).toFixed(4)}° / ${parseFloat(ap.lon).toFixed(4)}°` : '—'],
    ]

    const y0 = doc.y
    const half = (doc.page.width - 72) / 2
    details.forEach(([label, val], i) => {
      const col = i < 4 ? 36 : 36 + half + 12
      const row = i < 4 ? i : i - 4
      const rowY = y0 + row * 16
      doc.rect(col, rowY, half, 15).fill(i % 2 === 0 ? LGREY : WHITE)
      doc.fillColor(DGREY).font('Helvetica').fontSize(8).text(label, col + 4, rowY + 4)
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8).text(val, col + 80, rowY + 4)
    })

    doc.y = y0 + 4 * 16 + 4

    if (ap.remarks) {
      doc.fillColor(DGREY).font('Helvetica-Oblique').fontSize(7)
        .text(`REMARKS: ${ap.remarks}`, 36, doc.y, { width: doc.page.width - 72 })
      doc.moveDown(0.3)
    }
    if (ap.notam_notes) {
      doc.fillColor('#cc6600').font('Helvetica-Oblique').fontSize(7)
        .text(`NOTAM: ${ap.notam_notes}`, 36, doc.y, { width: doc.page.width - 72 })
      doc.moveDown(0.3)
    }

    doc.moveDown(0.8)
  })
}

function drawWeatherSection(doc, items) {
  doc.rect(36, 36, doc.page.width - 72, 24).fill(NAVY)
  doc.fillColor(WHITE).fontSize(11).font('Helvetica-Bold')
    .text('WEATHER', 48, 43)
  doc.y = 72

  items.forEach(({ label, wx }) => {
    if (!wx) return
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9)
      .text(label, 36, doc.y)
    doc.moveDown(0.2)

    if (wx.metar) {
      doc.fillColor(DGREY).font('Helvetica-Bold').fontSize(8).text('METAR', 36, doc.y)
      doc.fillColor(NAVY).font('Courier').fontSize(8)
        .text(wx.metar, 36, doc.y + 10, { width: doc.page.width - 72 })
      doc.moveDown(0.5)
    }
    if (wx.taf) {
      doc.fillColor(DGREY).font('Helvetica-Bold').fontSize(8).text('TAF', 36, doc.y)
      doc.fillColor(NAVY).font('Courier').fontSize(8)
        .text(wx.taf, 36, doc.y + 10, { width: doc.page.width - 72 })
      doc.moveDown(0.5)
    }

    doc.moveDown(0.6)
  })
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