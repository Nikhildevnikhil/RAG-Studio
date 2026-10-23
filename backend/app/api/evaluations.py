import json
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.database import (
    get_db,
    EvaluationRun,
    EvaluationScore,
    EvaluationDataset,
    EvaluationExample,
    PipelineConfig,
    DocumentChunk
)
from backend.app.embeddings.registry import EmbeddingRegistry
from backend.app.vectorstores.store import vector_store
from backend.app.evaluation.retrieval_metrics import RetrievalMetricsEngine
from backend.app.evaluation.judge_engine import LLMJudgeEngine
from backend.app.generation.llm import LLMGenerationService

router = APIRouter(prefix="/evaluations", tags=["evaluations"])

class EvaluationRunRequest(BaseModel):
    pipeline_id: str
    dataset_id: str
    name: Optional[str] = None
    retrieval_k: Optional[int] = 5
    enabled_judge_criteria: Optional[List[str]] = None

@router.post("")
async def start_evaluation_run(payload: EvaluationRunRequest, db: AsyncSession = Depends(get_db)):
    """
    Executes full multi-tier evaluation pipeline across Top 10 Retrieval Metrics
    and 11 LLM-as-a-Judge criteria with per-query diagnostic tracing.
    """
    pipeline = await db.get(PipelineConfig, payload.pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline configuration not found")

    dataset = await db.get(EvaluationDataset, payload.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Evaluation dataset not found")

    ex_stmt = select(EvaluationExample).where(EvaluationExample.dataset_id == payload.dataset_id)
    examples = (await db.execute(ex_stmt)).scalars().all()
    if not examples:
        raise HTTPException(status_code=400, detail="Evaluation dataset contains 0 examples.")

    run_name = payload.name or f"Run: {pipeline.name} on {dataset.name} ({datetime.utcnow().strftime('%H:%M:%S')})"
    k = payload.retrieval_k or pipeline.top_k or 5

    run = EvaluationRun(
        pipeline_id=pipeline.id,
        dataset_id=dataset.id,
        name=run_name,
        status="running",
        total_queries=len(examples),
        retrieval_k=k,
        aggregate_scores="{}"
    )
    db.add(run)
    await db.flush()

    start_total = time.time()
    per_query_retrieval_results = []
    per_query_judge_results = []

    # Build bidirectional chunk ID lookup map (UUID <-> {document_id}_c{chunk_index})
    chunk_lookup_stmt = select(DocumentChunk.id, DocumentChunk.document_id, DocumentChunk.chunk_index)
    chunk_rows = (await db.execute(chunk_lookup_stmt)).all()
    uuid_to_alias = {c[0]: f"{c[1]}_c{c[2]}" for c in chunk_rows}
    alias_to_uuid = {f"{c[1]}_c{c[2]}": c[0] for c in chunk_rows}

    for ex in examples:
        query_start = time.time()
        gold_chunks = json.loads(ex.relevant_chunk_ids) if ex.relevant_chunk_ids else []
        gold_facts = json.loads(ex.reference_facts) if ex.reference_facts else []

        # Expand gold chunk IDs with alias representations so vector store IDs match dataset IDs
        expanded_gold = list(gold_chunks)
        for gid in gold_chunks:
            if gid in uuid_to_alias and uuid_to_alias[gid] not in expanded_gold:
                expanded_gold.append(uuid_to_alias[gid])
            if gid in alias_to_uuid and alias_to_uuid[gid] not in expanded_gold:
                expanded_gold.append(alias_to_uuid[gid])

        # 1. Retrieval
        query_vec = EmbeddingRegistry.embed_query(ex.question, pipeline.embedding_model, pipeline.embedding_dimension)
        if pipeline.retrieval_mode == "mmr":
            retrieved = vector_store.search_mmr(query_vec, top_k=k, lambda_mult=pipeline.mmr_diversity)
        else:
            retrieved = vector_store.search_dense(query_vec, top_k=k)

        retrieved_ids = [r["chunk_id"] for r in retrieved]
        retrieved_texts = [r["content"] for r in retrieved]

        # 2. Compute Top 10 Retrieval Metrics
        metrics_result = RetrievalMetricsEngine.evaluate_query(
            retrieved_ids=retrieved_ids,
            gold_relevant_ids=expanded_gold,
            k=k,
            retrieved_texts=retrieved_texts,
            gold_facts=gold_facts
        )
        per_query_retrieval_results.append(metrics_result)

        # 3. Generate Answer
        gen_result = LLMGenerationService.generate_answer(
            query=ex.question,
            retrieved_chunks=retrieved,
            system_prompt=pipeline.system_prompt,
            provider=pipeline.generation_provider,
            model_name=pipeline.generation_model,
            temperature=pipeline.temperature if pipeline.temperature is not None else 0.2
        )

        # 4. LLM-as-a-Judge Evaluation (11 criteria)
        judge_eval = LLMJudgeEngine.evaluate_response(
            question=ex.question,
            generated_answer=gen_result["answer"],
            retrieved_contexts=retrieved_texts,
            reference_answer=ex.reference_answer,
            reference_facts=gold_facts,
            citations_mapping=gen_result["citations"],
            enabled_criteria=payload.enabled_judge_criteria
        )
        per_query_judge_results.append(judge_eval)

        # 5. Root cause failure tagging
        failure_tags = []
        if metrics_result["recall_at_k"] < 50.0 and ex.answerable:
            failure_tags.append("low_retrieval_recall")
        if metrics_result["precision_at_k"] < 20.0 and ex.answerable:
            failure_tags.append("noisy_retrieval")
        if not gen_result["is_citation_valid"]:
            failure_tags.append("invalid_citation_hallucination")
        if judge_eval["criteria_scores"].get("faithfulness", {}).get("score_100", 100) < 50:
            failure_tags.append("hallucination_unfaithful")
        if not ex.answerable and "does not contain" not in gen_result["answer"].lower():
            failure_tags.append("failed_abstention")

        q_latency = round((time.time() - query_start) * 1000, 2)

        # Save score row
        score_obj = EvaluationScore(
            run_id=run.id,
            example_id=ex.id,
            query=ex.question,
            retrieved_chunks=json.dumps(retrieved),
            generated_answer=gen_result["answer"],
            ranking_metrics=json.dumps(metrics_result),
            judge_scores=json.dumps(judge_eval),
            failure_tags=json.dumps(failure_tags),
            latency_ms=q_latency
        )
        db.add(score_obj)

    # Compute Aggregates
    agg_retrieval = RetrievalMetricsEngine.aggregate_dataset_scores(per_query_retrieval_results)
    
    # Aggregate judge scores
    judge_keys = list(per_query_judge_results[0]["criteria_scores"].keys())
    agg_judge = {}
    for jk in judge_keys:
        scores = [q["criteria_scores"][jk]["score_100"] for q in per_query_judge_results if jk in q["criteria_scores"]]
        agg_judge[jk] = round(sum(scores) / len(scores), 2) if scores else 0.0

    macro_judge_avg = round(sum(agg_judge.values()) / len(agg_judge), 2) if agg_judge else 0.0

    total_duration = round((time.time() - start_total) * 1000, 2)
    composite_aggregates = {
        "retrieval": agg_retrieval,
        "judge": agg_judge,
        "overall_judge_score": macro_judge_avg,
        "duration_ms": total_duration,
        "avg_query_latency_ms": round(total_duration / len(examples), 2)
    }

    run.status = "completed"
    run.duration_ms = total_duration
    run.completed_at = datetime.utcnow()
    run.aggregate_scores = json.dumps(composite_aggregates)

    await db.commit()
    await db.refresh(run)

    return {
        "id": run.id,
        "name": run.name,
        "status": run.status,
        "total_queries": run.total_queries,
        "retrieval_k": run.retrieval_k,
        "aggregate_scores": composite_aggregates
    }

@router.get("")
async def list_evaluation_runs(db: AsyncSession = Depends(get_db)):
    stmt = select(EvaluationRun).order_by(EvaluationRun.created_at.desc())
    runs = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": r.id,
            "pipeline_id": r.pipeline_id,
            "dataset_id": r.dataset_id,
            "name": r.name,
            "status": r.status,
            "total_queries": r.total_queries,
            "duration_ms": r.duration_ms,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "aggregate_scores": json.loads(r.aggregate_scores) if r.aggregate_scores else {}
        }
        for r in runs
    ]

