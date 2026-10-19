from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.recommender import SelbuyHybridRecommender


BASE_DIR = Path(__file__).resolve().parent.parent

MODEL_PATH = (
    BASE_DIR
    / "artifacts"
    / "selbuy_m3_bundle.joblib"
)

recommender = None


class InteractionInput(BaseModel):
    item_id: int
    weight: float = Field(
        default=1.0,
        ge=0.0,
    )


class HistoryRecommendationRequest(BaseModel):
    interacted_items: list[InteractionInput] = Field(
        default_factory=list
    )
    interests: list[str] = Field(
        default_factory=list
    )
    top_k: int = Field(
        default=10,
        ge=1,
        le=100,
    )


def get_recommender():
    if recommender is None:
        raise HTTPException(
            status_code=503,
            detail="Recommendation model is not loaded.",
        )

    return recommender


@asynccontextmanager
async def lifespan(app: FastAPI):
    global recommender

    try:
        recommender = SelbuyHybridRecommender(
            MODEL_PATH
        )

        print(
            "Selbuy recommendation model "
            "loaded successfully."
        )
        print(f"Model path: {MODEL_PATH}")

    except Exception as error:
        recommender = None
        print(
            "Recommendation model could not "
            f"be loaded: {error}"
        )

    yield
    recommender = None


app = FastAPI(
    title="Selbuy AI Recommendation Service",
    description=(
        "FastAPI API for Selbuy's trained "
        "hybrid recommendation model."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "service": "Selbuy AI Recommendation Service",
        "status": "running",
        "documentation": "/docs",
    }


@app.get("/health")
def health():
    model = get_recommender()
    return model.health()


@app.get("/recommend/{user_id}")
def recommend_for_user(
    user_id: int,
    top_k: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
):
    model = get_recommender()

    try:
        recommendations = model.recommend(
            user_id=user_id,
            top_k=top_k,
        )

        return {
            "user_id": user_id,
            "top_k": top_k,
            "count": len(recommendations),
            "recommendations": recommendations,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "Recommendations could not "
                "be generated."
            ),
        ) from error


@app.get("/similar/{item_id}")
def similar_items(
    item_id: int,
    top_k: int = Query(
        default=10,
        ge=1,
        le=100,
    ),
):
    model = get_recommender()

    try:
        recommendations = model.similar_items(
            item_id=item_id,
            top_k=top_k,
        )

        if not recommendations:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Item was not found in the "
                    "trained model or no similar "
                    "items were available."
                ),
            )

        return {
            "item_id": item_id,
            "top_k": top_k,
            "count": len(recommendations),
            "recommendations": recommendations,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "Similar products could not "
                "be generated."
            ),
        ) from error


@app.post("/recommend/history")
def recommend_from_history(
    request: HistoryRecommendationRequest,
):
    model = get_recommender()

    try:
        interactions = [
            interaction.model_dump()
            for interaction
            in request.interacted_items
        ]

        recommendations = (
            model.recommend_from_history(
                interacted_items=interactions,
                interests=request.interests,
                top_k=request.top_k,
            )
        )

        return {
            "top_k": request.top_k,
            "provided_interactions": len(
                request.interacted_items
            ),
            "count": len(recommendations),
            "recommendations": recommendations,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=(
                "History-based recommendations "
                "could not be generated."
            ),
        ) from error