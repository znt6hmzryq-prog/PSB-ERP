const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'psb_erp' });
    const [rows] = await conn.execute('SELECT id, name, status FROM tenants ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (e) {
    console.error('DB query error:', e.message || e);
    process.exit(1);
  }
})();
