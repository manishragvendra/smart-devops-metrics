
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Home API
app.get("/", (req, res) => {
  res.json({
    project: "Sample JavaScript App",
    status: "Running",
    message: "Welcome to the Smart DevOps Metrics test project!"
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// Sample calculation API
app.get("/api/metrics", (req, res) => {
  res.json({
    projectName: "Sample JavaScript App",
    totalRequests: 100,
    successfulRequests: 95,
    failedRequests: 5
  });
});

app.listen(PORT, () => {
  console.log(`Sample app running at http://localhost:${PORT}`);
});
