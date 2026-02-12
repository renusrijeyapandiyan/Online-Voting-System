require("dotenv").config();
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const CryptoJS = require("crypto-js");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const SECRET = process.env.JWT_SECRET || "secret123";
const VOTE_KEY = process.env.VOTE_KEY || "votekey123";

// Auth middleware
function auth(role) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      if (role && user.role !== role) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };
}

// Register (NO ADMIN CODE)
app.post("/api/register", async (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || !role) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (email, password, role) VALUES (?, ?, ?)`,
      [email, hash, role],
      function (err) {
        if (err) return res.status(400).json({ error: "User already exists" });
        res.json({ success: true });
      }
    );
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Login (Admin / Voter / Observer)
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get(`SELECT * FROM users WHERE email=?`, [email], async (err, user) => {
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET);
    res.json({ token, role: user.role });
  });
});

// Admin: create election
app.post("/api/election", auth("Admin"), (req, res) => {
  db.run(
    `INSERT INTO elections (title, endsAt, active) VALUES (?, ?, 1)`,
    [req.body.title, req.body.endsAt],
    () => res.sendStatus(200)
  );
});

// Admin: add candidate
app.post("/api/candidate", auth("Admin"), (req, res) => {
  db.run(
    `INSERT INTO candidates (name, electionId) VALUES (?, ?)`,
    [req.body.name, req.body.electionId],
    () => res.sendStatus(200)
  );
});

// List elections
app.get("/api/elections", auth(), (req, res) => {
  db.all(`SELECT * FROM elections WHERE active=1`, (err, elections) => {
    if (!elections || !elections.length) return res.json([]);

    let remaining = elections.length;
    const out = [];

    elections.forEach(e => {
      db.all(`SELECT * FROM candidates WHERE electionId=?`, [e.id], (err, cands) => {
        out.push({ ...e, candidates: cands });
        if (--remaining === 0) res.json(out);
      });
    });
  });
});

// Vote
app.post("/api/vote", auth("Voter"), (req, res) => {
  const { electionId, candidateId } = req.body;

  const encrypted = CryptoJS.AES.encrypt(candidateId.toString(), VOTE_KEY).toString();
  const voterHash = CryptoJS.SHA256(req.user.id.toString()).toString();

  db.run(
    `INSERT INTO votes (electionId, encryptedVote, voterHash) VALUES (?, ?, ?)`,
    [electionId, encrypted, voterHash],
    err => {
      if (err) return res.status(400).send("Already voted");
      res.sendStatus(200);
    }
  );
});

// Results
app.get("/api/results/:id", auth(), (req, res) => {
  db.get(`SELECT endsAt FROM elections WHERE id=?`, [req.params.id], (err, e) => {
    if (!e) return res.sendStatus(404);
    if (new Date() < new Date(e.endsAt)) return res.status(403).send("Election running");

    db.all(`SELECT encryptedVote FROM votes WHERE electionId=?`, [req.params.id], (err, rows) => {
      const results = {};
      rows.forEach(v => {
        const c = CryptoJS.AES.decrypt(v.encryptedVote, VOTE_KEY).toString(CryptoJS.enc.Utf8);
        results[c] = (results[c] || 0) + 1;
      });
      res.json(results);
    });
  });
});

// Debug route (optional)
app.get("/api/debug-users", (req, res) => {
  db.all("SELECT id, email, role FROM users", (err, rows) => res.json(rows));
});

app.listen(3000, () => console.log("Server running at http://localhost:3000"));
