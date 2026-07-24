import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import { connect, query } from './src/config/database.js';

async function run() {
  await connect();
  const r1 = await query("SELECT * FROM navpoints WHERE name ILIKE '%Rand%'");
  console.log("Navpoints:", r1.rows);
  process.exit(0);
}
run();
