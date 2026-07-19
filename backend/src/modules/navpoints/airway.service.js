import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'
import { parse } from 'csv-parse/sync'

export async function getAirwaysByBbox(south, north, west, east, limit = 500) {
  if (south == null || north == null || west == null || east == null) {
    throw new AppError('south, north, west, east query params are required', 400)
  }
  const s = parseFloat(south), n = parseFloat(north)
  const w = parseFloat(west), e = parseFloat(east)
  const lim = Math.min(parseInt(limit) || 500, 2000)

  // Match a segment if EITHER endpoint falls inside the viewport, not just
  // the 'from' end. A segment approaching from outside the box (its 'from'
  // point off-screen, 'to' point on-screen) is still part of what the user
  // sees and needs to be drawn — filtering on 'from' alone silently dropped
  // those and produced broken/missing lines when panning.
  const { rows } = await query(
    `SELECT id, route_name, from_ident, from_lat, from_lon,
            to_ident, to_lat, to_lon, lower_limit, upper_limit,
            direction, provider, effective_date
     FROM airways
     WHERE (from_lat BETWEEN $1 AND $2 AND from_lon BETWEEN $3 AND $4)
        OR (to_lat   BETWEEN $1 AND $2 AND to_lon   BETWEEN $3 AND $4)
     ORDER BY route_name ASC
     LIMIT $5`,
    [s, n, w, e, lim]
  )
  return rows
}

export async function getAirwayByName(routeName) {
  const { rows } = await query(
    `SELECT * FROM airways WHERE UPPER(route_name) = UPPER($1) ORDER BY from_ident ASC`,
    [routeName]
  )
  if (rows.length === 0) throw new AppError(`Airway ${routeName.toUpperCase()} not found`, 404)
  return rows
}

/**
 * Import from airway_segments.csv
 * Columns: route_name, seq, from_ident, to_ident, from_lat, from_lon,
 *          to_lat, to_lon, lower_limit, upper_limit, direction,
 *          region, provider, effective_date, source_url, validation_status
 * seq and source_url are ignored (not in our schema).
 */
