import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  CheckCircle2,
  Code2,
  Database,
  Gauge,
  GitBranch,
  RefreshCw,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
  Clock,
  TestTube2,
  Rocket,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import "./App.css";

const API_URL = "http://localhost:5000";
const PROJECT_ID = 2;

const initialMetrics = [
  { label: "Code Coverage", value: "—", unit: "%", icon: Target },
  { label: "Defect Density", value: "N/A", unit: "", icon: AlertTriangle },
  { label: "Code Complexity", value: "—", unit: "", icon: Code2 },
  { label: "Build Success Rate", value: "—", unit: "%", icon: GitBranch },
  { label: "Deployment Frequency", value: "N/A", unit: "", icon: Rocket },
  { label: "Lead Time for Changes", value: "N/A", unit: "", icon: Clock },
  { label: "Change Failure Rate", value: "N/A", unit: "%", icon: XCircle },
  { label: "Mean Time to Recovery", value: "N/A", unit: "", icon: RefreshCw },
  { label: "Code Vulnerabilities", value: "—", unit: "", icon: ShieldCheck },
  { label: "Test Pass Rate", value: "—", unit: "%", icon: TestTube2 },
];

function formatNumber(value, digits = 1) {
  if (value == null || value === "") return "N/A";

  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "N/A";
}

function calculateScores(metrics) {
  if (!metrics) {
    return { qrs: null, rrs: null };
  }

  // Illustrative Quality Risk Score, not an official SonarQube score.
  const bugRisk = Math.min(Number(metrics.bugs ?? 0) * 5, 100);
  const vulnerabilityRisk = Math.min(
    Number(metrics.vulnerabilities ?? 0) * 15,
    100
  );
  const complexityRisk = Math.min(
    Number(metrics.complexity ?? 0) * 2,
    100
  );
  const duplicationRisk = Math.min(
    Number(metrics.duplication ?? 0) * 5,
    100
  );
  const coverage = Number(metrics.coverage ?? 0);

  const qrs = Math.round(
    100 -
      (0.3 * bugRisk +
        0.2 * vulnerabilityRisk +
        0.2 * complexityRisk +
        0.15 * duplicationRisk +
        0.15 * (100 - coverage))
  );

  const hasRrsInputs =
    metrics.coverage != null &&
    metrics.build_success_rate != null &&
    metrics.deployment_success_rate != null &&
    metrics.security_score != null &&
    metrics.maintainability_score != null;

  const rrs = hasRrsInputs
    ? Math.round(
        0.25 * Number(metrics.coverage) +
          0.2 * Number(metrics.build_success_rate) +
          0.2 * Number(metrics.deployment_success_rate) +
          0.2 * Number(metrics.security_score) +
          0.15 * Number(metrics.maintainability_score)
      )
    : null;

  return {
    qrs: Math.max(0, Math.min(100, qrs)),
    rrs: rrs == null ? null : Math.max(0, Math.min(100, rrs)),
  };
}

function scoreLabel(score) {
  if (score === null) return "Waiting for data";
  if (score >= 80) return "Good";
  if (score >= 60) return "Moderate";
  return "Needs improvement";
}

