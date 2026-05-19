const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'psb_erp' });
    const sql = `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='psb_erp' AND TABLE_NAME='tenants' AND COLUMN_NAME='status'`;
    const [rows] = await conn.execute(sql);
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (e) {
    console.error('inspect error:', e.message || e);
    process.exit(1);
  }
})();
