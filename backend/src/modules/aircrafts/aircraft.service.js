import { query } from '../../config/database.js'
import AppError from '../../utils/AppError.js'

/**
 * Get all aircraft (optionally include inactive)
 */
export async function getAllAircraft({ includeInactive = false } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM aircraft ORDER BY registration ASC'
    : 'SELECT * FROM aircraft WHERE is_active = true ORDER BY registration ASC'

  const { rows } = await query(sql)
  return rows
}

/**
 * Get a single aircraft by ID
 */
export async function getAircraftById(id) {
  const { rows } = await query('SELECT * FROM aircraft WHERE id = $1', [id])
  if (rows.length === 0) throw new AppError('Aircraft not found', 404)
  return rows[0]
}

/**
 * Create a new aircraft
 */
export async function createAircraft({
  registration,
  type,
  manufacturer,
  mtow_kg,
  mlw_kg,
  mzfw_kg,
  bew_kg,
  max_pax,
  cruise_tas_kt,
  fuel_burn_kg_hr,
  flaps,
  notes,
}) {
  // Check registration uniqueness
  const existing = await query(
    'SELECT id FROM aircraft WHERE UPPER(registration) = UPPER($1)',
    [registration]
  )
  if (existing.rows.length > 0) {
    throw new AppError(`Aircraft with registration ${registration.toUpperCase()} already exists`, 409)
  }

  const { rows } = await query(
    `INSERT INTO aircraft (
        registration, type, manufacturer,
        mtow_kg, mlw_kg, mzfw_kg, bew_kg,
        max_pax, cruise_tas_kt, fuel_burn_kg_hr,
        flaps, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
    [
      registration.toUpperCase(),
      type,
      manufacturer || null,
      mtow_kg || null,
      mlw_kg || null,
      mzfw_kg || null,
      bew_kg || null,
      max_pax || null,
      cruise_tas_kt || null,
      fuel_burn_kg_hr || null,
      flaps || [],
      notes || null,
    ]
  )

  return rows[0]
}

/**
 * Update an aircraft
 */
export async function updateAircraft(id, updates) {
  // Confirm aircraft exists
  await getAircraftById(id)

  // If registration is being changed, check it won't conflict
  if (updates.registration) {
    const conflict = await query(
      'SELECT id FROM aircraft WHERE UPPER(registration) = UPPER($1) AND id != $2',
      [updates.registration, id]
    )
    if (conflict.rows.length > 0) {
      throw new AppError(
        `Registration ${updates.registration.toUpperCase()} is already in use`,
        409
      )
    }
    updates.registration = updates.registration.toUpperCase()
  }

  // Build dynamic SET clause from whatever fields were sent
  const fields = Object.keys(updates)
  if (fields.length === 0) throw new AppError('No fields provided to update', 400)

  const setClauses = fields.map((field, i) => `${field} = $${i + 1}`)
  const values = fields.map((f) => updates[f])

  const { rows } = await query(
    `UPDATE aircraft
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${fields.length + 1}
     RETURNING *`,
    [...values, id]
  )

  return rows[0]
}

/**
 * Soft-delete (deactivate) an aircraft
 */
export async function deactivateAircraft(id) {
  await getAircraftById(id)

  const { rows } = await query(
    'UPDATE aircraft SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  )
  return rows[0]
}

/**
 * Hard-delete an aircraft (admin only — will cascade to performance_cells)
 */
export async function deleteAircraft(id) {
  await getAircraftById(id)
  await query('DELETE FROM aircraft WHERE id = $1', [id])
  return { message: 'Aircraft permanently deleted' }
}

/**
 * Get performance summary for an aircraft (WAT/TODA/ASDA counts)
 */
export async function getAircraftPerformanceSummary(id) {
  await getAircraftById(id)

  const { rows } = await query(
    `SELECT table_type, COUNT(*) AS cell_count
     FROM performance_cells
     WHERE aircraft_id = $1
     GROUP BY table_type
     ORDER BY table_type`,
    [id]
  )

  return rows
}

/**
 * Bulk create aircraft, skipping any that already exist by registration.
 * Returns the number of successfully imported aircraft.
 */
export async function bulkCreateAircraft(aircrafts) {
  let imported = 0
  for (const ac of aircrafts) {
    try {
      await createAircraft(ac)
      imported++
    } catch (error) {
      // Ignore 409 conflicts, let other errors bubble up if they are critical
      if (error.statusCode !== 409) {
        console.error(`Failed to import ${ac.registration}:`, error)
      }
    }
  }
  return { imported, total: aircrafts.length }
}