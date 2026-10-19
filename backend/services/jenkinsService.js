
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

const PROJECT_ID = 2;

function getJobPath() {
  return JENKINS_JOB_NAME
    .split("/")
    .map((part) => `job/${encodeURIComponent(part)}`)
    .join("/");
}

function getJenkinsAuthHeaders() {
  const auth = Buffer.from(
    `${JENKINS_USER}:${JENKINS_API_TOKEN}`
  ).toString("base64");

  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
  };
}

async function fetchJenkinsJson(url) {
  const response = await fetch(url, {
    headers: getJenkinsAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(
      `Jenkins API returned HTTP ${response.status}`
    );
  }

  return response.json();
}

async function getLatestTestMetrics(jobPath, latestBuildNumber) {
  if (!latestBuildNumber) {
    return {
      buildNumber: null,
      totalTests: null,
      passedTests: null,
      failedTests: null,
      skippedTests: null,
      testPassRate: null,
      available: false,
      message: "No Jenkins build is available.",
    };
  }

  const reportUrl = new URL(
    `${jobPath}/${latestBuildNumber}/testReport/api/json`,
    JENKINS_URL.endsWith("/")
      ? JENKINS_URL
      : `${JENKINS_URL}/`
  );

  // Use the exact field names returned by Jenkins JUnit API.
  reportUrl.searchParams.set(
    "tree",
    "passCount,failCount,skipCount"
  );

  try {
    const report = await fetchJenkinsJson(reportUrl);

    const passedTests = Number(report.passCount);
    const failedTests = Number(report.failCount);
    const skippedTests = Number(report.skipCount);

    if (
      !Number.isInteger(passedTests) ||
      !Number.isInteger(failedTests) ||
      !Number.isInteger(skippedTests) ||
      passedTests < 0 ||
      failedTests < 0 ||
      skippedTests < 0
    ) {
      throw new Error("Jenkins returned invalid test counts.");
    }

    const totalTests =
      passedTests + failedTests + skippedTests;

    // Skipped tests are excluded from the pass-rate denominator.
    const executedTests = passedTests + failedTests;

    const testPassRate =
      executedTests > 0
        ? Number(
            ((passedTests / executedTests) * 100).toFixed(2)
          )
        : null;

    return {
      buildNumber: latestBuildNumber,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      testPassRate,
      available: true,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    // Missing test reports must not break build metrics.
    return {
      buildNumber: latestBuildNumber,
      totalTests: null,
      passedTests: null,
      failedTests: null,
      skippedTests: null,
      testPassRate: null,
      available: false,
      message: `Test report unavailable: ${error.message}`,
    };
  }
}

async function getJenkinsMetrics() {
  if (!JENKINS_USER || !JENKINS_API_TOKEN) {
    throw new Error(
      "JENKINS_USER or JENKINS_API_TOKEN is missing from backend/.env"
    );
  }

  const jobPath = getJobPath();

  const jobUrl = new URL(
    `${jobPath}/api/json`,
    JENKINS_URL.endsWith("/")
      ? JENKINS_URL
      : `${JENKINS_URL}/`
  );

  jobUrl.searchParams.set(
    "tree",
    "name,lastBuild[number,result],builds[number,result,timestamp,duration]"
  );

  const job = await fetchJenkinsJson(jobUrl);

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

  const latestBuildNumber = job.lastBuild?.number ?? null;

  const testMetrics = await getLatestTestMetrics(
    jobPath,
    latestBuildNumber
  );

  return {
    jobName: job.name,
    totalBuilds,
    successfulBuilds,
    failedBuilds,
    buildSuccessRate,
    testMetrics,
    builds,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getJenkinsMetrics };
