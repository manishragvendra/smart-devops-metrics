
from pathlib import Path

import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split


BASE_DIR = Path(__file__).resolve().parent.parent

DATA_PATH = BASE_DIR / "data" / "build_history.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "failure_model.joblib"

FEATURES = [
    "duration_seconds",
    "previous_failures",
    "previous_success_rate",
]

TARGET = "failed"


def main():
    if not DATA_PATH.exists():
        print(f"Training data not found: {DATA_PATH}")
        print("Next, we need to export Jenkins build history.")
        return

    data = pd.read_csv(DATA_PATH)

    required = FEATURES + [TARGET]
    missing = [column for column in required if column not in data.columns]

    if missing:
        print("Missing required columns:", ", ".join(missing))
        print("Expected columns:", ", ".join(required))
        return

    data = data[required].dropna()

    if len(data) < 50:
        print(f"Only {len(data)} usable records found.")
        print("Collect at least 50 real builds for an initial prototype.")
        print("More data is preferable for reliable evaluation.")
        return

    data[TARGET] = pd.to_numeric(data[TARGET], errors="coerce")
    data = data.dropna()

    if not data[TARGET].isin([0, 1]).all():
        print("The 'failed' column must contain only 0 or 1.")
        return

    if data[TARGET].nunique() < 2:
        print("Training data must contain both successful and failed builds.")
        return

    X = data[FEATURES].apply(pd.to_numeric, errors="coerce")
    y = data[TARGET].astype(int)

    valid = X.notna().all(axis=1)
    X = X.loc[valid]
    y = y.loc[valid]

    if len(X) < 50 or y.nunique() < 2:
        print("Not enough valid records from both classes to train.")
        return

    # Stratify so both classes are represented in each split.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=42,
    )

    model.fit(X_train, y_train)
    predictions = model.predict(X_test)

    print("\n=== Jenkins Failure Model Evaluation ===")
    print("Training records:", len(X_train))
    print("Test records:", len(X_test))
    print("Accuracy:", round(accuracy_score(y_test, predictions), 4))
    print("\nClassification report:")
    print(
        classification_report(
            y_test,
            predictions,
            labels=[0, 1],
            target_names=["Success", "Failure"],
            zero_division=0,
        )
    )
    print("Confusion matrix:")
    print(confusion_matrix(y_test, predictions, labels=[0, 1]))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(
        {
            "model": model,
            "features": FEATURES,
            "target": TARGET,
        },
        MODEL_PATH,
    )

    print(f"\nModel saved to: {MODEL_PATH}")


if __name__ == "__main__":
    main()
