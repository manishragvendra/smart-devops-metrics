
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");
const { getSonarMetrics } = require("../services/sonarService");
const { getJenkinsMetrics } = require("../services/jenkinsService");
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------------------------------------------------
// 1. Basic API and health check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "Smart DevOps Metrics Intelligence Platform API",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    database: "connected",
  });
});

// --------------------------------------------------
// 2. Get all projects
// --------------------------------------------------

app.get("/api/projects", (req, res) => {
  try {
    const projects = db
      .prepare("SELECT * FROM projects ORDER BY id DESC")
      .all();

    res.json(projects);
  } catch (error) {
    console.error("Get projects error:", error.message);
    res.status(500).json({ error: "Failed to retrieve projects" });
  }
});

// --------------------------------------------------
// 3. Create a project
// --------------------------------------------------

app.post("/api/projects", (req, res) => {
  try {
    const { name, repository_url } = req.body;

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        error: "Project name is required",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO projects (name, repository_url)
        VALUES (?, ?)
      `)
      .run(name.trim(), repository_url || null);

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(project);
  } catch (error) {
    console.error("Create project error:", error.message);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// --------------------------------------------------
// 4. Get metrics for a specific project
// --------------------------------------------------

app.get("/api/projects/:id/metrics", (req, res) => {
  try {
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

    const metrics = db
      .prepare(`
        SELECT *
        FROM metric_snapshots
        WHERE project_id = ?
        ORDER BY id DESC
      `)
      .all(projectId);

    res.json({ project, metrics });
  } catch (error) {
    console.error("Get project metrics error:", error.message);
    res.status(500).json({ error: "Failed to retrieve project metrics" });
  }
});

// --------------------------------------------------
// 5. Get latest metrics for the specified project
//    Defaults to project ID 2.
// --------------------------------------------------

app.get("/api/metrics", (req, res) => {
  try {
    const projectId = Number(req.query.projectId || 2);

    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const project = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(projectId);

    if (!project) {
      return res.status(404).json({
        error: "Project not found. Register the project first.",
      });
    }

    const snapshot = db
      .prepare(`
        SELECT *
        FROM metric_snapshots
        WHERE project_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(projectId);

    res.json({
      project,
      metrics: snapshot || null,
      message: snapshot
        ? "Latest metrics retrieved successfully"
        : "No metrics snapshot has been recorded yet",
    });
  } catch (error) {
    console.error("Metrics API error:", error.message);
    res.status(500).json({ error: "Failed to retrieve metrics" });
  }
});

// --------------------------------------------------
// 6. Save a metrics snapshot for a project
// --------------------------------------------------

app.post("/api/projects/:id/metrics", (req, res) => {
  try {
    const projectId = Number(req.params.id);

    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const project = db
      .prepare("SELECT id FROM projects WHERE id = ?")
      .get(projectId);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const {
      bugs = 0,
      vulnerabilities = 0,
      code_smells = 0,
      coverage = 0,
      duplication = 0,
      complexity = 0,
      build_success_rate = 0,
      test_pass_rate = 0,
      deployment_success_rate = 0,
      security_score = 100,
      maintainability_score = 100,
    } = req.body;

    const values = [
      bugs,
      vulnerabilities,
      code_smells,
      coverage,
      duplication,
      complexity,
      build_success_rate,
      test_pass_rate,
      deployment_success_rate,
      security_score,
      maintainability_score,
    ];

    if (
      values.some(
        (value) =>
          typeof value !== "number" || !Number.isFinite(value)
      )
    ) {
      return res.status(400).json({
        error: "All metric values must be valid numbers",
      });
    }

    if (
      bugs < 0 ||
      vulnerabilities < 0 ||
      code_smells < 0 ||
      complexity < 0 ||
      [coverage, duplication, build_success_rate, test_pass_rate,
        deployment_success_rate, security_score, maintainability_score]
        .some((value) => value < 0 || value > 100)
    ) {
      return res.status(400).json({
        error: "Metric values are outside their allowed ranges",
      });
    }

    const result = db
      .prepare(`
        INSERT INTO metric_snapshots (
          project_id,
          bugs,
          vulnerabilities,
          code_smells,
          coverage,
          duplication,
          complexity,
          build_success_rate,
          test_pass_rate,
          deployment_success_rate,
          security_score,
          maintainability_score
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(projectId, ...values);

    const snapshot = db
      .prepare("SELECT * FROM metric_snapshots WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: "Metrics snapshot saved successfully",
      metrics: snapshot,
    });
  } catch (error) {
    console.error("Save metrics error:", error.message);
    res.status(500).json({ error: "Failed to save metrics" });
  }
});

// --------------------------------------------------
// 7. Retrieve live metrics from SonarQube
// --------------------------------------------------

app.get("/api/sonar/metrics", async (req, res) => {
  try {
    const metrics = await getSonarMetrics();

    res.json({
      message: "SonarQube metrics retrieved successfully",
      metrics,
    });
  } catch (error) {
    console.error("SonarQube metrics error:", error.message);

    res.status(502).json({
      error: "Failed to retrieve SonarQube metrics",
      details: error.message,
    });
  }
});
app.get("/api/jenkins/metrics", async (req, res) => {
  try {
    const metrics = await getJenkinsMetrics();

    res.json({
      message: "Jenkins metrics retrieved successfully",
      metrics,
    });
  } catch (error) {
    console.error("Jenkins metrics error:", error.message);

    res.status(502).json({
      message: "Failed to retrieve Jenkins metrics",
      error: error.message,
    });
  }
});

app.get("/api/jenkins/history", (req, res) => {
  try {
    const db = require("./database");

    const projectId = Number(req.query.projectId || 2);

    if (!Number.isInteger(projectId) || projectId < 1) {
      return res.status(400).json({
        message: "projectId must be a positive integer.",
      });
    }

    const history = db
      .prepare(`
        SELECT
          job_name AS jobName,
          build_number AS buildNumber,
          result,
          duration_ms AS durationMs,
          build_timestamp AS timestamp,
          recorded_at AS recordedAt
        FROM jenkins_builds
        WHERE project_id = ?
        ORDER BY build_number DESC
      `)
      .all(projectId);

    res.json({
      message: "Jenkins build history retrieved successfully",
      totalBuilds: history.length,
      history,
    });
  } catch (error) {
    console.error("Jenkins history error:", error.message);

    res.status(500).json({
      message: "Failed to retrieve Jenkins build history.",
    });
  }
});

 // --------------------------------------------------
 // 9. ML failure prediction
 // --------------------------------------------------

app.post("/api/ml/predict", async (req, res) => {
  try {
    const {
      additions,
      deletions,
      total_churn,
      files_modified,
      msg_len,
      is_merge,
      num_parents,
      time_since_last_commit,
      repo,
      event,
    } = req.body;

    const payload = {
      additions,
      deletions,
      total_churn,
      files_modified,
      msg_len,
      is_merge,
      num_parents,
      time_since_last_commit,
      repo,
      event,
    };

    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "ML prediction service returned an error",
        details: result,
      });
    }

    return res.json({
      message: "Failure prediction generated successfully",
      prediction: result,
    });
  } catch (error) {
    console.error("ML prediction error:", error.message);

    return res.status(502).json({
      error: "Unable to reach the ML prediction service",
      details: error.message,
    });
  }
});



// --------------------------------------------------
// 8. Start server AFTER registering all routes
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
