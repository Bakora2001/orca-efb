import('dotenv').then(dotenv => {
  dotenv.config();
  import('./src/config/database.js').then(async db => {
    await db.connect();
    const { rows } = await db.query("SELECT count(*) FROM navpoints");
    console.log(rows);
    process.exit(0);
  }).catch(console.error);
}).catch(console.error);
