import('dotenv').then(dotenv => {
  dotenv.config();
  import('./src/config/database.js').then(async db => {
    await db.connect();
    const { rows } = await db.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'navpoints_validation_status_check'");
    console.log(rows);
    process.exit(0);
  }).catch(console.error);
}).catch(console.error);
