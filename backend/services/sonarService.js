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
    throw new Error("SONAR_PROJECT_KEY or SONAR_TOKEN is missing from .env");
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
    throw new Error(`SonarQube API returned HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.component) {
    throw new Error("SonarQube returned no project component");
  }

  const result = Object.fromEntries(
    (data.component.measures || []).map((measure) => [
      measure.metric,
      Number(measure.value ?? 0),
    ])
  );

  return {
    projectKey: data.component.key,
    bugs: result.bugs ?? 0,
    vulnerabilities: result.vulnerabilities ?? 0,
    code_smells: result.code_smells ?? 0,
    coverage: result.coverage ?? 0,
    duplication: result.duplicated_lines_density ?? 0,
    complexity: result.complexity ?? 0,
    lines_of_code: result.ncloc ?? 0,
    reliability_rating: result.reliability_rating ?? null,
    security_rating: result.security_rating ?? null,
    maintainability_rating: result.sqale_rating ?? null,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getSonarMetrics };
