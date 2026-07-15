import { computeRTOWBreakdown } from '../../services/rtow.service.js'
import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import asyncHandler from '../../utils/asyncHandler.js'
import PDFDocument from 'pdfkit'
import { logActivity } from '../config/activity.service.js'

function parseTemps(body) {
  let temps = body.temps || []
  if (temps.length === 0) {
    const start = parseFloat(body.temp_start || 20)
    const end = parseFloat(body.temp_end || 40)
    const step = Math.abs(parseFloat(body.temp_step || 5)) || 5
    let t = start
    while (t <= end + 0.001 && temps.length < 40) {
      temps.push(t)
      t += step
    }
  }
  return temps.map(t => parseFloat(t)).filter(t => !isNaN(t))
}

async function buildPerformanceReportData(body) {
  const acId = body.aircraft_id
  let airportIds = body.airport_ids || []
  if (body.airport_id) airportIds.push(body.airport_id)
  airportIds = [...new Set(airportIds)].filter(Boolean)

  const temps = parseTemps(body)

  if (!acId || airportIds.length === 0 || temps.length === 0) {
    throw new AppError('Need aircraft, at least one airport, and temperatures.', 400)
  }

  const { rows: acRows } = await query('SELECT * FROM aircraft WHERE id = $1', [acId])
  if (acRows.length === 0) throw new AppError('Aircraft not found.', 404)
  const ac = acRows[0]

  const { rows: apRows } = await query('SELECT * FROM airports WHERE id = ANY($1::uuid[])', [airportIds])
  if (apRows.length === 0) throw new AppError('Airports not found.', 404)
  const airportById = {}
  apRows.forEach(ap => { airportById[ap.id] = ap })

  const orderedAirports = airportIds.map(id => airportById[id]).filter(Boolean)
  const rows = []
  const requestedFlap = body.flap || 'auto'

  for (const ap of orderedAirports) {
    for (const temp of temps) {
      try {
        const b = await computeRTOWBreakdown(ac.id, ap.id, temp, requestedFlap)
        rows.push({
          airport_id: ap.id,
          airport: ap.name,
          icao: ap.icao_code,
          elev_ft: ap.elevation_ft,
          rwy_m: ap.rwy_m,
          surface: ap.surface,
          oat_c: temp,
          structural_kg: b.structural_kg,
          wat_kg: b.wat_kg,
          wat_flap: b.wat_flap,
          toda_kg: b.toda_kg,
          asda_kg: b.asda_kg,
          rtow_kg: b.rtow_kg,
          factor: b.factor,
          field_tables_ready: b.field_tables_ready
        })
      } catch (err) {
        console.error(`Failed to compute RTOW for ${ap.icao_code} at ${temp}C:`, err.message)
      }
    }
  }

  return {
    aircraft: { id: ac.id, reg: ac.registration, type: ac.type, mtow_kg: ac.mtow_kg },
    flap: requestedFlap,
    temperatures: temps,
    rows,
    note: 'Review-only. Data must be validated against approved AFM/AIP before operational use.'
  }
}

// POST /api/performance/report
export const generateReport = asyncHandler(async (req, res) => {
  const data = await buildPerformanceReportData(req.body)

  // Fire-and-forget audit log
  logActivity({
    userId: req.user?.id,
    action: 'PERFORMANCE_REPORT',
    tableName: 'performance_report',
    newData: { aircraft_id: req.body.aircraft_id, airport_id: req.body.airport_id, flap: req.body.flap, temps: req.body.temps },
    ipAddress: req.ip,
  }).catch(() => {})

  res.json({ success: true, data })
})

