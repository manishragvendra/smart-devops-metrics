
const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  override: true,
});

const db = require("../src/database");

const JENKINS_URL =
  process.env.JENKINS_URL || "http://localhost:8080";

const JENKINS_USER = process.env.JENKINS_USER;
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN;

const JENKINS_JOB_NAME =
  process.env.JENKINS_JOB_NAME ||
  "Smart-DevOps-Metrics-Pipeline";

// This is the existing project ID in your SQLite database.
const PROJECT_ID = 2;

async function getJenkinsMetrics() {
  if (!JENKINS_USER || !JENKINS_API_TOKEN) {
    throw new Error(
      "JENKINS_USER or JENKINS_API_TOKEN is missing from backend/.env"
    );
  }

  const jobPath = JENKINS_JOB_NAME
    .split("/")
    .map((part) => `job/${encodeURIComponent(part)}`)
    .join("/");

  const url = new URL(
    `${jobPath}/api/json`,
    JENKINS_URL.endsWith("/")
      ? JENKINS_URL
      : `${JENKINS_URL}/`
  );

  url.searchParams.set(
    "tree",
    "name,lastBuild[number,result],builds[number,result,timestamp,duration]"
  );

  const auth = Buffer.from(
    `${JENKINS_USER}:${JENKINS_API_TOKEN}`
  ).toString("base64");

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Jenkins API returned HTTP ${response.status}`
    );
  }

  const job = await response.json();

  const builds = (job.builds || [])
    .filter(
      (build) =>
        build.result === "SUCCESS" ||
        build.result === "FAILURE"
    )
    .map((build) => ({
      number: build.number,
      result: build.result,
      duration: build.duration ?? null,
      timestamp: build.timestamp ?? null,
    }));

  // Prepare an SQLite upsert statement.
  // Existing builds are updated rather than duplicated.
  const saveBuild = db.prepare(`
    INSERT INTO jenkins_builds (
      project_id,
      job_name,
      build_number,
      result,
      duration_ms,
      build_timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_id, job_name, build_number)
    DO UPDATE SET
      result = excluded.result,
      duration_ms = excluded.duration_ms,
      build_timestamp = excluded.build_timestamp
  `);

  // Save all retrieved builds in one transaction.
  const saveBuildsTransaction = db.transaction((items) => {
    for (const build of items) {
      saveBuild.run(
        PROJECT_ID,
        job.name,
        build.number,
        build.result,
        build.duration,
        build.timestamp
      );
    }
  });

  saveBuildsTransaction(builds);

  const successfulBuilds = builds.filter(
    (build) => build.result === "SUCCESS"
  ).length;

  const failedBuilds = builds.filter(
    (build) => build.result === "FAILURE"
  ).length;

  const totalBuilds = builds.length;

  const buildSuccessRate =
    totalBuilds > 0
      ? Number(
          ((successfulBuilds / totalBuilds) * 100).toFixed(2)
        )
      : null;

  return {
    jobName: job.name,
    totalBuilds,
    successfulBuilds,
    failedBuilds,
    buildSuccessRate,
    builds,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getJenkinsMetrics };
