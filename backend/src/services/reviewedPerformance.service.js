/**
 * reviewedPerformanceImport.service.js
 * ─────────────────────────────────────
 * Parses and validates the human-reviewed Dash 8 field-performance CSV
 * (produced by export_dash8_field_review_template.py, filled in by hand
 * against real AFM charts). Pure functions — no DB calls.
 *
 * IMPORTANT: distance_m in this CSV is a human chart-read value. Rows with
 * a blank distance_m are drafts and MUST be excluded from import.
 */

const REQUIRED_HEADERS = [
  'aircraft_icao', 'model', 'metric', 'flap', 'weight_kg',
  'elev_ft', 'oat_c', 'distance_m', 'source_chart',
  'reviewer', 'review_date', 'notes',
]

/**
 * Minimal RFC4180-style CSV line parser (handles quoted fields with commas).
 */
function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

/**
 * Parses the CSV text into row objects, validates headers, and splits
 * rows into "reviewed" (has a non-blank distance_m) vs "draft" (blank).
 *
 * @param {string} csvText
 * @returns {{ reviewed: object[], draftCount: number, totalCount: number }}
 */
export function parseReviewedCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length === 0) throw new Error('CSV is empty')

  const headers = parseCsvLine(lines[0]).map(h => h.trim())
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`CSV missing required column: ${required}`)
    }
  }

  const reviewed = []
  let draftCount = 0

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row = {}
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim() })

    if (!row.distance_m) {
      draftCount++
      continue
    }

    const distance_m = Number(row.distance_m)
    const weight_kg = Number(row.weight_kg)
    const elevation_ft = Number(row.elev_ft)
    const temp_c = Number(row.oat_c)
    const flap_setting = Number(row.flap)

    if ([distance_m, weight_kg, elevation_ft, temp_c, flap_setting].some(Number.isNaN)) {
      throw new Error(`Row ${i + 1}: non-numeric value in a required numeric field`)
    }

    reviewed.push({
      aircraft_icao: row.aircraft_icao,
      model: row.model,
      table_type: row.metric,        // TODA | ASDA
      flap_setting,
      weight_kg,
      elevation_ft,
      temp_c,
      value_kg: distance_m,          // distance_m stored in value_kg column
      source_chart: row.source_chart,
      reviewer: row.reviewer || null,
      review_date: row.review_date || null,
      notes: row.notes || null,
    })
  }

  return { reviewed, draftCount, totalCount: lines.length - 1 }
}

/**
 * Builds the source_note string per the doc's required prefix convention.
 * Defaults to ADMIN_REVIEWED if a reviewer is present but no more specific
 * tag was supplied; falls back to AFM_REVIEWED as the standard case here
 * since these are direct AFM chart readings.
 */
export function buildSourceNote(row) {
  const tag = row.reviewer ? 'AFM_REVIEWED' : 'DRAFT'
  const parts = [tag, `chart=${row.source_chart}`]
  if (row.reviewer) parts.push(`reviewer=${row.reviewer}`)
  if (row.review_date) parts.push(`date=${row.review_date}`)
  if (row.notes) parts.push(`notes=${row.notes}`)
  return parts.join(' | ')
}