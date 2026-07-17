"""Similarity routes — Clay-embedding 'find sites like this' + novelty + retrieval.

Query embeddings are produced by Clay in the GPU env; these endpoints SEARCH the
prebuilt index with numpy (engine-safe, no torch). /similarity/demo needs no
embedder, so the UI can show the feature even on the ₹0 default install.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ml import similarity_service as sim

router = APIRouter()


class SimilarityQuery(BaseModel):
    embedding: list[float] = Field(..., min_length=8, description="RAW 1024-d Clay embedding")
    k: int = Field(6, ge=1, le=50)


@router.get("/similarity/info", summary="Clay similarity index availability + stats")
def similarity_info() -> dict:
    return sim.info()


@router.post("/similarity/search", summary="Find labelled sites like this Clay embedding")
def similarity_search(body: SimilarityQuery) -> dict:
    res = sim.search_embedding(body.embedding, k=body.k)
    if not res.get("available"):
        raise HTTPException(status_code=503, detail="similarity index unavailable (build models/clay_index.npz)")
    if res.get("error"):
        raise HTTPException(status_code=422, detail=res["error"])
    return res


@router.get("/similarity/demo", summary="Find-similar demo (no embedder needed)")
def similarity_demo(
    k: int = Query(6, ge=1, le=50),
    cls: int = Query(0, ge=0, le=3),
) -> dict:
    res = sim.demo(k=k, cls=cls)
    if not res.get("available"):
        raise HTTPException(status_code=503, detail="similarity index unavailable (build models/clay_index.npz)")
    return res


@router.get("/similarity/hotspot", summary="True 'sites like THIS hotspot' from its cached embedding")
def similarity_hotspot(
    key: str = Query(..., min_length=1, max_length=120, description="hotspot embed key (region:lat,lon)"),
    k: int = Query(6, ge=1, le=50),
) -> dict:
    res = sim.hotspot(key=key, k=k)
    if not res.get("available"):
        raise HTTPException(status_code=503, detail="similarity index unavailable (build models/clay_index.npz)")
    return res


@router.get("/similarity/change", summary="Temporal change of a site across its embedded observations")
def similarity_change(
    key: str = Query(..., min_length=1, max_length=120, description="hotspot embed key (region:lat,lon)"),
) -> dict:
    res = sim.change(key=key)
    if not res.get("available"):
        raise HTTPException(status_code=503, detail="similarity index unavailable (build models/clay_index.npz)")
    return res


@router.get("/similarity/sites", summary="List embedded sites available for per-hotspot intelligence")
def similarity_sites(limit: int = Query(200, ge=1, le=1000)) -> dict:
    return sim.sites(limit=limit)
