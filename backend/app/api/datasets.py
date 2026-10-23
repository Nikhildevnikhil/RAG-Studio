import json
import csv
import io
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from backend.app.core.database import (
    get_db,
    EvaluationDataset,
    EvaluationExample,
    DocumentChunk,
    EvaluationRun,
    EvaluationScore
)
from backend.app.evaluation.synthetic_generator import SyntheticDatasetGenerator

router = APIRouter(prefix="/datasets", tags=["datasets"])

class SyntheticGenRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    num_questions: int = 5
    question_types: Optional[List[str]] = None
    difficulty: str = "medium"
    include_unanswerable: bool = True
    document_ids: Optional[List[str]] = None

class DatasetCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    version: str = "1.0.0"
    examples: List[Dict[str, Any]]

class ExampleUpdateRequest(BaseModel):
    question: Optional[str] = None
    reference_answer: Optional[str] = None
    reference_facts: Optional[List[str]] = None
    difficulty: Optional[str] = None
    question_type: Optional[str] = None
    answerable: Optional[bool] = None
    review_status: Optional[str] = None

class BatchDeleteDatasetsRequest(BaseModel):
    dataset_ids: List[str]

@router.post("/generate")
async def generate_dataset(payload: SyntheticGenRequest, db: AsyncSession = Depends(get_db)):
    """
    Synthesizes grounded Q&A test datasets from uploaded documents across 10 archetypes.
    """
    stmt = select(DocumentChunk)
    if payload.document_ids:
        stmt = stmt.where(DocumentChunk.document_id.in_(payload.document_ids))
    stmt = stmt.order_by(DocumentChunk.chunk_index).limit(100)
    
    chunks = (await db.execute(stmt)).scalars().all()
    if not chunks:
        raise HTTPException(status_code=400, detail="No indexed chunks available to generate evaluation data. Upload documents first.")

    chunk_dicts = [
        {
            "id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "page_number": c.page_number,
            "section_path": c.section_path
        }
        for c in chunks
    ]

    raw_examples = SyntheticDatasetGenerator.generate_synthetic_examples(
        chunks=chunk_dicts,
        num_questions=payload.num_questions,
        target_types=payload.question_types,
        difficulty=payload.difficulty,
        include_unanswerable=payload.include_unanswerable
    )

    # Persist dataset
    dataset = EvaluationDataset(
        name=payload.name,
        description=payload.description or "Synthetically generated dataset",
        version="1.0.0",
        source_type="synthetic",
        example_count=len(raw_examples),
        is_approved=False
    )
    db.add(dataset)
    await db.flush()

    for ex in raw_examples:
        example_obj = EvaluationExample(
            dataset_id=dataset.id,
            question=ex["question"],
            reference_answer=ex["reference_answer"],
            reference_facts=json.dumps(ex["reference_facts"]),
            relevant_document_ids=json.dumps(ex["relevant_document_ids"]),
            relevant_chunk_ids=json.dumps(ex["relevant_chunk_ids"]),
            supporting_locations=json.dumps(ex["supporting_locations"]),
            difficulty=ex["difficulty"],
            question_type=ex["question_type"],
            answerable=ex["answerable"],
            review_status=ex["review_status"]
        )
        db.add(example_obj)

    await db.commit()
    await db.refresh(dataset)
    return {"dataset_id": dataset.id, "name": dataset.name, "example_count": len(raw_examples)}

@router.post("")
async def create_dataset(payload: DatasetCreateRequest, db: AsyncSession = Depends(get_db)):
    dataset = EvaluationDataset(
        name=payload.name,
        description=payload.description or "",
        version=payload.version,
        source_type="manual",
        example_count=len(payload.examples),
        is_approved=True
    )
    db.add(dataset)
    await db.flush()

    for ex in payload.examples:
        example_obj = EvaluationExample(
            dataset_id=dataset.id,
            question=ex.get("question", ""),
            reference_answer=ex.get("reference_answer", ""),
            reference_facts=json.dumps(ex.get("reference_facts", [])),
            relevant_document_ids=json.dumps(ex.get("relevant_document_ids", [])),
            relevant_chunk_ids=json.dumps(ex.get("relevant_chunk_ids", [])),
            supporting_locations=json.dumps(ex.get("supporting_locations", [])),
            difficulty=ex.get("difficulty", "medium"),
            question_type=ex.get("question_type", "factual"),
            answerable=ex.get("answerable", True),
            review_status="approved"
        )
        db.add(example_obj)

    await db.commit()
    await db.refresh(dataset)
    return dataset

@router.get("")
async def list_datasets(db: AsyncSession = Depends(get_db)):
    stmt = select(EvaluationDataset).order_by(EvaluationDataset.created_at.desc())
    datasets = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "version": d.version,
            "source_type": d.source_type,
            "example_count": d.example_count,
            "is_approved": d.is_approved,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in datasets
    ]

