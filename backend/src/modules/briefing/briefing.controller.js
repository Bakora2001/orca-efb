import { generateOFP } from './briefing.service.js'
import { computeRTOW } from '../../services/rtow.service.js'
import { query } from '../../config/database.js'
import asyncHandler from '../../utils/asyncHandler.js'
import AppError from '../../utils/AppError.js'
import { logActivity } from '../config/activity.service.js'

// ── POST /api/briefing/ofp ────────────────────────────────────────
export const ofp = asyncHandler(async (req, res) => {
  const {
    aircraft_id,
    waypoints,
    alt_id,
    alt2_id,
    oat,
    flap,
    dep_date,
    dep_time,
    extra_fuel_lb,
    reserve_min,
    include_weather,
  } = req.body

  if (!aircraft_id || !Array.isArray(waypoints) || waypoints.length < 2 || oat == null) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id, waypoints (min 2) and oat are required',
    })
  }

  const pdfBuffer = await generateOFP({
    aircraft_id,
    waypoints,
    alt_id:          alt_id   || null,
    alt2_id:         alt2_id  || null,
    oat:             parseFloat(oat),
    flap:            flap || 'auto',
    dep_date:        dep_date  || null,
    dep_time:        dep_time  || null,
    extra_fuel_lb:   parseFloat(extra_fuel_lb ?? 0),
    reserve_min:     reserve_min != null ? parseFloat(reserve_min) : null,
    include_weather: include_weather !== false,
  })

  // Build filename
  const depIcao  = waypoints[0]?.icao ?? 'DEP'
  const destIcao = waypoints[waypoints.length - 1]?.icao ?? 'DEST'
  const dateStr  = (dep_date || new Date().toISOString().slice(0,10)).replace(/-/g,'')
  const filename = `OFP_${depIcao}_${destIcao}_${dateStr}.pdf`

  // Fire-and-forget audit log
  logActivity({
    userId: req.user?.id,
    action: 'OFP_GENERATED',
    tableName: 'briefing',
    newData: { aircraft_id, dep: waypoints[0]?.id, dest: waypoints[waypoints.length - 1]?.id, oat },
    ipAddress: req.ip,
  }).catch(() => {})

  res.set({
    'Content-Type':        'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length':      pdfBuffer.length,
  })
  res.end(pdfBuffer)
})

// ── POST /api/briefing/performance-report ─────────────────────────
// Runs the RTOW engine across a temperature range for one or more airports
export const performanceReport = asyncHandler(async (req, res) => {
  const {
    aircraft_id,
    airport_ids,
    oat_min   = 0,
    oat_max   = 40,
    oat_step  = 5,
    flap      = 'auto',
  } = req.body

  if (!aircraft_id || !Array.isArray(airport_ids) || airport_ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'aircraft_id and airport_ids[] are required',
    })
  }

  // Load airports
  const apRes = await query(
    'SELECT id, icao_code, name, elevation_ft, rwy_m, surface FROM airports WHERE id = ANY($1::uuid[])',
    [airport_ids]
  )
  const airports = apRes.rows

  const rows = []
  const oatValues = []
  for (let t = parseFloat(oat_min); t <= parseFloat(oat_max); t += parseFloat(oat_step)) {
    oatValues.push(Math.round(t * 10) / 10)
  }

  for (const ap of airports) {
    for (const oat of oatValues) {
      try {
        const result = await computeRTOW(aircraft_id, ap.id, oat, flap)
        rows.push({
          airport_id:  ap.id,
          airport:     ap.name,
          icao:        ap.icao_code,
          elev_ft:     ap.elevation_ft,
          rwy_m:       ap.rwy_m,
          surface:     ap.surface,
          oat_c:       oat,
          rtow_kg:     result.rtow_kg,
          factor:      result.factor,
          wat_flap:    result.wat_flap,
          wat_kg:      result.detail?.wat_kg   ?? null,
          toda_kg:     result.detail?.toda_kg  ?? null,
          asda_kg:     result.detail?.asda_kg  ?? null,
          field_note:  result.field_limit_note,
        })
      } catch (err) {
        rows.push({
          airport_id: ap.id,
          airport:    ap.name,
          icao:       ap.icao_code,
          oat_c:      oat,
          error:      err.message,
        })
      }
    }
  }

  res.json({ success: true, data: { rows, note: `${rows.length} data points across ${airports.length} airport(s)` } })
})

