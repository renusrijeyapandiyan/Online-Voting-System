const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("database.db", (err) => {
  if (err) console.error("❌ DB Error:", err.message);
  else console.log("✅ SQLite Connected");
});

db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON`);

  db.run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS elections(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    startAt TEXT NOT NULL,
    endsAt TEXT NOT NULL,
    active INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS candidates(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    electionId INTEGER NOT NULL,
    FOREIGN KEY(electionId) REFERENCES elections(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS votes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    electionId INTEGER NOT NULL,
    candidateId INTEGER NOT NULL,
    voterId INTEGER NOT NULL,
    UNIQUE(electionId, voterId),
    FOREIGN KEY(electionId) REFERENCES elections(id) ON DELETE CASCADE,
    FOREIGN KEY(candidateId) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY(voterId) REFERENCES users(id) ON DELETE CASCADE
  )`);
});

module.exports = db;
