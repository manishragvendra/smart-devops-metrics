
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
PUBLIC_DIR = BASE_DIR / "data" / "public_dataset"
OUTPUT_DIR = BASE_DIR / "data"
OUTPUT_PATH = OUTPUT_DIR / "public_builds_clean.csv"

csv_files = list(PUBLIC_DIR.rglob("*.csv"))

if not csv_files:
    raise FileNotFoundError(
        f"No CSV file found inside {PUBLIC_DIR}"
    )

# Use the dataset you downloaded.
input_path = next(
    (
        path for path in csv_files
        if path.name == "final_research_dataset_MASTER.csv"
    ),
    csv_files[0],
)

print("Input file:", input_path)

df = pd.read_csv(input_path, low_memory=False)

print("\nOriginal rows:", len(df))
print("Unique run IDs:", df["run_id"].nunique())

# Normalize important fields.
df["status_clean"] = (
    df["status"].fillna("").astype(str).str.strip().str.lower()
)
df["conclusion_clean"] = (
    df["conclusion"].fillna("").astype(str).str.strip().str.lower()
)

# Prefer completed records with recognized final outcomes.
valid_outcomes = {
    "success",
    "passed",
    "failure",
    "failed",
    "errored",
    "startup_failure",
}

df["has_valid_outcome"] = df["conclusion_clean"].isin(valid_outcomes)
df["is_completed"] = df["status_clean"].eq("completed")

# Sort preferred records first within each run ID.
df = df.sort_values(
    ["has_valid_outcome", "is_completed"],
    ascending=[False, False],
)

# Keep one preferred record for each run ID.
df = df.drop_duplicates(subset=["run_id"], keep="first").copy()

print("Rows after run-ID deduplication:", len(df))

# Keep only outcomes that represent a clear binary label.
df = df[df["conclusion_clean"].isin(valid_outcomes)].copy()

df["failed"] = df["conclusion_clean"].isin(
    {"failure", "failed", "errored", "startup_failure"}
).astype(int)

# Convert candidate numerical features.
numeric_columns = [
    "additions",
    "deletions",
    "total_churn",
    "files_modified",
    "msg_len",
    "is_merge",
    "num_parents",
    "time_since_last_commit",
]

for column in numeric_columns:
    if column in df.columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")

# Retain columns that may help predict a future workflow outcome.
keep_columns = [
    "run_id",
    "repo",
    "commit_sha",
    "conclusion_clean",
    "failed",
    "created_at",
    "run_started_at",
    "event",
    "head_branch",
    "additions",
    "deletions",
    "total_churn",
    "files_modified",
    "msg_len",
    "is_merge",
    "num_parents",
    "time_since_last_commit",
]

keep_columns = [c for c in keep_columns if c in df.columns]
df = df[keep_columns].copy()

# Remove rows without a repository identifier.
df = df[df["repo"].notna() & df["repo"].astype(str).str.strip().ne("")]

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
df.to_csv(OUTPUT_PATH, index=False)

print("\n=== CLEANING SUMMARY ===")
print("Final rows:", len(df))
print("Unique run IDs:", df["run_id"].nunique())
print("\nOutcome distribution:")
print(df["conclusion_clean"].value_counts().to_string())
print("\nBinary labels (0=success, 1=failure):")
print(df["failed"].value_counts().sort_index().to_string())
print("\nRepositories:", df["repo"].nunique())
print("\nSaved cleaned dataset to:")
print(OUTPUT_PATH)