// POST /api/performance/report/pdf
export const generatePdfReport = asyncHandler(async (req, res) => {
  const report = await buildPerformanceReportData(req.body)

  const doc = new PDFDocument({ margin: 40, size: 'A4' })

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="Airport_Performance_Report_${report.aircraft.reg}.pdf"`)

  doc.pipe(res)

  // ── Cover / Header ──────────────────────────────────────────────────────────
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#082A63')
     .text('ORCA EFB', { align: 'center' })
  doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E5EFF')
     .text('Airport Performance Report', { align: 'center' })
  doc.moveDown(0.4)

  const now = new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC'
  doc.fontSize(9).font('Helvetica').fillColor('#475569')
     .text(`Aircraft: ${report.aircraft.reg} (${report.aircraft.type})   |   Flap: ${report.flap}   |   Generated: ${now}`, { align: 'center' })

  doc.moveDown(0.5)
  doc.fontSize(8).font('Helvetica-Oblique').fillColor('#DC2626')
     .text(report.note, { align: 'center' })
  doc.fillColor('#000000').moveDown(1)

  // ── Draw horizontal rule ────────────────────────────────────────────────────
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#E2E8F0').stroke()
  doc.moveDown(1)

  // ── Per-airport tables ──────────────────────────────────────────────────────
  const airportGroups = {}
  report.rows.forEach(r => {
    const key = r.icao || r.airport_id
    if (!airportGroups[key]) airportGroups[key] = []
    airportGroups[key].push(r)
  })

  const formatKg = (val) => val == null ? '-' : Math.round(val).toLocaleString() + ' kg'
  const colX = [40, 100, 195, 295, 390, 475]
  const colW = [55, 90, 95, 90, 80, 80]

  for (const [icao, rows] of Object.entries(airportGroups)) {
    const ap = rows[0]

    // Airport sub-header
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#082A63')
       .text(`${ap.airport} (${icao})`)
    doc.fontSize(8).font('Helvetica').fillColor('#64748B')
       .text(`Elevation: ${Math.round(ap.elev_ft ?? 0)} ft   Runway: ${ap.rwy_m ? Math.round(ap.rwy_m) + ' m' : 'N/A'}   Surface: ${ap.surface || 'Unknown'}`)
    doc.moveDown(0.5)

    // Table header row
    const headerY = doc.y
    doc.rect(40, headerY - 2, 515, 16).fillColor('#F1F5F9').fill()
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155')
    doc.text('OAT °C',     colX[0], headerY, { width: colW[0] })
    doc.text('WAT RTOW',   colX[1], headerY, { width: colW[1] })
    doc.text('TODA RTOW',  colX[2], headerY, { width: colW[2] })
    doc.text('ASDA RTOW',  colX[3], headerY, { width: colW[3] })
    doc.text('Governing',  colX[4], headerY, { width: colW[4] })
    doc.text('Factor',     colX[5], headerY, { width: colW[5] })
    doc.moveDown(0.8)

    // Table rows
    doc.font('Helvetica').fontSize(8).fillColor('#1E293B')
    for (const r of rows) {
      if (doc.y > 730) {
        doc.addPage()
        doc.fontSize(8).font('Helvetica').fillColor('#1E293B')
      }
      const rowY = doc.y
      const isWAT    = r.factor === 'WAT'
      const isTODA   = r.factor === 'TODA'
      const isASDA   = r.factor === 'ASDA'

      doc.text(String(r.oat_c) + '°C',  colX[0], rowY, { width: colW[0] })
      doc.fillColor(isWAT  ? '#1E5EFF' : '#1E293B').text(formatKg(r.wat_kg) + (r.wat_flap ? ` F${r.wat_flap}` : ''), colX[1], rowY, { width: colW[1] })
      doc.fillColor(isTODA ? '#1E5EFF' : '#1E293B').text(formatKg(r.toda_kg), colX[2], rowY, { width: colW[2] })
      doc.fillColor(isASDA ? '#1E5EFF' : '#1E293B').text(formatKg(r.asda_kg), colX[3], rowY, { width: colW[3] })
      doc.font('Helvetica-Bold').fillColor('#082A63').text(formatKg(r.rtow_kg), colX[4], rowY, { width: colW[4] })
      doc.font('Helvetica').fillColor('#475569').text(r.factor, colX[5], rowY, { width: colW[5] })
      doc.fillColor('#1E293B').moveDown(0.7)

      // Thin separator
      doc.moveTo(40, doc.y - 3).lineTo(555, doc.y - 3).strokeColor('#F1F5F9').stroke()
    }

    doc.moveDown(1.5)
  }

  doc.end()
})
