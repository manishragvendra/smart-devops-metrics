
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "failure_model.joblib"

app = FastAPI(
    title="DevOps Failure Prediction API",
    description="Experimental CI/CD workflow failure prediction",
    version="1.0.0",
)

model_bundle = None


class BuildFeatures(BaseModel):
    additions: float = Field(ge=0)
    deletions: float = Field(ge=0)
    total_churn: float = Field(ge=0)
    files_modified: float = Field(ge=0)
    msg_len: float = Field(ge=0)
    is_merge: int = Field(ge=0, le=1)
    num_parents: float = Field(ge=0)
    time_since_last_commit: float = Field(ge=0)
    repo: str = Field(min_length=1, max_length=300)
    event: str = Field(min_length=1, max_length=100)


@app.on_event("startup")
def load_model():
    global model_bundle

    if MODEL_PATH.exists():
        model_bundle = joblib.load(MODEL_PATH)


@app.get("/")
def root():
    return {
        "service": "DevOps Failure Prediction API",
        "status": "running",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": model_bundle is not None,
    }


@app.post("/predict")
def predict(features: BuildFeatures):
    if model_bundle is None:
        raise HTTPException(
            status_code=503,
            detail="Prediction model is not loaded. Train the model first.",
        )

    try:
        input_data = pd.DataFrame([features.model_dump()])
        model = model_bundle["model"]

        probabilities = model.predict_proba(input_data)[0]
        classes = list(model.named_steps["classifier"].classes_)
        failure_index = classes.index(1)

        failure_probability = float(probabilities[failure_index])
        prediction = int(failure_probability >= 0.5)

        return {
            "prediction": "Failure" if prediction == 1 else "Success",
            "failure_probability": round(failure_probability, 4),
            "threshold": 0.5,
            "model_type": "Logistic Regression",
            "warning": (
                "Experimental estimate trained on public GitHub Actions data; "
                "not validated on this project's Jenkins history."
            ),
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(exc)}",
        )