// ── POST /api/briefing/performance-report/pdf ─────────────────────
export const performanceReportPdf = asyncHandler(async (req, res) => {
  // Reuse the JSON report endpoint logic to get rows, then render to PDF
  // We call the same service function by faking a local invocation
  const {
    aircraft_id, airport_ids,
    oat_min = 0, oat_max = 40, oat_step = 5, flap = 'auto',
  } = req.body

  if (!aircraft_id || !Array.isArray(airport_ids) || airport_ids.length === 0) {
    return res.status(400).json({ success: false, message: 'aircraft_id and airport_ids[] are required' })
  }

  const apRes = await query(
    'SELECT id, icao_code, name, elevation_ft, rwy_m, surface FROM airports WHERE id = ANY($1::uuid[])',
    [airport_ids]
  )
  const airports = apRes.rows
  const rows = []
  const oatValues = []
  for (let t = parseFloat(oat_min); t <= parseFloat(oat_max); t += parseFloat(oat_step)) {
    oatValues.push(Math.round(t * 10) / 10)
  }

  for (const ap of airports) {
    for (const oat of oatValues) {
      try {
        const result = await computeRTOW(aircraft_id, ap.id, oat, flap)
        rows.push({ icao: ap.icao_code, name: ap.name, elev_ft: ap.elevation_ft,
          rwy_m: ap.rwy_m, oat_c: oat, rtow_kg: result.rtow_kg,
          factor: result.factor, wat_flap: result.wat_flap })
      } catch (err) {
        rows.push({ icao: ap.icao_code, name: ap.name, oat_c: oat, error: err.message })
      }
    }
  }

  // Build PDF
  const { default: PDFDocument } = await import('pdfkit')
  const doc = new PDFDocument({ size: 'A4', margin: 36 })
  const chunks = []
  doc.on('data', c => chunks.push(c))

  // Header
  doc.rect(36, 36, doc.page.width - 72, 24).fill('#050d1f')
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
    .text('PERFORMANCE REPORT', 48, 43)
  doc.fillColor('#38beff').fontSize(9).font('Helvetica')
    .text(`OAT ${oat_min}°C to ${oat_max}°C, step ${oat_step}°C`, 280, 44)
  doc.y = 72

  // Table headers
  const cols = [
    { label: 'ICAO',    x: 36,  w: 50 },
    { label: 'AIRPORT', x: 90,  w: 130 },
    { label: 'ELEV',    x: 224, w: 40 },
    { label: 'RWY(m)',  x: 268, w: 50 },
    { label: 'OAT°C',  x: 322, w: 40 },
    { label: 'RTOW kg', x: 366, w: 60 },
    { label: 'FACTOR',  x: 430, w: 50 },
    { label: 'FLAP',    x: 484, w: 40 },
  ]

  doc.rect(36, doc.y, doc.page.width - 72, 14).fill('#0d1e3a')
  cols.forEach(c => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
      .text(c.label, c.x, doc.y + 4, { width: c.w })
  })
  doc.y += 14

  rows.forEach((row, i) => {
    if (doc.y > doc.page.height - 60) { doc.addPage(); doc.y = 36 }
    if (i % 2 === 0) doc.rect(36, doc.y, doc.page.width - 72, 13).fill('#e8edf5')
    const vals = row.error
      ? [row.icao, row.name, '—', '—', String(row.oat_c), 'ERR', row.error.slice(0,20), '—']
      : [row.icao, row.name, String(row.elev_ft ?? '—'), String(row.rwy_m ?? '—'),
         String(row.oat_c), row.rtow_kg.toLocaleString(), row.factor, String(row.wat_flap)]

    cols.forEach((c, ci) => {
      doc.fillColor(ci === 5 ? '#00d68f' : '#050d1f')
        .font(ci === 5 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
        .text(vals[ci] ?? '—', c.x, doc.y + 3, { width: c.w })
    })
    doc.y += 13
  })

  doc.end()
  await new Promise(resolve => doc.on('end', resolve))
  const buf = Buffer.concat(chunks)

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="performance_report.pdf"',
    'Content-Length': buf.length,
  })
  res.end(buf)
})