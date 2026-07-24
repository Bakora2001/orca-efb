import('dotenv').then(dotenv => {
  dotenv.config();
  import('./src/config/database.js').then(async db => {
    await db.connect();
    // Check airways table
    const { rows: cols } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='airways'");
    console.log('Airways columns:', cols.map(r => r.column_name));
    const { rows: cnt } = await db.query("SELECT count(*) FROM airways");
    console.log('Airways count:', cnt[0].count);
    const { rows: s } = await db.query("SELECT * FROM airways LIMIT 2");
    console.log('Airways sample:', s);
    process.exit(0);
  }).catch(console.error);
}).catch(console.error);
