const mysql = require('mysql2/promise');
(async () => {
  try {
    const conn = await mysql.createConnection({ host: 'localhost', user: 'root', password: '', database: 'psb_erp' });
    const slug = 'regtest-' + Date.now();
    const name = 'regtest-' + Date.now();
    const [res] = await conn.execute('INSERT INTO tenants (name, slug, plan, status) VALUES (?, ?, ?, ?)', [name, slug, 'starter', 'pending']);
    console.log('insert result:', res);
    const [rows] = await conn.execute('SELECT id, name, status FROM tenants ORDER BY id DESC LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (e) {
    console.error('DB insert error:', e.message || e);
    process.exit(1);
  }
})();
