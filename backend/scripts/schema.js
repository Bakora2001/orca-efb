import pg from 'pg'
const pool = new pg.Pool({connectionString: 'postgres://kscrn_user:42084-vic1-Maxypike-219221@172.81.133.161:5432/orca_efb1'})
pool.query(`ALTER TABLE performance_cells RENAME COLUMN notes TO source_note;`).then(res => { console.log("Renamed notes to source_note"); pool.end(); })