@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    dataset = await db.get(EvaluationDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    ex_stmt = select(EvaluationExample).where(EvaluationExample.dataset_id == dataset_id)
    examples = (await db.execute(ex_stmt)).scalars().all()
    
    return {
        "id": dataset.id,
        "name": dataset.name,
        "description": dataset.description,
        "version": dataset.version,
        "source_type": dataset.source_type,
        "example_count": len(examples),
        "is_approved": dataset.is_approved,
        "created_at": dataset.created_at.isoformat() if dataset.created_at else None,
        "examples": [
            {
                "id": e.id,
                "question": e.question,
                "reference_answer": e.reference_answer,
                "reference_facts": json.loads(e.reference_facts) if e.reference_facts else [],
                "relevant_document_ids": json.loads(e.relevant_document_ids) if e.relevant_document_ids else [],
                "relevant_chunk_ids": json.loads(e.relevant_chunk_ids) if e.relevant_chunk_ids else [],
                "supporting_locations": json.loads(e.supporting_locations) if e.supporting_locations else [],
                "difficulty": e.difficulty,
                "question_type": e.question_type,
                "answerable": e.answerable,
                "review_status": e.review_status
            }
            for e in examples
        ]
    }

@router.put("/{dataset_id}/examples/{example_id}")
async def update_example(dataset_id: str, example_id: str, payload: ExampleUpdateRequest, db: AsyncSession = Depends(get_db)):
    ex = await db.get(EvaluationExample, example_id)
    if not ex or ex.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Example not found")

    if payload.question is not None:
        ex.question = payload.question
    if payload.reference_answer is not None:
        ex.reference_answer = payload.reference_answer
    if payload.reference_facts is not None:
        ex.reference_facts = json.dumps(payload.reference_facts)
    if payload.difficulty is not None:
        ex.difficulty = payload.difficulty
    if payload.question_type is not None:
        ex.question_type = payload.question_type
    if payload.answerable is not None:
        ex.answerable = payload.answerable
    if payload.review_status is not None:
        ex.review_status = payload.review_status

    await db.commit()
    return {"message": "Example updated", "id": example_id}

@router.post("/{dataset_id}/approve")
async def approve_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    dataset = await db.get(EvaluationDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    dataset.is_approved = True
    await db.commit()
    return {"message": "Dataset version approved", "id": dataset_id, "is_approved": True}

@router.get("/{dataset_id}/export")
async def export_dataset(dataset_id: str, format: str = "json", db: AsyncSession = Depends(get_db)):
    dataset = await db.get(EvaluationDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    ex_stmt = select(EvaluationExample).where(EvaluationExample.dataset_id == dataset_id)
    examples = (await db.execute(ex_stmt)).scalars().all()
    
    data = [
        {
            "id": e.id,
            "question": e.question,
            "reference_answer": e.reference_answer,
            "reference_facts": json.loads(e.reference_facts) if e.reference_facts else [],
            "relevant_chunk_ids": json.loads(e.relevant_chunk_ids) if e.relevant_chunk_ids else [],
            "supporting_locations": json.loads(e.supporting_locations) if e.supporting_locations else [],
            "difficulty": e.difficulty,
            "question_type": e.question_type,
            "answerable": e.answerable,
            "review_status": e.review_status
        }
        for e in examples
    ]

    if format.lower() == "csv":
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=["id", "question", "reference_answer", "difficulty", "question_type", "answerable", "review_status"])
        writer.writeheader()
        for row in data:
            writer.writerow({
                "id": row["id"],
                "question": row["question"],
                "reference_answer": row["reference_answer"],
                "difficulty": row["difficulty"],
                "question_type": row["question_type"],
                "answerable": row["answerable"],
                "review_status": row["review_status"]
            })
        return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={dataset.name}.csv"})

    return Response(content=json.dumps(data, indent=2), media_type="application/json", headers={"Content-Disposition": f"attachment; filename={dataset.name}.json"})
 
@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str, db: AsyncSession = Depends(get_db)):
    """
    Permanently deletes an evaluation dataset, cascading to its examples,
    runs, and scores.
    """
    dataset = await db.get(EvaluationDataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # 1. Delete associated evaluation runs and their scores
    run_stmt = select(EvaluationRun).where(EvaluationRun.dataset_id == dataset_id)
    runs = (await db.execute(run_stmt)).scalars().all()
    for run in runs:
        await db.execute(delete(EvaluationScore).where(EvaluationScore.run_id == run.id))
        await db.delete(run)

    # 2. Delete all examples associated with this dataset
    await db.execute(delete(EvaluationExample).where(EvaluationExample.dataset_id == dataset_id))

    # 3. Delete the dataset itself
    dataset_name = dataset.name
    await db.delete(dataset)
    await db.commit()

    return {
        "message": f"Dataset '{dataset_name}' successfully deleted",
        "id": dataset_id,
        "deleted_runs": len(runs)
    }

@router.post("/batch-delete")
async def batch_delete_datasets(payload: BatchDeleteDatasetsRequest, db: AsyncSession = Depends(get_db)):
    """
    Batch deletes multiple evaluation datasets in a single transaction.
    """
    deleted_ids = []
    for did in payload.dataset_ids:
        dataset = await db.get(EvaluationDataset, did)
        if not dataset:
            continue
        # 1. Delete associated evaluation runs and their scores
        run_stmt = select(EvaluationRun).where(EvaluationRun.dataset_id == did)
        runs = (await db.execute(run_stmt)).scalars().all()
        for run in runs:
            await db.execute(delete(EvaluationScore).where(EvaluationScore.run_id == run.id))
            await db.delete(run)

        # 2. Delete all examples
        await db.execute(delete(EvaluationExample).where(EvaluationExample.dataset_id == did))

        # 3. Delete dataset
        await db.delete(dataset)
        deleted_ids.append(did)

    await db.commit()
    return {
        "status": "success",
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids
    }
