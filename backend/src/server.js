
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const db = require("./database");
const { getSonarMetrics } = require("../services/sonarService");
const { getJenkinsMetrics } = require("../services/jenkinsService");

const ML_SERVICE_URL =
  process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// --------------------------------------------------
// 1. Create persistent ML prediction history table
// --------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS ml_prediction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commit_sha TEXT,
    repository TEXT,
    build_number TEXT,
    generated_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    prediction TEXT NOT NULL,
    failure_probability REAL,
    threshold REAL,
    model_type TEXT,
    warning TEXT
  );
`);

console.log("ML prediction history table is ready.");

// --------------------------------------------------
// 2. Basic API and health check
// --------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "Smart DevOps Metrics Intelligence Platform API",
    status: "running",
  });
});

app.get("/api/health", (req, res) => {
  try {
    db.prepare("SELECT 1").get();

    res.json({
      status: "healthy",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check error:", error.message);

    res.status(500).json({
      status: "unhealthy",
      database: "error",
    });
  }
});

// --------------------------------------------------
// 3. Get all projects
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
// 4. Create a project
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
// 5. Get metrics for a specific project
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
// 6. Get latest metrics for a project
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
// 7. Save a metrics snapshot
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
      [
        coverage,
        duplication,
        build_success_rate,
        test_pass_rate,
        deployment_success_rate,
        security_score,
        maintainability_score,
      ].some((value) => value < 0 || value > 100)
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
// 8. Retrieve live SonarQube metrics
// --------------------------------------------------
app.get("/api/debug/jenkins", async (req, res) => {
  try {
    const metrics = await getJenkinsMetrics();

    res.json({
      serviceFile: require.resolve("../services/jenkinsService"),
      hasTestMetrics: Object.hasOwn(metrics, "testMetrics"),
      testMetrics: metrics.testMetrics ?? null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/sonar/metrics", async (req, res) => {
  try {
    const metrics = await getSonarMetrics();
    console.log("Defect density from running service:", metrics.defect_density);
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

// --------------------------------------------------
// 9. Retrieve live Jenkins metrics
// --------------------------------------------------

app.get("/api/jenkins/metrics", async (req, res) => {
  try {
    const metrics = await getJenkinsMetrics();

    console.log("Jenkins test metrics:", metrics.testMetrics);

    res.json({
      message: "Jenkins metrics retrieved successfully",
      metrics: {
        ...metrics,
        testMetrics: metrics.testMetrics ?? null,
      },
    });
  } catch (error) {
    console.error("Jenkins metrics error:", error.message);

    res.status(502).json({
      message: "Failed to retrieve Jenkins metrics",
      error: error.message,
    });
  }
});
// --------------------------------------------------
// 10. Retrieve saved Jenkins build history
// --------------------------------------------------

app.get("/api/jenkins/history", (req, res) => {
  try {
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
// 11. Generate and permanently save ML predictions
// --------------------------------------------------

const savePrediction = db.prepare(`
  INSERT INTO ml_prediction_history (
    commit_sha,
    repository,
    build_number,
    generated_at,
    metadata_json,
    prediction,
    failure_probability,
    threshold,
    model_type,
    warning
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

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
      commit,
      repository,
      buildNumber,
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

    // Only persist predictions carrying Jenkins build or commit metadata.
    // Manual predictions continue to work without entering Jenkins history.
    if (commit || buildNumber) {
      const generatedAt = new Date().toISOString();
      const repositoryName = repository || repo || null;
      const build = buildNumber == null ? null : String(buildNumber);

      savePrediction.run(
        commit || null,
        repositoryName,
        build,
        generatedAt,
        JSON.stringify(payload),
        result.prediction || "Unknown",
        Number.isFinite(result.failure_probability)
          ? result.failure_probability
          : null,
        Number.isFinite(result.threshold) ? result.threshold : null,
        result.model_type || null,
        result.warning || null
      );

      console.log(
        `Saved ML prediction for Jenkins build ${build || "unknown"}`
      );
    }

    return res.json({
      message: "Failure prediction generated successfully",
      prediction: result,
    });
  } catch (error) {
    console.error("ML prediction error:", error.message);

    return res.status(502).json({
      error: "Unable to reach the ML prediction service or save its result",
      details: error.message,
    });
  }
});

// --------------------------------------------------
// 12. Retrieve the latest Jenkins prediction
//     Data survives backend restarts.
// --------------------------------------------------

app.get("/api/ml/latest-prediction", (req, res) => {
  try {
    const row = db
      .prepare(`
        SELECT *
        FROM ml_prediction_history
        ORDER BY id DESC
        LIMIT 1
      `)
      .get();

    if (!row) {
      return res.json({
        available: false,
        latestPrediction: null,
      });
    }

    const latestPrediction = {
      id: row.id,
      commit: row.commit_sha,
      repository: row.repository,
      buildNumber: row.build_number,
      generatedAt: row.generated_at,
      metadata: JSON.parse(row.metadata_json),
      prediction: {
        prediction: row.prediction,
        failure_probability: row.failure_probability,
        threshold: row.threshold,
        model_type: row.model_type,
        warning: row.warning,
      },
    };

    res.json({
      available: true,
      latestPrediction,
    });
  } catch (error) {
    console.error("Latest ML prediction error:", error.message);

    res.status(500).json({
      error: "Failed to retrieve the latest ML prediction",
    });
  }
});

// --------------------------------------------------
// 13. Retrieve ML prediction history
// --------------------------------------------------

app.get("/api/ml/prediction-history", (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 20);
    const limit = Math.min(100, Math.max(1, requestedLimit));

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return res.status(400).json({
        error: "limit must be a positive integer",
      });
    }

    const rows = db
      .prepare(`
        SELECT *
        FROM ml_prediction_history
        ORDER BY id DESC
        LIMIT ?
      `)
      .all(limit);

    const history = rows.map((row) => ({
      id: row.id,
      commit: row.commit_sha,
      repository: row.repository,
      buildNumber: row.build_number,
      generatedAt: row.generated_at,
      metadata: JSON.parse(row.metadata_json),
      prediction: {
        prediction: row.prediction,
        failure_probability: row.failure_probability,
        threshold: row.threshold,
        model_type: row.model_type,
        warning: row.warning,
      },
    }));

    res.json({
      total: history.length,
      history,
    });
  } catch (error) {
    console.error("ML prediction history error:", error.message);

    res.status(500).json({
      error: "Failed to retrieve ML prediction history",
    });
  }
});

// --------------------------------------------------
// 14. Start the server after registering all routes
// --------------------------------------------------
console.log("DEBUG ROUTE FILE LOADED:", __filename);
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