@router.get("/{run_id}")
async def get_evaluation_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(EvaluationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")
        
    return {
        "id": run.id,
        "pipeline_id": run.pipeline_id,
        "dataset_id": run.dataset_id,
        "name": run.name,
        "status": run.status,
        "total_queries": run.total_queries,
        "retrieval_k": run.retrieval_k,
        "duration_ms": run.duration_ms,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "aggregate_scores": json.loads(run.aggregate_scores) if run.aggregate_scores else {}
    }

@router.get("/{run_id}/results")
async def get_run_results(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.get(EvaluationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    scores_stmt = select(EvaluationScore).where(EvaluationScore.run_id == run_id)
    scores = (await db.execute(scores_stmt)).scalars().all()

    return {
        "run_id": run.id,
        "run_name": run.name,
        "aggregate_scores": json.loads(run.aggregate_scores) if run.aggregate_scores else {},
        "results": [
            {
                "id": s.id,
                "example_id": s.example_id,
                "query": s.query,
                "generated_answer": s.generated_answer,
                "retrieved_chunks": json.loads(s.retrieved_chunks) if s.retrieved_chunks else [],
                "ranking_metrics": json.loads(s.ranking_metrics) if s.ranking_metrics else {},
                "judge_scores": json.loads(s.judge_scores) if s.judge_scores else {},
                "failure_tags": json.loads(s.failure_tags) if s.failure_tags else [],
                "latency_ms": s.latency_ms
            }
            for s in scores
        ]
    }

@router.get("/compare/experiments")
async def compare_experiments(run_ids: List[str] = Query(...), db: AsyncSession = Depends(get_db)):
    """
    Side-by-side comparison of 2 or more evaluation runs on the same evaluation dataset.
    """
    stmt = select(EvaluationRun).where(EvaluationRun.id.in_(run_ids))
    runs = (await db.execute(stmt)).scalars().all()
    if len(runs) < 2:
        raise HTTPException(status_code=400, detail="Provide at least 2 run_ids to perform experiment comparison.")

    comparison_data = []
    for r in runs:
        pipeline = await db.get(PipelineConfig, r.pipeline_id)
        dataset = await db.get(EvaluationDataset, r.dataset_id)
        aggs = json.loads(r.aggregate_scores) if r.aggregate_scores else {}
        comparison_data.append({
            "run_id": r.id,
            "run_name": r.name,
            "pipeline_name": pipeline.name if pipeline else "Unknown",
            "dataset_name": dataset.name if dataset else "Unknown",
            "chunking_strategy": pipeline.chunking_strategy if pipeline else "N/A",
            "embedding_model": pipeline.embedding_model if pipeline else "N/A",
            "retrieval_mode": pipeline.retrieval_mode if pipeline else "N/A",
            "generation_model": pipeline.generation_model if pipeline else "N/A",
            "retrieval_metrics": aggs.get("retrieval", {}),
            "judge_metrics": aggs.get("judge", {}),
            "overall_judge_score": aggs.get("overall_judge_score", 0.0),
            "duration_ms": r.duration_ms
        })

    return {"experiments": comparison_data, "count": len(comparison_data)}