function App() {
  const [project, setProject] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [sonarMetrics, setSonarMetrics] = useState(null);
  const [jenkinsMetrics, setJenkinsMetrics] = useState(null);
  const [jenkinsHistory, setJenkinsHistory] = useState([]);
  const [jenkinsHistoryError, setJenkinsHistoryError] = useState("");

  // Experimental ML failure prediction state.
  const [mlPrediction, setMlPrediction] = useState(null);
  const [mlLoading, setMlLoading] = useState(false);
  const [mlError, setMlError] = useState("");
  // Latest prediction generated automatically by the Jenkins pipeline.
  const [latestJenkinsPrediction, setLatestJenkinsPrediction] = useState(null);
  const [latestPredictionError, setLatestPredictionError] = useState("");
  const [mlInputs, setMlInputs] = useState({
    additions: "73",
    deletions: "14",
    files_modified: "9",
    msg_len: "120",
    is_merge: "0",
    num_parents: "1",
    time_since_last_commit: "3600",
    repo: "home-assistant/core",
    event: "push",
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sonarError, setSonarError] = useState("");
  const [jenkinsError, setJenkinsError] = useState("");

  async function predictFailure(event) {
    event.preventDefault();
    setMlLoading(true);
    setMlError("");
    setMlPrediction(null);

    const additions = Number(mlInputs.additions);
    const deletions = Number(mlInputs.deletions);

    const payload = {
      additions,
      deletions,
      total_churn: additions + deletions,
      files_modified: Number(mlInputs.files_modified),
      msg_len: Number(mlInputs.msg_len),
      is_merge: Number(mlInputs.is_merge),
      num_parents: Number(mlInputs.num_parents),
      time_since_last_commit: Number(mlInputs.time_since_last_commit),
      repo: mlInputs.repo.trim(),
      event: mlInputs.event,
    };

    try {
      const response = await fetch(`${API_URL}/api/ml/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        const detail = data.details?.detail;

        const validationMessage = Array.isArray(detail)
          ? detail
              .map((item) => `${item.loc?.join(".")}: ${item.msg}`)
              .join("; ")
          : null;

        throw new Error(
          validationMessage ||
            data.error ||
            "Could not generate a prediction."
        );
      }

      if (
        !data.prediction ||
        typeof data.prediction.failure_probability !== "number"
      ) {
        throw new Error("The ML API returned an unexpected response.");
      }

      setMlPrediction(data.prediction);
    } catch (err) {
      setMlError(
        err.message || "Unable to reach the ML prediction API."
      );
    } finally {
      setMlLoading(false);
    }
  }

  async function fetchMetrics(backgroundRefresh = false) {
    // Do not show the full-page loading state during automatic refreshes.
    if (!backgroundRefresh) {
      setLoading(true);
    }

    setError("");
    setSonarError("");
    setJenkinsError("");
    setJenkinsHistoryError("");

    const [
      databaseResult,
      sonarResult,
      jenkinsResult,
      historyResult,
    ] = await Promise.allSettled([
      fetch(`${API_URL}/api/projects/${PROJECT_ID}/metrics`),
      fetch(`${API_URL}/api/sonar/metrics`),
      fetch(`${API_URL}/api/jenkins/metrics`),
      fetch(`${API_URL}/api/jenkins/history?projectId=${PROJECT_ID}`),
    ]);

    // 1. Load SQLite snapshot data.
    try {
      if (databaseResult.status === "rejected") {
        throw new Error("Cannot connect to the SQLite backend.");
      }

      const response = databaseResult.value;

      if (!response.ok) {
        throw new Error(`SQLite API returned HTTP ${response.status}`);
      }

      const data = await response.json();

      setProject(data.project || null);

      const snapshots = Array.isArray(data.metrics) ? data.metrics : [];

      setMetrics(snapshots.length > 0 ? snapshots[0] : null);
    } catch (err) {
      setError(
        `${err.message || "Unable to load delivery metrics"}. Make sure the backend is running on port 5000.`
      );

      setMetrics(null);
      setProject(null);
    }

    // 2. Load live SonarQube quality metrics.
    try {
      if (sonarResult.status === "rejected") {
        throw new Error("Cannot connect to the SonarQube API.");
      }

      const response = sonarResult.value;

      if (!response.ok) {
        throw new Error(`SonarQube API returned HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.metrics) {
        throw new Error("SonarQube returned no metrics.");
      }

      setSonarMetrics(data.metrics);
    } catch (err) {
      setSonarError(err.message || "Unable to load SonarQube metrics.");
      setSonarMetrics(null);
    }

    // 3. Load live Jenkins build metrics.
    try {
      if (jenkinsResult.status === "rejected") {
        throw new Error("Cannot connect to the Jenkins API.");
      }

      const response = jenkinsResult.value;

      if (!response.ok) {
        throw new Error(`Jenkins API returned HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.metrics) {
        throw new Error("Jenkins returned no metrics.");
      }

      setJenkinsMetrics(data.metrics);
    } catch (err) {
      setJenkinsError(err.message || "Unable to load Jenkins metrics.");
      setJenkinsMetrics(null);
    }

    // 4. Load persisted Jenkins build history from SQLite.
    try {
      if (historyResult.status === "rejected") {
        throw new Error("Cannot connect to the Jenkins history API.");
      }

      const response = historyResult.value;

      if (!response.ok) {
        throw new Error(
          `Jenkins history API returned HTTP ${response.status}`
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.history)) {
        throw new Error(
          "Jenkins history API returned an invalid response."
        );
      }

      setJenkinsHistory(data.history);
    } catch (err) {
      setJenkinsHistoryError(
        err.message || "Unable to load saved Jenkins build history."
      );

      setJenkinsHistory([]);
    } finally {
      if (!backgroundRefresh) {
        setLoading(false);
      }
    }
  }

  // Load the latest prediction created by Jenkins.
  async function fetchLatestJenkinsPrediction() {
    try {
      const response = await fetch(`${API_URL}/api/ml/latest-prediction`);
      if (!response.ok) {
        throw new Error(`Latest prediction API returned HTTP ${response.status}`);
      }

      const data = await response.json();
      setLatestJenkinsPrediction(data.available ? data.latestPrediction : null);
      setLatestPredictionError("");
    } catch (err) {
      setLatestPredictionError(err.message || "Unable to load the latest Jenkins prediction.");
    }
  }

  // Fetch immediately, then refresh metrics and Jenkins prediction every 30 seconds.
  useEffect(() => {
    fetchMetrics();
    fetchLatestJenkinsPrediction();

    const intervalId = window.setInterval(() => {
      fetchMetrics(true);
      fetchLatestJenkinsPrediction();
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Combine SQLite and SonarQube values.
  const displayMetrics = useMemo(
    () => ({
      ...(metrics || {}),
      ...(sonarMetrics || {}),
    }),
    [metrics, sonarMetrics]
  );

  const scores = useMemo(
    () => calculateScores(displayMetrics),
    [displayMetrics]
  );

  // Dashboard metric cards.
  const metricCards = useMemo(() => {
    if (!metrics && !sonarMetrics && !jenkinsMetrics) {
      return initialMetrics;
    }

    return [
      {
        label: "Code Coverage",
        value:
          sonarMetrics?.coverage != null
            ? formatNumber(sonarMetrics.coverage)
            : "N/A",
        unit: "%",
        icon: Target,
        source: sonarMetrics
          ? "SonarQube · Live data"
          : "SonarQube unavailable",
      },
      {
        label: "Defect Density",
        value: "N/A",
        unit: "",
        icon: AlertTriangle,
        source: "Not calculated",
      },
      {
        label: "Code Complexity",
        value:
          sonarMetrics?.complexity != null
            ? String(sonarMetrics.complexity)
            : "N/A",
        unit: "",
        icon: Code2,
        source: sonarMetrics
          ? "SonarQube · Live data"
          : "SonarQube unavailable",
      },
      {
        label: "Build Success Rate",
        value:
          jenkinsMetrics?.buildSuccessRate != null
            ? formatNumber(jenkinsMetrics.buildSuccessRate)
            : "N/A",
        unit: "%",
        icon: GitBranch,
        source: jenkinsMetrics
          ? `Jenkins · ${jenkinsMetrics.successfulBuilds} successful / ${jenkinsMetrics.totalBuilds} builds`
          : jenkinsError || "Jenkins data unavailable",
      },
      {
        label: "Deployment Frequency",
        value: "N/A",
        unit: "",
        icon: Rocket,
        source: "Deployment events not yet integrated",
      },
      {
        label: "Lead Time for Changes",
        value: "N/A",
        unit: "",
        icon: Clock,
        source: "Commit and deployment timestamps required",
      },
      {
        label: "Change Failure Rate",
        value: "N/A",
        unit: "%",
        icon: XCircle,
        source: "Deployment failure records required",
      },
      {
        label: "Mean Time to Recovery",
        value: "N/A",
        unit: "",
        icon: RefreshCw,
        source: "Incident and recovery timestamps required",
      },
      {
        label: "Code Vulnerabilities",
        value:
          sonarMetrics?.vulnerabilities != null
            ? String(sonarMetrics.vulnerabilities)
            : "N/A",
        unit: "",
        icon: ShieldCheck,
        source: sonarMetrics
          ? "SonarQube · Live data"
          : "SonarQube unavailable",
      },
      {
        label: "Test Pass Rate",
        value:
          metrics?.test_pass_rate != null
            ? formatNumber(metrics.test_pass_rate)
            : "N/A",
        unit: "%",
        icon: TestTube2,
        source: "SQLite snapshot",
      },
    ];
  }, [metrics, sonarMetrics, jenkinsMetrics, jenkinsError]);

  // Percentage chart.
  const chartData = useMemo(() => {
    const data = [];

    if (sonarMetrics?.coverage != null) {
      data.push({
        name: "Coverage",
        value: Number(sonarMetrics.coverage),
      });
    }

    if (jenkinsMetrics?.buildSuccessRate != null) {
      data.push({
        name: "Build",
        value: Number(jenkinsMetrics.buildSuccessRate),
      });
    }

    if (metrics?.test_pass_rate != null) {
      data.push({
        name: "Tests",
        value: Number(metrics.test_pass_rate),
      });
    }

    if (metrics?.deployment_success_rate != null) {
      data.push({
        name: "Deploy",
        value: Number(metrics.deployment_success_rate),
      });
    }

    return data.filter(
      (item) =>
        Number.isFinite(item.value) &&
        item.value >= 0 &&
        item.value <= 100
    );
  }, [metrics, sonarMetrics, jenkinsMetrics]);

  // Historical build durations from records saved in SQLite.
  const buildDurationData = useMemo(
    () =>
      [...jenkinsHistory]
        .filter(
          (build) =>
            build.buildNumber != null &&
            build.durationMs != null &&
            Number.isFinite(Number(build.durationMs))
        )
        .sort(
          (a, b) => Number(a.buildNumber) - Number(b.buildNumber)
        )
        .map((build) => ({
          build: `#${build.buildNumber}`,
          buildNumber: Number(build.buildNumber),
          durationSeconds: Number(
            (Number(build.durationMs) / 1000).toFixed(1)
          ),
          result: build.result,
        })),
    [jenkinsHistory]
  );

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f5f7fb",
      color: "#172033",
      fontFamily: "Inter, Segoe UI, Arial, sans-serif",
    },
    header: {
      background: "#111b34",
      color: "#ffffff",
      padding: "22px 5%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 16,
    },
    main: {
      maxWidth: 1440,
      margin: "0 auto",
      padding: "28px 5%",
    },
    card: {
      background: "#ffffff",
      border: "1px solid #e5eaf2",
      borderRadius: 14,
      padding: 20,
      boxShadow: "0 4px 16px rgba(20, 35, 70, 0.04)",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
      gap: 16,
    },
    sectionTitle: {
      fontSize: 19,
      margin: "0 0 16px",
      color: "#172033",
    },
    muted: {
      color: "#68758b",
      fontSize: 13,
    },
    button: {
      border: "1px solid #405072",
      borderRadius: 9,
      background: "#1b2947",
      color: "#ffffff",
      padding: "10px 14px",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    },
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              background: "#314a78",
              padding: 12,
              borderRadius: 12,
              display: "flex",
            }}
          >
            <Activity size={27} />
          </div>

          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>
              Smart DevOps Intelligence
            </h1>
            <p style={{ margin: "5px 0 0", color: "#c2cce0", fontSize: 13 }}>
              Software Quality & Metrics Platform
            </p>
          </div>
        </div>

        <button
          style={styles.button}
          disabled={loading}
          onClick={() => fetchMetrics()}
        >
          <RefreshCw size={16} />
          {loading ? "Refreshing..." : "Refresh Metrics"}
        </button>
      </header>

      <main style={styles.main}>
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 26,
          }}
        >
          <div>
            <p style={styles.muted}>PROJECT OVERVIEW</p>
            <h2 style={{ fontSize: 25, margin: "4px 0 8px" }}>
              {project?.name ||
                "Smart DevOps Metrics Intelligence Platform"}
            </h2>
            <p style={{ ...styles.muted, margin: 0 }}>
              Project ID: {PROJECT_ID}
              {metrics?.created_at
                ? ` • Latest SQLite snapshot: ${metrics.created_at}`
                : ""}
            </p>
          </div>

          <div
            style={{
              ...styles.card,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            {error ? (
              <XCircle size={17} color="#dc2626" />
            ) : loading ? (
              <RefreshCw size={17} color="#d97706" />
            ) : (
              <CheckCircle2 size={17} color="#16a34a" />
            )}

            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {error
                ? "SQLite API Error"
                : loading
                  ? "Loading metrics..."
                  : "Dashboard Loaded"}
            </span>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            style={{
              ...styles.card,
              marginBottom: 22,
              color: "#b91c1c",
              borderColor: "#fecaca",
            }}
          >
            <strong>Could not load SQLite delivery data.</strong>
            <p style={{ marginBottom: 0 }}>{error}</p>
          </div>
        )}

        {sonarError && (
          <div
            role="alert"
            style={{
              ...styles.card,
              marginBottom: 22,
              color: "#b91c1c",
              borderColor: "#fecaca",
            }}
          >
            <strong>SonarQube metrics unavailable.</strong>
            <p style={{ marginBottom: 0 }}>{sonarError}</p>
          </div>
        )}

        {jenkinsError && (
          <div
            role="alert"
            style={{
              ...styles.card,
              marginBottom: 22,
              color: "#b91c1c",
              borderColor: "#fecaca",
            }}
          >
            <strong>Jenkins metrics unavailable.</strong>
            <p style={{ marginBottom: 0 }}>{jenkinsError}</p>
          </div>
        )}

        {loading && (
          <div style={{ ...styles.card, marginBottom: 22 }}>
            Loading your project, SonarQube, and Jenkins metrics...
          </div>
        )}

        {!loading && !metrics && !sonarMetrics && !jenkinsMetrics && (
          <div style={{ ...styles.card, marginBottom: 22 }}>
            No metrics could be loaded from SQLite, SonarQube, or Jenkins.
          </div>
        )}

        {/* Software quality and delivery metric cards */}
        <section style={{ marginBottom: 30 }}>
          <h3 style={styles.sectionTitle}>
            Software Quality & Delivery Metrics
          </h3>

          <div style={styles.grid}>
            {metricCards.map((item) => {
              const Icon = item.icon;

              return (
                <div key={item.label} style={styles.card}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span style={styles.muted}>{item.label}</span>
                    <Icon size={19} color="#536b99" />
                  </div>

                  <div
                    style={{
                      fontSize: 29,
                      fontWeight: 750,
                      marginTop: 17,
                      color: "#18243c",
                    }}
                  >
                    {item.value}
                    {item.value !== "N/A" && item.value !== "—"
                      ? item.unit
                      : ""}
                  </div>

                  <p style={{ ...styles.muted, margin: "8px 0 0" }}>
                    {item.source ||
                      (item.value === "N/A"
                        ? "Data source not connected"
                        : "Latest available value")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* QRS and RRS score cards */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Gauge size={21} color="#536b99" />
              <h3 style={{ ...styles.sectionTitle, margin: 0 }}>
                Quality Risk Score (QRS)
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginTop: 25,
              }}
            >
              <span style={{ fontSize: 48, fontWeight: 800 }}>
                {scores.qrs ?? "—"}
              </span>
              <span style={styles.muted}>/ 100</span>
            </div>

            <p style={{ marginBottom: 16, color: "#536b99" }}>
              {scoreLabel(scores.qrs)}
            </p>

            <div
              style={{
                height: 9,
                background: "#e8edf5",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${scores.qrs ?? 0}%`,
                  height: "100%",
                  background: "#536b99",
                  borderRadius: 99,
                }}
              />
            </div>

            <p style={{ ...styles.muted, marginTop: 16 }}>
              Illustrative score derived from source-quality metrics. Higher
              is better; this is not an official SonarQube score.
            </p>
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <TrendingUp size={21} color="#16856b" />
              <h3 style={{ ...styles.sectionTitle, margin: 0 }}>
                Release Readiness Score (RRS)
              </h3>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginTop: 25,
              }}
            >
              <span style={{ fontSize: 48, fontWeight: 800 }}>
                {scores.rrs ?? "—"}
              </span>
              <span style={styles.muted}>/ 100</span>
            </div>

            <p style={{ marginBottom: 16, color: "#16856b" }}>
              {scoreLabel(scores.rrs)}
            </p>

            <div
              style={{
                height: 9,
                background: "#e8edf5",
                borderRadius: 99,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${scores.rrs ?? 0}%`,
                  height: "100%",
                  background: "#16856b",
                  borderRadius: 99,
                }}
              />
            </div>

            <p style={{ ...styles.muted, marginTop: 16 }}>
              Requires coverage, build success, deployment success, security,
              and maintainability inputs. Missing inputs are not guessed.
            </p>
          </div>
        </section>

        {/* Quality and delivery chart */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
            marginBottom: 30,
          }}
        >
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Quality & Delivery Overview</h3>

            <p style={styles.muted}>
              Available percentage metrics from SonarQube, Jenkins, and the
              SQLite snapshot. Unavailable metrics are omitted.
            </p>

            {chartData.length > 0 ? (
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 12, right: 8, left: -18, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5eaf2"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: "#68758b" }}
                      angle={-20}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: "#68758b" }}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="Percentage"
                      fill="#536b99"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={styles.muted}>
                Chart data will appear after metrics load.
              </p>
            )}
          </div>

          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>
              Engineering Health — SonarQube
            </h3>

            {sonarMetrics ? (
              <div style={{ display: "grid", gap: 18 }}>
                {[
                  {
                    label: "Open Bugs",
                    value: sonarMetrics.bugs ?? "N/A",
                    icon: AlertTriangle,
                  },
                  {
                    label: "Security Vulnerabilities",
                    value: sonarMetrics.vulnerabilities ?? "N/A",
                    icon: ShieldCheck,
                  },
                  {
                    label: "Code Smells",
                    value: sonarMetrics.code_smells ?? "N/A",
                    icon: Code2,
                  },
                  {
                    label: "Code Duplication",
                    value:
                      sonarMetrics.duplication != null
                        ? `${formatNumber(sonarMetrics.duplication)}%`
                        : "N/A",
                    icon: Database,
                  },
                  {
                    label: "Lines of Code",
                    value: sonarMetrics.lines_of_code ?? "N/A",
                    icon: Code2,
                  },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        borderBottom: "1px solid #edf0f5",
                        paddingBottom: 14,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Icon size={18} color="#68758b" />
                        <span>{item.label}</span>
                      </div>

                      <strong>{item.value}</strong>
                    </div>
                  );
                })}

                <p style={{ ...styles.muted, margin: 0 }}>
                  Last fetched:{" "}
                  {sonarMetrics.fetchedAt
                    ? new Date(sonarMetrics.fetchedAt).toLocaleString()
                    : "Not provided"}
                </p>
              </div>
            ) : (
              <p style={styles.muted}>
                SonarQube data is unavailable. Check the error message above.
              </p>
            )}
          </div>
        </section>

        {/* Historical Jenkins build duration chart */}
        <section style={{ ...styles.card, marginBottom: 30 }}>
          <h3 style={styles.sectionTitle}>
            Historical Jenkins Build Duration
          </h3>

          <p style={styles.muted}>
            Build durations from Jenkins records saved in SQLite. Lower
            durations indicate faster builds; this chart shows duration, not
            build success rate.
          </p>

          {jenkinsHistoryError ? (
            <p role="alert" style={{ color: "#b91c1c" }}>
              {jenkinsHistoryError}
            </p>
          ) : buildDurationData.length > 0 ? (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={buildDurationData}
                  margin={{ top: 12, right: 20, left: 0, bottom: 12 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5eaf2"
                  />
                  <XAxis
                    dataKey="build"
                    tick={{ fontSize: 12, fill: "#68758b" }}
                  />
                  <YAxis
                    label={{
                      value: "Duration (seconds)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#68758b", fontSize: 12 },
                    }}
                    tick={{ fontSize: 11, fill: "#68758b" }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value} sec`, "Duration"]}
                    labelFormatter={(label) => `Build ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="durationSeconds"
                    name="Build duration"
                    stroke="#536b99"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p style={styles.muted}>
              No saved build-duration records are available yet.
            </p>
          )}

          <p style={{ ...styles.muted, marginBottom: 0 }}>
            Saved builds: {jenkinsHistory.length}
          </p>
        </section>

        {/* Recent Jenkins build history table */}
        <section style={{ ...styles.card, marginBottom: 30 }}>
          <h3 style={styles.sectionTitle}>Recent Jenkins Build History</h3>

          <p style={styles.muted}>
            Build results retrieved from your Jenkins pipeline.
          </p>

          {!jenkinsMetrics ? (
            <p style={styles.muted}>
              Jenkins build history is unavailable. Check the Jenkins
              connection.
            </p>
          ) : !jenkinsMetrics.builds?.length ? (
            <p style={styles.muted}>
              No completed builds are available yet.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ background: "#f5f7fb" }}>
                    {["Build", "Status", "Duration", "Date and Time"].map(
                      (heading) => (
                        <th
                          key={heading}
                          style={{
                            padding: 12,
                            borderBottom: "1px solid #e5eaf2",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {jenkinsMetrics.builds.map((build) => (
                    <tr key={build.number}>
                      <td
                        style={{
                          padding: 12,
                          borderBottom: "1px solid #edf0f5",
                        }}
                      >
                        #{build.number}
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom: "1px solid #edf0f5",
                          fontWeight: 600,
                          color:
                            build.result === "SUCCESS"
                              ? "#16856b"
                              : "#dc2626",
                        }}
                      >
                        {build.result}
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom: "1px solid #edf0f5",
                        }}
                      >
                        {build.duration != null
                          ? `${(build.duration / 1000).toFixed(1)} sec`
                          : "N/A"}
                      </td>

                      <td
                        style={{
                          padding: 12,
                          borderBottom: "1px solid #edf0f5",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {build.timestamp
                          ? new Date(build.timestamp).toLocaleString()
                          : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Latest automatic Jenkins prediction */}
        <section style={{ ...styles.card, marginBottom: 30 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={styles.sectionTitle}>Latest Jenkins Commit Prediction</h3>
              <p style={styles.muted}>
                Automatically fetched from the prediction generated by the Jenkins pipeline.
                This card refreshes every 30 seconds.
              </p>
            </div>
            <button
              type="button"
              style={styles.button}
              onClick={fetchLatestJenkinsPrediction}
            >
              <RefreshCw size={16} /> Refresh Prediction
            </button>
          </div>

          {latestPredictionError ? (
            <p role="alert" style={{ color: "#b91c1c" }}>{latestPredictionError}</p>
          ) : latestJenkinsPrediction ? (
            <div style={{ display: "grid", gap: 18, marginTop: 18 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 16,
                }}
              >
                <div style={{ ...styles.card, boxShadow: "none" }}>
                  <p style={styles.muted}>Predicted outcome</p>
                  <h2
                    style={{
                      fontSize: 28,
                      margin: "8px 0",
                      color:
                        latestJenkinsPrediction.prediction?.prediction === "Failure"
                          ? "#dc2626"
                          : "#16856b",
                    }}
                  >
                    {latestJenkinsPrediction.prediction?.prediction || "N/A"}
                  </h2>
                  <p style={styles.muted}>Experimental model estimate</p>
                </div>
                <div style={{ ...styles.card, boxShadow: "none" }}>
                  <p style={styles.muted}>Failure probability</p>
                  <h2 style={{ fontSize: 28, margin: "8px 0" }}>
                    {typeof latestJenkinsPrediction.prediction?.failure_probability === "number"
                      ? `${(latestJenkinsPrediction.prediction.failure_probability * 100).toFixed(2)}%`
                      : "N/A"}
                  </h2>
                  <p style={styles.muted}>
                    Threshold: {latestJenkinsPrediction.prediction?.threshold ?? "N/A"}
                  </p>
                </div>
                <div style={{ ...styles.card, boxShadow: "none" }}>
                  <p style={styles.muted}>Jenkins build</p>
                  <h2 style={{ fontSize: 28, margin: "8px 0" }}>
                    {latestJenkinsPrediction.buildNumber
                      ? `#${latestJenkinsPrediction.buildNumber}`
                      : "N/A"}
                  </h2>
                  <p style={styles.muted}>
                    {latestJenkinsPrediction.repository || "Repository unavailable"}
                  </p>
                </div>
              </div>

              <div>
                <p style={styles.muted}>Commit SHA</p>
                <code style={{ overflowWrap: "anywhere" }}>
                  {latestJenkinsPrediction.commit || "N/A"}
                </code>
                <p style={{ ...styles.muted, marginTop: 12 }}>
                  Generated: {latestJenkinsPrediction.generatedAt
                    ? new Date(latestJenkinsPrediction.generatedAt).toLocaleString()
                    : "N/A"}
                  {latestJenkinsPrediction.prediction?.model_type
                    ? ` · Model: ${latestJenkinsPrediction.prediction.model_type}`
                    : ""}
                </p>
              </div>

              <div
                style={{
                  padding: 14,
                  borderRadius: 9,
                  border: "1px solid #fde68a",
                  background: "#fffbeb",
                  color: "#92400e",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {latestJenkinsPrediction.prediction?.warning ||
                  "Experimental estimate only; not validated against this project's Jenkins history."}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <p style={styles.muted}>
                No Jenkins-generated prediction is available yet. Run the Jenkins pipeline
                with the prediction stage and keep the Express and ML services running.
              </p>
            </div>
          )}
        </section>

        {/* Experimental manual ML failure prediction */}
        <section style={{ ...styles.card, marginBottom: 30 }}>
          <h3 style={styles.sectionTitle}>
            AI-Powered CI/CD Failure Prediction
          </h3>

          <p style={styles.muted}>
            Enter commit and workflow metadata to request an experimental
            prediction. The model was trained on public GitHub Actions data
            and has not been validated against this project's Jenkins builds.
          </p>

          <form onSubmit={predictFailure}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 16,
                marginBottom: 20,
              }}
            >
              {[
                ["additions", "Code Additions"],
                ["deletions", "Code Deletions"],
                ["files_modified", "Files Modified"],
                ["msg_len", "Commit Message Length"],
                ["is_merge", "Is Merge (0 or 1)"],
                ["num_parents", "Number of Parents"],
                ["time_since_last_commit", "Seconds Since Last Commit"],
              ].map(([key, label]) => (
                <label key={key} style={{ display: "grid", gap: 6 }}>
                  <span style={styles.muted}>{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={mlInputs[key]}
                    onChange={(event) =>
                      setMlInputs((previous) => ({
                        ...previous,
                        [key]: event.target.value,
                      }))
                    }
                    style={{
                      padding: 11,
                      border: "1px solid #d9e1ed",
                      borderRadius: 8,
                      fontSize: 14,
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                </label>
              ))}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={styles.muted}>Repository</span>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={mlInputs.repo}
                  onChange={(event) =>
                    setMlInputs((previous) => ({
                      ...previous,
                      repo: event.target.value,
                    }))
                  }
                  style={{
                    padding: 11,
                    border: "1px solid #d9e1ed",
                    borderRadius: 8,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={styles.muted}>Workflow Event</span>
                <select
                  value={mlInputs.event}
                  onChange={(event) =>
                    setMlInputs((previous) => ({
                      ...previous,
                      event: event.target.value,
                    }))
                  }
                  style={{
                    padding: 11,
                    border: "1px solid #d9e1ed",
                    borderRadius: 8,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="push">Push</option>
                  <option value="pull_request">Pull Request</option>
                  <option value="workflow_dispatch">Manual Trigger</option>
                  <option value="schedule">Scheduled</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={mlLoading}
              style={styles.button}
            >
              {mlLoading ? "Predicting..." : "Predict Build Failure"}
            </button>
          </form>

          {mlError && (
            <div
              role="alert"
              style={{
                marginTop: 18,
                padding: 12,
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#b91c1c",
                background: "#fff7f7",
              }}
            >
              {mlError}
            </div>
          )}

          {mlPrediction && (
            <div
              aria-live="polite"
              style={{
                marginTop: 24,
                padding: 20,
                background: "#f5f7fb",
                border: "1px solid #e5eaf2",
                borderRadius: 12,
              }}
            >
              <p style={styles.muted}>Predicted Outcome</p>

              <h2
                style={{
                  fontSize: 28,
                  margin: "8px 0",
                  color:
                    mlPrediction.prediction === "Failure"
                      ? "#dc2626"
                      : "#16856b",
                }}
              >
                {mlPrediction.prediction}
              </h2>

              <p>
                Estimated failure probability:{" "}
                <strong>
                  {(
                    Math.min(
                      1,
                      Math.max(0, mlPrediction.failure_probability)
                    ) * 100
                  ).toFixed(2)}
                  %
                </strong>
              </p>

              <div
                role="progressbar"
                aria-label="Estimated failure probability"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(
                  Math.min(
                    1,
                    Math.max(0, mlPrediction.failure_probability)
                  ) * 100
                )}
                style={{
                  height: 12,
                  background: "#e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, mlPrediction.failure_probability * 100)
                    )}%`,
                    height: "100%",
                    background: "#dc2626",
                    transition: "width 200ms ease",
                  }}
                />
              </div>

              <p
                style={{
                  ...styles.muted,
                  marginTop: 16,
                  marginBottom: 0,
                }}
              >
                {mlPrediction.warning ||
                  "Experimental estimate only; not validated on this project's Jenkins history."}
              </p>
            </div>
          )}
        </section>

        {/* Data sources and recommendations */}
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>
            Data Sources & Recommendations
          </h3>

          <div style={{ display: "grid", gap: 16 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <CheckCircle2 size={20} color="#16856b" />

              <div>
                <strong>SonarQube API</strong>
                <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                  {sonarMetrics
                    ? `Connected to ${sonarMetrics.projectKey}. Source-quality metrics are fetched live from SonarQube.`
                    : "Not connected. Source-quality cards will remain unavailable until the API responds."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <Database size={20} color="#536b99" />

              <div>
                <strong>Express API and SQLite</strong>
                <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                  {metrics
                    ? `Loaded the latest saved delivery snapshot for project ${PROJECT_ID}. Snapshot values may be sample data.`
                    : "SQLite delivery metrics could not be loaded."}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <GitBranch size={20} color="#536b99" />

              <div>
                <strong>Jenkins delivery metrics</strong>

                <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                  {jenkinsMetrics
                    ? `Connected to ${jenkinsMetrics.jobName}. Retrieved ${jenkinsMetrics.totalBuilds} builds, with ${formatNumber(jenkinsMetrics.buildSuccessRate)}% success rate.`
                    : "Jenkins build history and delivery metrics are not available yet."}
                </p>

                <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                  Build success rate is calculated from the builds returned by
                  Jenkins. Deployment frequency, lead time, change failure rate,
                  and recovery time require additional deployment or incident
                  records.
                </p>

                {jenkinsMetrics?.fetchedAt && (
                  <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                    Last fetched:{" "}
                    {new Date(jenkinsMetrics.fetchedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <ArrowDownRight size={20} color="#68758b" />

              <div>
                <strong>Machine-learning predictions</strong>
                <p style={{ ...styles.muted, margin: "5px 0 0" }}>
                  The card above displays the latest prediction sent automatically
                  by Jenkins using commit metadata. The manual form below remains
                  available for testing custom inputs. The model is experimental
                  and has not been validated on this project's Jenkins history.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer
          style={{
            textAlign: "center",
            color: "#8994a7",
            fontSize: 12,
            padding: "26px 0 8px",
          }}
        >
          Smart DevOps Software Quality and Metrics Intelligence Platform
        </footer>
      </main>
    </div>
  );
}

export default App;