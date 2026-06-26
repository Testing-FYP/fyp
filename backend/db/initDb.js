const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  let client;

  if (!databaseUrl) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  try {
    console.log('Connecting to PostgreSQL...');
    client = new Client({
      connectionString: databaseUrl,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
    });

    await client.connect();

    const sqlScript = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await client.query(sqlScript);

    console.log('Database initialized successfully!');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('DB Init Error:', err.message);
    if (client) await client.end().catch(() => {});
    process.exit(1);
  }
}

initDb();
