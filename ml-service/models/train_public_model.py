
from pathlib import Path

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.preprocessing import FunctionTransformer


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "public_builds_clean.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "failure_model.joblib"

NUMERIC_FEATURES = [
    "additions",
    "deletions",
    "total_churn",
    "files_modified",
    "msg_len",
    "is_merge",
    "num_parents",
    "time_since_last_commit",
]

CATEGORICAL_FEATURES = ["repo", "event"]
TARGET = "failed"


def main():
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Cleaned dataset not found: {DATA_PATH}"
        )

    df = pd.read_csv(DATA_PATH, low_memory=False)

    features = NUMERIC_FEATURES + CATEGORICAL_FEATURES

    missing = [c for c in features + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    # Only use rows with valid binary targets.
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce")
    df = df[df[TARGET].isin([0, 1])].copy()

    # Normalize feature types.
    for col in NUMERIC_FEATURES:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    for col in CATEGORICAL_FEATURES:
        df[col] = df[col].fillna("Unknown").astype(str)

    # Use commit SHA as a group so runs for the same commit
    # cannot appear in both training and testing.
    # Missing SHAs receive a unique group per workflow run.
    if "commit_sha" in df.columns:
        sha = df["commit_sha"].fillna("").astype(str).str.strip()
        df["_group"] = sha.where(
            sha.ne(""),
            "missing_sha_run_" + df["run_id"].astype(str),
        )
    else:
        df["_group"] = df["run_id"].astype(str)

    X = df[features]
    y = df[TARGET].astype(int)
    groups = df["_group"]

    # Group-aware split prevents the same commit from leaking
    # into both training and test data.
    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.20,
        random_state=42,
    )

    train_idx, test_idx = next(
        splitter.split(X, y, groups=groups)
    )

    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]

    numeric_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    categorical_pipeline = Pipeline([
        ("imputer", SimpleImputer(
            strategy="constant", fill_value="Unknown"
        )),
        ("onehot", OneHotEncoder(handle_unknown="ignore")),
    ])

    preprocessing = ColumnTransformer([
        ("numeric", numeric_pipeline, NUMERIC_FEATURES),
        ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
    ])

    model = Pipeline([
        ("preprocessing", preprocessing),
        ("classifier", LogisticRegression(
            max_iter=1000,
            class_weight="balanced",
            random_state=42,
        )),
    ])

    print("Training records:", len(X_train))
    print("Test records:", len(X_test))
    print("\nTraining label distribution:")
    print(y_train.value_counts().sort_index().to_string())
    print("\nTest label distribution:")
    print(y_test.value_counts().sort_index().to_string())

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]

    print("\n=== PUBLIC CI/CD FAILURE MODEL ===")
    print("Accuracy:", round(accuracy_score(y_test, predictions), 4))
    print(
        "Balanced accuracy:",
        round(balanced_accuracy_score(y_test, predictions), 4),
    )
    print(
        "ROC-AUC:",
        round(roc_auc_score(y_test, probabilities), 4),
    )

    print("\nClassification report:")
    print(classification_report(
        y_test,
        predictions,
        labels=[0, 1],
        target_names=["Success", "Failure"],
        zero_division=0,
    ))

    print("Confusion matrix (rows=true, columns=predicted):")
    print(confusion_matrix(y_test, predictions, labels=[0, 1]))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump({
        "model": model,
        "features": features,
        "numeric_features": NUMERIC_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "target": TARGET,
        "training_data": "public_builds_clean.csv",
    }, MODEL_PATH)

    print("\nSaved model to:")
    print(MODEL_PATH)


if __name__ == "__main__":
    main()
