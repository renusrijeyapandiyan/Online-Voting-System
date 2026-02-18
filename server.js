const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const SECRET = "secret123";

/* ============ AUTH ============ */
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

/* ============ REGISTER ============ */
app.post("/api/register", async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role)
    return res.status(400).json({ error: "All fields required" });

  const hash = await bcrypt.hash(password, 10);
  db.run(
    "INSERT INTO users(email,password,role) VALUES(?,?,?)",
    [email, hash, role],
    function (err) {
      if (err) return res.status(400).json({ error: "User already exists" });
      res.json({ success: true });
    }
  );
});

/* ============ LOGIN ============ */
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email=?", [email], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(400).json({ error: "Invalid login" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: "Invalid login" });

    const token = jwt.sign({ id: user.id, role: user.role }, SECRET, {
      expiresIn: "1d"
    });

    res.json({ token, role: user.role });
  });
});

/* ============ USERS ============ */
app.get("/api/users", auth("Admin"), (req, res) => {
  db.all("SELECT id,email,role FROM users", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.delete("/api/users/:id", auth("Admin"), (req, res) => {
  db.run("DELETE FROM users WHERE id=?", [req.params.id], () =>
    res.json({ success: true })
  );
});

/* ============ ELECTIONS ============ */
app.post("/api/election", auth("Admin"), (req, res) => {
  const { title, startAt, endsAt, candidates } = req.body;

  if (!title || !startAt || !endsAt)
    return res.status(400).json({ error: "All fields required" });

  db.run(
    "INSERT INTO elections(title,startAt,endsAt,active) VALUES(?,?,?,1)",
    [title, startAt, endsAt],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });

      const electionId = this.lastID;

      if (Array.isArray(candidates)) {
        candidates.forEach(c => {
          db.run("INSERT INTO candidates(name,electionId) VALUES(?,?)", [
            c.name,
            electionId
          ]);
        });
      }

      res.json({ success: true, id: electionId });
    }
  );
});

app.get("/api/elections", auth(), (req, res) => {
  db.all("SELECT * FROM elections ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/election/:id", auth(), (req, res) => {
  db.get("SELECT * FROM elections WHERE id=?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(
      "SELECT * FROM candidates WHERE electionId=?",
      [req.params.id],
      (err, cands) => {
        res.json({ ...row, candidates: cands || [] });
      }
    );
  });
});

app.delete("/api/election/:id", auth("Admin"), (req, res) => {
  db.run("DELETE FROM elections WHERE id=?", [req.params.id], () =>
    res.json({ success: true })
  );
});

/* ============ CANDIDATES ============ */
app.get("/api/candidates/:id", auth(), (req, res) => {
  db.all(
    "SELECT * FROM candidates WHERE electionId=?",
    [req.params.id],
    (err, rows) => res.json(rows)
  );
});

/* ============ VOTE ============ */
app.post("/api/vote", auth("Voter"), (req, res) => {
  const { electionId, candidateId } = req.body;

  db.run(
    "INSERT INTO votes(electionId,candidateId,voterId) VALUES(?,?,?)",
    [electionId, candidateId, req.user.id],
    function (err) {
      if (err) return res.status(400).json({ error: "Already voted" });
      res.json({ success: true });
    }
  );
});

/* ============ RESULTS ============ */
app.get("/api/results/:id", auth(), (req, res) => {
  db.all(
    `SELECT c.name, COUNT(v.id) as votes
     FROM candidates c
     LEFT JOIN votes v ON c.id = v.candidateId
     WHERE c.electionId=?
     GROUP BY c.id`,
    [req.params.id],
    (err, rows) => res.json(rows)
  );
});

/* ============ SERVER ============ */
app.listen(3000, () => {
  console.log("🚀 Server Running → http://localhost:3000");
});
