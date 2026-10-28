const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Run the database module in a clean checkout-like directory, without a data folder.
test('initializes the SQLite database when the data directory is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkglobal-startup-'));
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'database.js'), path.join(dir, 'database.js'));
    const result = spawnSync(process.execPath, ['-e', "const {db, initializeDatabase} = require('./database'); initializeDatabase(); db.close();"], {
      cwd: dir,
      env: { ...process.env, NODE_PATH: path.join(__dirname, '..', 'node_modules'), ALLOW_DEMO_USERS: 'true', NODE_ENV: 'test' },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.existsSync(path.join(dir, 'data', 'pkglobal.sqlite')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
