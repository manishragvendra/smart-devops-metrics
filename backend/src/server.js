
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Smart DevOps Metrics Intelligence Platform API",
    status: "running"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    database: "connected"
  });
});

app.get("/api/projects", (req, res) => {
  const projects = db
    .prepare("SELECT * FROM projects ORDER BY id DESC")
    .all();

  res.json(projects);
});

app.post("/api/projects", (req, res) => {
  const { name, repository_url } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      error: "Project name is required"
    });
  }

  const result = db.prepare(`
    INSERT INTO projects (name, repository_url)
    VALUES (?, ?)
  `).run(name.trim(), repository_url || null);

  const project = db
    .prepare("SELECT * FROM projects WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(project);
});

app.get("/api/projects/:id/metrics", (req, res) => {
  const projectId = Number(req.params.id);

  if (!Number.isInteger(projectId) || projectId < 1) {
    return res.status(400).json({ error: "Invalid project ID" });
  }

  const project = db
    .prepare("SELECT id, name FROM projects WHERE id = ?")
    .get(projectId);

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const metrics = db.prepare(`
    SELECT * FROM metric_snapshots
    WHERE project_id = ?
    ORDER BY id DESC
  `).all(projectId);

  res.json({ project, metrics });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