export async function importAirwaysCsv(csvBuffer, { overwrite = false } = {}) {
  const records = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true })
  let imported = 0, skipped = 0, errors = 0
  const errorDetails = []

  for (const row of records) {
    try {
      const route = (row.route_name || '').toUpperCase().trim()
      const from  = (row.from_ident  || '').toUpperCase().trim()
      const to    = (row.to_ident    || '').toUpperCase().trim()
      if (!route || !from || !to) { skipped++; continue }

      const fromLat = row.from_lat ? parseFloat(row.from_lat) : null
      const fromLon = row.from_lon ? parseFloat(row.from_lon) : null
      const toLat   = row.to_lat   ? parseFloat(row.to_lat)   : null
      const toLon   = row.to_lon   ? parseFloat(row.to_lon)   : null
      if (fromLat == null || isNaN(fromLat)) { skipped++; continue }

      const existing = await query(
        `SELECT id FROM airways WHERE route_name=$1 AND from_ident=$2 AND to_ident=$3`,
        [route, from, to]
      )

      if (existing.rows.length > 0) {
        if (!overwrite) { skipped++; continue }
        await query(
          `UPDATE airways SET from_lat=$1,from_lon=$2,to_lat=$3,to_lon=$4,
              lower_limit=$5,upper_limit=$6,direction=$7,provider=$8,effective_date=$9
           WHERE id=$10`,
          [fromLat,fromLon,toLat,toLon,row.lower_limit||null,row.upper_limit||null,
           row.direction||null,row.provider||null,row.effective_date||null,existing.rows[0].id]
        )
      } else {
        await query(
          `INSERT INTO airways (route_name,from_ident,from_lat,from_lon,to_ident,to_lat,to_lon,
              lower_limit,upper_limit,direction,provider,effective_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [route,from,fromLat,fromLon,to,toLat,toLon,
           row.lower_limit||null,row.upper_limit||null,row.direction||null,
           row.provider||null,row.effective_date||null]
        )
      }
      imported++
    } catch (err) {
      errors++
      errorDetails.push(err.message)
    }
  }
  return { imported, skipped, errors, errorDetails: errorDetails.slice(0, 10) }
}

export async function bulkImportAirways(segments, { overwrite = false } = {}) {
  let imported = 0, skipped = 0, errors = 0
  for (const seg of segments) {
    try {
      const route = (seg.route_name||'').toUpperCase().trim()
      const from  = (seg.from_ident||'').toUpperCase().trim()
      const to    = (seg.to_ident||'').toUpperCase().trim()
      if (!route||!from||!to) { skipped++; continue }
      const existing = await query(
        `SELECT id FROM airways WHERE route_name=$1 AND from_ident=$2 AND to_ident=$3`,
        [route,from,to]
      )
      if (existing.rows.length > 0) {
        if (!overwrite) { skipped++; continue }
        await query(
          `UPDATE airways SET from_lat=$1,from_lon=$2,to_lat=$3,to_lon=$4,
              lower_limit=$5,upper_limit=$6,direction=$7,provider=$8,effective_date=$9
           WHERE id=$10`,
          [seg.from_lat||null,seg.from_lon||null,seg.to_lat||null,seg.to_lon||null,
           seg.lower_limit||null,seg.upper_limit||null,seg.direction||null,
           seg.provider||null,seg.effective_date||null,existing.rows[0].id]
        )
      } else {
        await query(
          `INSERT INTO airways (route_name,from_ident,from_lat,from_lon,to_ident,to_lat,to_lon,
              lower_limit,upper_limit,direction,provider,effective_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [route,from,seg.from_lat||null,seg.from_lon||null,to,seg.to_lat||null,seg.to_lon||null,
           seg.lower_limit||null,seg.upper_limit||null,seg.direction||null,
           seg.provider||null,seg.effective_date||null]
        )
      }
      imported++
    } catch { errors++ }
  }
  return { imported, skipped, errors }
}

export async function clearAllAirways() {
  const { rowCount } = await query('DELETE FROM airways')
  return { deleted: rowCount }
}


// import { query } from '../../config/database.js'
// import AppError from '../../utils/AppError.js'
// import { parse } from 'csv-parse/sync'

// export async function getAirwaysByBbox(south, north, west, east, limit = 500) {
//   if (south == null || north == null || west == null || east == null) {
//     throw new AppError('south, north, west, east query params are required', 400)
//   }
//   const { rows } = await query(
//     `SELECT id, route_name, from_ident, from_lat, from_lon,
//             to_ident, to_lat, to_lon, lower_limit, upper_limit,
//             direction, provider, effective_date
//      FROM airways
//      WHERE from_lat BETWEEN $1 AND $2
//        AND from_lon BETWEEN $3 AND $4
//      ORDER BY route_name ASC
//      LIMIT $5`,
//     [parseFloat(south), parseFloat(north), parseFloat(west), parseFloat(east),
//      Math.min(parseInt(limit) || 500, 2000)]
//   )
//   return rows
// }

// export async function getAirwayByName(routeName) {
//   const { rows } = await query(
//     `SELECT * FROM airways WHERE UPPER(route_name) = UPPER($1) ORDER BY from_ident ASC`,
//     [routeName]
//   )
//   if (rows.length === 0) throw new AppError(`Airway ${routeName.toUpperCase()} not found`, 404)
//   return rows
// }

// /**
//  * Import from airway_segments.csv
//  * Columns: route_name, seq, from_ident, to_ident, from_lat, from_lon,
//  *          to_lat, to_lon, lower_limit, upper_limit, direction,
//  *          region, provider, effective_date, source_url, validation_status
//  * seq and source_url are ignored (not in our schema).
//  */
// export async function importAirwaysCsv(csvBuffer, { overwrite = false } = {}) {
//   const records = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true })
//   let imported = 0, skipped = 0, errors = 0
//   const errorDetails = []

