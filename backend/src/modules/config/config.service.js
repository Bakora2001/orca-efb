// ─── config.service.js ───────────────────────────────────────────
import { query } from '../../config/database.js'

export async function getAllConfig() {
  const { rows } = await query('SELECT key, value FROM app_config ORDER BY key')
  const result = {}
  for (const row of rows) result[row.key] = row.value
  return result
}

export async function saveConfig(updates) {
  const entries = Object.entries(updates)
  if (entries.length === 0) return {}

  for (const [key, value] of entries) {
    await query(
      `INSERT INTO app_config (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]
    )
  }
  return getAllConfig()
}