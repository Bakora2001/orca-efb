// activity.service.js — fetch and write audit logs
import { query } from '../../config/database.js'

/**
 * Insert an audit log entry.
 */
export async function logActivity({ userId, action, tableName, recordId, oldData, newData, ipAddress }) {
  await query(
    `INSERT INTO audit_logs (id, user_id, action, table_name, record_id, old_data, new_data, ip_address)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)`,
    [
      userId || null,
      action,
      tableName || null,
      recordId || null,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      ipAddress || null,
    ]
  )
}

/**
 * Fetch recent audit log entries (joined with users for display name).
 */
export async function getRecentActivity(limit = 20) {
  const result = await query(
    `SELECT
       al.id,
       al.action,
       al.table_name,
       al.record_id,
       al.new_data,
       al.ip_address,
       al.created_at,
       u.username,
       u.full_name
     FROM audit_logs al
     LEFT JOIN efbusers u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT $1`,
    [limit]
  )
  return result.rows
}
