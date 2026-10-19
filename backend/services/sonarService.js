
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  override: true,
});

const SONAR_URL = process.env.SONAR_URL || "http://localhost:9000";
const SONAR_PROJECT_KEY = process.env.SONAR_PROJECT_KEY;
const SONAR_TOKEN = process.env.SONAR_TOKEN;

const MEASURES = [
  "bugs",
  "vulnerabilities",
  "code_smells",
  "coverage",
  "duplicated_lines_density",
  "complexity",
  "ncloc",
  "reliability_rating",
  "security_rating",
  "sqale_rating",
];

async function getSonarMetrics() {
  if (!SONAR_PROJECT_KEY || !SONAR_TOKEN) {
    throw new Error(
      "SONAR_PROJECT_KEY or SONAR_TOKEN is missing from .env"
    );
  }

  const url = new URL("/api/measures/component", SONAR_URL);

  url.searchParams.set("component", SONAR_PROJECT_KEY);
  url.searchParams.set("metricKeys", MEASURES.join(","));

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SONAR_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `SonarQube API returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!data.component) {
    throw new Error("SonarQube returned no project component");
  }

  const result = Object.fromEntries(
    (data.component.measures || []).map((measure) => [
      measure.metric,
      measure.value == null ? null : Number(measure.value),
    ])
  );

  // Existing SonarQube metrics
  const bugs = result.bugs;
  const linesOfCode = result.ncloc;

  // Defect density = bugs per 1,000 lines of code
  const defectDensity =
    bugs !== null &&
    bugs !== undefined &&
    linesOfCode !== null &&
    linesOfCode !== undefined &&
    linesOfCode > 0
      ? Number(((bugs / linesOfCode) * 1000).toFixed(2))
      : null;

  return {
    projectKey: data.component.key,

    bugs,
    vulnerabilities: result.vulnerabilities,
    code_smells: result.code_smells,
    coverage: result.coverage,
    duplication: result.duplicated_lines_density,
    complexity: result.complexity,
    lines_of_code: linesOfCode,

    // New metric
    defect_density: defectDensity,

    reliability_rating: result.reliability_rating,
    security_rating: result.security_rating,
    maintainability_rating: result.sqale_rating,

    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getSonarMetrics };
