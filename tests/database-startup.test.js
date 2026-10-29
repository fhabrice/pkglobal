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

test('does not seed fictional transactional data outside explicit demo mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkglobal-real-data-'));
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'database.js'), path.join(dir, 'database.js'));
    const script = `
      const { db, initializeDatabase } = require('./database');
      initializeDatabase();
      const tables = ['call_for_projects', 'candidatures', 'investors', 'investor_interests', 'inquiries', 'visitor_stats', 'notifications', 'crm_contacts', 'crm_opportunities', 'crm_activities'];
      const counts = Object.fromEntries(tables.map((table) => [table, db.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
      const crmTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'crm_%' ORDER BY name").all().map((row) => row.name);
      console.log(JSON.stringify({ counts, crmTables }));
      db.close();
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: dir,
      env: {
        ...process.env,
        NODE_PATH: path.join(__dirname, '..', 'node_modules'),
        ALLOW_DEMO_USERS: 'false',
        NODE_ENV: 'test',
        INITIAL_ADMIN_EMAIL: 'real.admin@pkglobalpartners.com',
        INITIAL_ADMIN_PASSWORD: 'RealDataOnly2026!',
        INITIAL_ADMIN_NAME: 'Administrateur Reel'
      },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const outputLine = result.stdout.trim().split('\n').pop();
    const { counts, crmTables } = JSON.parse(outputLine);
    assert.deepEqual(crmTables, ['crm_activities', 'crm_contacts', 'crm_opportunities']);
    for (const [table, count] of Object.entries(counts)) {
      assert.equal(count, 0, `${table} should start empty in real-data mode`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unpublishes known seeded demo calls once when switching an existing database to real mode', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkglobal-demo-calls-'));
  try {
    fs.copyFileSync(path.join(__dirname, '..', 'database.js'), path.join(dir, 'database.js'));
    const baseEnv = {
      ...process.env,
      NODE_PATH: path.join(__dirname, '..', 'node_modules'),
      NODE_ENV: 'test'
    };
    const run = (script, env) => spawnSync(process.execPath, ['-e', script], {
      cwd: dir,
      env: { ...baseEnv, ...env },
      encoding: 'utf8'
    });

    const demo = run("const {db, initializeDatabase} = require('./database'); initializeDatabase(); db.close();", {
      ALLOW_DEMO_USERS: 'true'
    });
    assert.equal(demo.status, 0, demo.stderr);

    const realEnv = {
      ALLOW_DEMO_USERS: 'false',
      INITIAL_ADMIN_EMAIL: 'real.admin@pkglobalpartners.com',
      INITIAL_ADMIN_PASSWORD: 'RealDataOnly2026!',
      INITIAL_ADMIN_NAME: 'Administrateur Reel'
    };
    const statusesScript = `
      const { db, initializeDatabase } = require('./database');
      initializeDatabase();
      console.log(JSON.stringify(db.prepare('SELECT slug, status FROM call_for_projects ORDER BY id').all()));
      db.close();
    `;
    const firstReal = run(statusesScript, realEnv);
    assert.equal(firstReal.status, 0, firstReal.stderr);
    const firstStatuses = JSON.parse(firstReal.stdout.trim().split('\n').pop());
    assert.equal(firstStatuses.length, 3);
    assert.ok(firstStatuses.every((call) => call.status === 'draft'));

    const republish = run(`
      const { db, initializeDatabase } = require('./database');
      initializeDatabase();
      db.prepare("UPDATE call_for_projects SET status = 'open' WHERE slug = 'appel-projets-agritech-2026'").run();
      db.close();
    `, realEnv);
    assert.equal(republish.status, 0, republish.stderr);

    const secondReal = run(statusesScript, realEnv);
    assert.equal(secondReal.status, 0, secondReal.stderr);
    const secondStatuses = JSON.parse(secondReal.stdout.trim().split('\n').pop());
    assert.equal(secondStatuses.find((call) => call.slug === 'appel-projets-agritech-2026').status, 'open');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
