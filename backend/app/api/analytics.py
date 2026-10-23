import json
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.app.core.config import settings, is_valid_api_key
from backend.app.core.database import get_db, Document, DocumentChunk, PipelineConfig, EvaluationRun, EvaluationDataset
from backend.app.vectorstores.store import vector_store

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/dashboard")
async def get_dashboard_analytics(db: AsyncSession = Depends(get_db)):
    # 1. Total counts
    doc_count = (await db.execute(select(func.count(Document.id)))).scalar() or 0
    chunk_count = (await db.execute(select(func.count(DocumentChunk.id)))).scalar() or 0
    pipeline_count = (await db.execute(select(func.count(PipelineConfig.id)))).scalar() or 0
    run_count = (await db.execute(select(func.count(EvaluationRun.id)))).scalar() or 0
    dataset_count = (await db.execute(select(func.count(EvaluationDataset.id)))).scalar() or 0

    # 2. Recent documents
    recent_docs_stmt = select(Document).order_by(Document.created_at.desc()).limit(5)
    recent_docs = (await db.execute(recent_docs_stmt)).scalars().all()

    # 3. Recent runs
    recent_runs_stmt = select(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(5)
    recent_runs = (await db.execute(recent_runs_stmt)).scalars().all()

    # 4. Compute aggregate quality benchmarks from runs
    retrieval_benchmarks = {
        "precision_at_k": 0.0,
        "recall_at_k": 0.0,
        "mrr": 0.0,
        "ndcg_at_k": 0.0,
        "context_precision": 0.0,
        "context_recall": 0.0
    }
    completed_runs = [r for r in recent_runs if r.status == "completed" and r.aggregate_scores]
    if completed_runs:
        for m in retrieval_benchmarks.keys():
            vals = []
            for r in completed_runs:
                scores = json.loads(r.aggregate_scores).get("retrieval", {})
                if m in scores and scores[m] > 0:
                    vals.append(scores[m])
            if vals:
                retrieval_benchmarks[m] = round(sum(vals) / len(vals), 2)

    hosted_llm_ready = any([
        is_valid_api_key(settings.GROQ_API_KEY),
        is_valid_api_key(settings.GOOGLE_API_KEY),
        is_valid_api_key(settings.OPENAI_API_KEY),
        is_valid_api_key(settings.ANTHROPIC_API_KEY),
        is_valid_api_key(settings.HUGGINGFACE_API_KEY),
        is_valid_api_key(settings.COHERE_API_KEY)
    ])
    active_demo_provider = "groq" if is_valid_api_key(settings.GROQ_API_KEY) else (
        "gemini" if is_valid_api_key(settings.GOOGLE_API_KEY) else (
            "openai" if is_valid_api_key(settings.OPENAI_API_KEY) else None
        )
    )

    return {
        "demo_mode": settings.DEMO_MODE,
        "hosted_llm_ready": hosted_llm_ready,
        "active_demo_provider": active_demo_provider,
        "metrics": {
            "total_documents": doc_count,
            "total_indexed_chunks": chunk_count or vector_store.count(),
            "active_pipelines": pipeline_count,
            "total_datasets": dataset_count,
            "evaluation_runs": run_count,
            "vector_store_records": vector_store.count()
        },
        "retrieval_benchmarks": retrieval_benchmarks,
        "recent_documents": [
            {
                "id": d.id,
                "file_name": d.file_name,
                "file_type": d.file_type,
                "file_size": d.file_size,
                "status": d.processing_status,
                "created_at": d.created_at.isoformat() if d.created_at else None
            }
            for d in recent_docs
        ],
        "recent_runs": [
            {
                "id": r.id,
                "name": r.name,
                "status": r.status,
                "total_queries": r.total_queries,
                "duration_ms": r.duration_ms,
                "aggregate_scores": json.loads(r.aggregate_scores) if r.aggregate_scores else {},
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in recent_runs
        ]
    }