//   for (const row of records) {
//     try {
//       const route = (row.route_name || '').toUpperCase().trim()
//       const from  = (row.from_ident  || '').toUpperCase().trim()
//       const to    = (row.to_ident    || '').toUpperCase().trim()
//       if (!route || !from || !to) { skipped++; continue }

//       const fromLat = row.from_lat ? parseFloat(row.from_lat) : null
//       const fromLon = row.from_lon ? parseFloat(row.from_lon) : null
//       const toLat   = row.to_lat   ? parseFloat(row.to_lat)   : null
//       const toLon   = row.to_lon   ? parseFloat(row.to_lon)   : null
//       if (fromLat == null || isNaN(fromLat)) { skipped++; continue }

//       const existing = await query(
//         `SELECT id FROM airways WHERE route_name=$1 AND from_ident=$2 AND to_ident=$3`,
//         [route, from, to]
//       )

//       if (existing.rows.length > 0) {
//         if (!overwrite) { skipped++; continue }
//         await query(
//           `UPDATE airways SET from_lat=$1,from_lon=$2,to_lat=$3,to_lon=$4,
//               lower_limit=$5,upper_limit=$6,direction=$7,provider=$8,effective_date=$9
//            WHERE id=$10`,
//           [fromLat,fromLon,toLat,toLon,row.lower_limit||null,row.upper_limit||null,
//            row.direction||null,row.provider||null,row.effective_date||null,existing.rows[0].id]
//         )
//       } else {
//         await query(
//           `INSERT INTO airways (route_name,from_ident,from_lat,from_lon,to_ident,to_lat,to_lon,
//               lower_limit,upper_limit,direction,provider,effective_date)
//            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
//           [route,from,fromLat,fromLon,to,toLat,toLon,
//            row.lower_limit||null,row.upper_limit||null,row.direction||null,
//            row.provider||null,row.effective_date||null]
//         )
//       }
//       imported++
//     } catch (err) {
//       errors++
//       errorDetails.push(err.message)
//     }
//   }
//   return { imported, skipped, errors, errorDetails: errorDetails.slice(0, 10) }
// }

// export async function bulkImportAirways(segments, { overwrite = false } = {}) {
//   let imported = 0, skipped = 0, errors = 0
//   for (const seg of segments) {
//     try {
//       const route = (seg.route_name||'').toUpperCase().trim()
//       const from  = (seg.from_ident||'').toUpperCase().trim()
//       const to    = (seg.to_ident||'').toUpperCase().trim()
//       if (!route||!from||!to) { skipped++; continue }
//       const existing = await query(
//         `SELECT id FROM airways WHERE route_name=$1 AND from_ident=$2 AND to_ident=$3`,
//         [route,from,to]
//       )
//       if (existing.rows.length > 0) {
//         if (!overwrite) { skipped++; continue }
//         await query(
//           `UPDATE airways SET from_lat=$1,from_lon=$2,to_lat=$3,to_lon=$4,
//               lower_limit=$5,upper_limit=$6,direction=$7,provider=$8,effective_date=$9
//            WHERE id=$10`,
//           [seg.from_lat||null,seg.from_lon||null,seg.to_lat||null,seg.to_lon||null,
//            seg.lower_limit||null,seg.upper_limit||null,seg.direction||null,
//            seg.provider||null,seg.effective_date||null,existing.rows[0].id]
//         )
//       } else {
//         await query(
//           `INSERT INTO airways (route_name,from_ident,from_lat,from_lon,to_ident,to_lat,to_lon,
//               lower_limit,upper_limit,direction,provider,effective_date)
//            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
//           [route,from,seg.from_lat||null,seg.from_lon||null,to,seg.to_lat||null,seg.to_lon||null,
//            seg.lower_limit||null,seg.upper_limit||null,seg.direction||null,
//            seg.provider||null,seg.effective_date||null]
//         )
//       }
//       imported++
//     } catch { errors++ }
//   }
//   return { imported, skipped, errors }
// }

// export async function clearAllAirways() {
//   const { rowCount } = await query('DELETE FROM airways')
//   return { deleted: rowCount }
// }

