const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', '..', 'dev.db');

function openDb() {
  return new sqlite3.Database(DB_FILE);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function dbInit() {
  const db = openDb();
  await run(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.close();
}

async function createUser({ email, name }) {
  const db = openDb();
  try {
    const result = await run(db, `INSERT INTO users (email, name) VALUES (?, ?)`, [email, name]);
    const rows = await all(db, `SELECT * FROM users WHERE id = ?`, [result.lastID]);
    return rows[0];
  } finally {
    db.close();
  }
}

async function listUsers() {
  const db = openDb();
  try {
    return await all(db, `SELECT * FROM users ORDER BY id DESC`);
  } finally {
    db.close();
  }
}

async function runAggregation() {
  const db = openDb();
  try {
    return await all(db, `
      SELECT substr(email, instr(email, '@')+1) AS domain, COUNT(*) as count
      FROM users
      GROUP BY domain
      ORDER BY count DESC
    `);
  } finally {
    db.close();
  }
}

module.exports = { dbInit, createUser, listUsers, runAggregation };
 
// ---------- Error scenario helpers ----------
async function wrongSql() {
  const db = openDb();
  try {
    await run(db, `SELEC id FROM non_existing_table`); // typo: SELEC
  } finally { db.close(); }
}

async function badAggregation() {
  const db = openDb();
  try {
    // reference unknown column in GROUP BY
    await all(db, `SELECT name, COUNT(*) as c FROM users GROUP BY unknown_col`);
  } finally { db.close(); }
}

async function missingIndexCheck() {
  const db = openDb();
  try {
    const idx = await all(db, `PRAGMA index_list('users')`);
    const hasEmailIdx = idx.some(i => i.name === 'idx_users_email');
    if (!hasEmailIdx) {
      // Mirror behavior of other scenarios: throw when required artifact is missing
      // Use /db/create-index to satisfy this check
      throw new Error('missing index: idx_users_email');
    }
    return idx;
  } finally { db.close(); }
}

async function txnNoRollback(emailA, nameA, emailB, nameB) {
  const db = openDb();
  try {
    await run(db, 'BEGIN TRANSACTION');
    await run(db, `INSERT INTO users (email, name) VALUES (?, ?)`, [emailA, nameA]);
    // simulate failure mid-transaction
    throw new Error('simulated failure before commit');
    // await run(db, `INSERT INTO users (email, name) VALUES (?, ?)`, [emailB, nameB]);
    // await run(db, 'COMMIT');
  } finally {
    // No explicit rollback; connection close will rollback, demonstrating missing rollback handling
    db.close();
  }
}

async function lockContention() {
  const db1 = openDb();
  const db2 = openDb();
  try {
    await run(db1, 'BEGIN IMMEDIATE');
    // db1 holds write lock; db2 write should fail with SQLITE_BUSY
    await run(db2, `INSERT INTO users (email, name) VALUES (?, ?)`, ['busy@test.dev', 'Busy']);
  } finally {
    try { await run(db1, 'ROLLBACK'); } catch {}
    db1.close();
    db2.close();
  }
}

async function migrationMissingColumn() {
  const db = openDb();
  try {
    // select non-existent column
    await all(db, `SELECT id, age FROM users LIMIT 1`);
  } finally { db.close(); }
}

async function duplicateRace(email, name) {
  const a = openDb();
  const b = openDb();
  try {
    await Promise.all([
      run(a, `INSERT INTO users (email, name) VALUES (?, ?)`, [email, name]),
      run(b, `INSERT INTO users (email, name) VALUES (?, ?)`, [email, name])
    ]);
  } finally { a.close(); b.close(); }
}

module.exports.scenarios = {
  wrongSql,
  missingIndexCheck,
  txnNoRollback,
  lockContention,
  migrationMissingColumn,
  duplicateRace,
  badAggregation
};