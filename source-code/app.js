
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

function calculateTotal(price, quantity) {
  return price * quantity;
}

app.get("/", (req, res) => {
  res.json({
    project: "Sample JavaScript App",
    status: "Running",
    message: "Welcome to the Smart DevOps Metrics test project!"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/metrics", (req, res) => {
  res.json({
    projectName: "Sample JavaScript App",
    totalRequests: 100,
    successfulRequests: 99,
    failedRequests: 1
  });
});

// Start the server only when this file is run directly.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Sample app running at http://localhost:${PORT}`);
  });
}

module.exports = { app, calculateTotal };
