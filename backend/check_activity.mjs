import { query, connect } from './src/config/database.js'
connect()
const r = await query(`SELECT id, action, table_name, new_data, ip_address, created_at, user_id FROM audit_logs ORDER BY created_at DESC LIMIT 5`)
console.log(JSON.stringify(r.rows, null, 2))

// Also test the JOIN query used by the service
const r2 = await query(`
  SELECT al.id, al.action, al.table_name, al.new_data, al.created_at,
         u.username, u.full_name
  FROM audit_logs al
  LEFT JOIN users u ON u.id = al.user_id
  ORDER BY al.created_at DESC LIMIT 5
`)
console.log('JOIN RESULT:', JSON.stringify(r2.rows, null, 2))
process.exit(0)
