import os
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from backend.app.core.config import settings
from backend.app.core.database import (
    get_db,
    PipelineConfig,
    Document,
    DocumentChunk,
    EvaluationRun,
    EvaluationScore,
    ChatMessage
)
from backend.app.documents.parser import DocumentParser
from backend.app.chunking.engine import ChunkingEngine
from backend.app.embeddings.registry import EmbeddingRegistry, EMBEDDING_CATALOG
from backend.app.vectorstores.store import vector_store, VectorRecord

router = APIRouter(tags=["pipelines"])

class PipelineCreateSchema(BaseModel):
    name: str
    description: Optional[str] = ""
    chunking_strategy: str = "recursive_character"
    chunk_size: int = 500
    chunk_overlap: int = 50
    separators: Optional[str] = "\\n\\n,\\n, ,"
    embedding_provider: str = "huggingface"
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384
    vector_store: str = "chroma"
    retrieval_mode: str = "dense"
    top_k: int = 5
    similarity_threshold: float = 0.0
    mmr_diversity: float = 0.5
    generation_provider: str = "groq"
    generation_model: str = "qwen/qwen3.8-27b"
    system_prompt: Optional[str] = None
    temperature: float = 0.2

class PipelineUpdateSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    chunking_strategy: Optional[str] = None
    chunk_size: Optional[int] = None
    chunk_overlap: Optional[int] = None
    separators: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_dimension: Optional[int] = None
    vector_store: Optional[str] = None
    retrieval_mode: Optional[str] = None
    top_k: Optional[int] = None
    similarity_threshold: Optional[float] = None
    mmr_diversity: Optional[float] = None
    generation_provider: Optional[str] = None
    generation_model: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None

class PreviewChunkRequest(BaseModel):
    document_ids: Optional[List[str]] = None
    chunking_strategy: str = "recursive_character"
    chunk_size: int = 500
    chunk_overlap: int = 50
    separators: Optional[str] = "\\n\\n,\\n, ,"

class BatchDeletePipelinesRequest(BaseModel):
    pipeline_ids: List[str]

@router.get("/models/embeddings")
async def list_embedding_models(available_only: bool = False):
    return EmbeddingRegistry.get_catalog(available_only=available_only)

@router.get("/models/generation")
async def list_generation_models(available_only: bool = False):
    catalog = [
        {"provider": "groq", "model_id": "qwen/qwen3.8-27b", "name": "Groq Qwen 2.5/3 27B", "context_window": 128000, "description": "Ultra low latency high-accuracy reasoning on Groq LPUs"},
        {"provider": "groq", "model_id": "openai/gpt-oss-120b", "name": "Groq GPT-OSS 120B", "context_window": 128000, "description": "Massive 120B parameter reasoning model running on Groq LPUs"},
        {"provider": "groq", "model_id": "llama-3.3-70b-versatile", "name": "Groq Llama 3.3 70B", "context_window": 128000, "description": "Ultra low latency inference engine"},
        {"provider": "groq", "model_id": "llama-3.1-8b-instant", "name": "Groq Llama 3.1 8B", "context_window": 128000, "description": "Fast compact instruction model on Groq"},
        {"provider": "openai", "model_id": "gpt-4o", "name": "OpenAI GPT-4o", "context_window": 128000, "description": "High intelligence flagship multimodal model"},
        {"provider": "openai", "model_id": "gpt-4o-mini", "name": "OpenAI GPT-4o Mini", "context_window": 128000, "description": "Fast, affordable, highly capable model"},
        {"provider": "google", "model_id": "gemini-1.5-flash", "name": "Google Gemini 1.5 Flash", "context_window": 1000000, "description": "Million-token context window with high throughput"},
        {"provider": "anthropic", "model_id": "claude-3-5-sonnet", "name": "Anthropic Claude 3.5 Sonnet", "context_window": 200000, "description": "State-of-the-art coding and nuanced reasoning"},
        {"provider": "ollama", "model_id": "llama3.2:1b", "name": "Ollama Llama 3.2 1B (Local)", "context_window": 128000, "description": "Local on-device private LLM"},
        {"provider": "huggingface", "model_id": "HuggingFaceH4/zephyr-7b-beta", "name": "Hugging Face Zephyr 7B Beta", "context_window": 8192, "description": "High capability open aligned assistant model from Hugging Face"},
        {"provider": "huggingface", "model_id": "meta-llama/Llama-3.2-3B-Instruct", "name": "Hugging Face Llama 3.2 3B Instruct", "context_window": 128000, "description": "Leading compact open weights instruction model"},
        {"provider": "huggingface", "model_id": "mistralai/Mistral-7B-Instruct-v0.3", "name": "Hugging Face Mistral 7B Instruct", "context_window": 32768, "description": "High reasoning density multilingual instruct model"},
        {"provider": "huggingface", "model_id": "Qwen/Qwen2.5-7B-Instruct", "name": "Hugging Face Qwen 2.5 7B Instruct", "context_window": 128000, "description": "High coding and structured math open weights model"}
    ]
    result = []
    for g in catalog:
        item = dict(g)
        p = item["provider"]
        if p == "huggingface":
            item["is_available"] = bool(settings.HUGGINGFACE_API_KEY)
            item["availability_reason"] = "Ready (API Key Configured)" if settings.HUGGINGFACE_API_KEY else "Requires Hugging Face Token"
        elif p == "openai":
            item["is_available"] = bool(settings.OPENAI_API_KEY)
            item["availability_reason"] = "Ready (API Key Configured)" if settings.OPENAI_API_KEY else "Requires OpenAI API Key"
        elif p == "groq":
            item["is_available"] = bool(settings.GROQ_API_KEY)
            item["availability_reason"] = "Ready (Groq API Key Configured)" if settings.GROQ_API_KEY else "Requires Groq API Key"
        elif p == "google":
            item["is_available"] = bool(settings.GOOGLE_API_KEY)
            item["availability_reason"] = "Ready (API Key Configured)" if settings.GOOGLE_API_KEY else "Requires Google Gemini API Key"
        elif p == "anthropic":
            item["is_available"] = bool(settings.ANTHROPIC_API_KEY)
            item["availability_reason"] = "Ready (API Key Configured)" if settings.ANTHROPIC_API_KEY else "Requires Anthropic API Key"
        elif p == "ollama":
            item["is_available"] = False
            item["availability_reason"] = "Requires Local Ollama Daemon"
        else:
            item["is_available"] = True
            item["availability_reason"] = "Ready"

        if not available_only or item["is_available"]:
            result.append(item)

    # Merge dynamically fetched generation models from providers
    try:
        from backend.app.generation.provider_models import ProviderModelService
        # Auto-fetch Groq models if API key is present and cache is empty
        if settings.GROQ_API_KEY and not ProviderModelService.get_cached_for_provider("groq"):
            await ProviderModelService.fetch_models("groq")

        dyn_models = ProviderModelService.get_all_cached_models()
        existing_ids = {r["model_id"] for r in result}
        for d in dyn_models:
            if d.get("type") != "embedding" and d.get("model_id") not in existing_ids:
                item = {
                    "provider": d.get("provider", "custom"),
                    "model_id": d.get("model_id"),
                    "name": d.get("name", d.get("model_id")),
                    "context_window": d.get("context_window", 128000),
                    "description": d.get("description", "Dynamic model from provider"),
                    "is_available": d.get("is_available", True),
                    "availability_reason": d.get("availability_reason", "Ready (API Key Configured)")
                }
                if not available_only or item["is_available"]:
                    result.append(item)
                    existing_ids.add(item["model_id"])
    except Exception:
        pass

    return result


@router.post("/providers/test")
async def test_provider_connection(payload: Dict[str, Any]):
    provider = payload.get("provider", "mock")
    api_key = payload.get("api_key")
    from backend.app.generation.provider_models import ProviderModelService
    res = await ProviderModelService.fetch_models(provider=provider, api_key=api_key)
    if res.get("status") == "success":
        return {
            "status": "connected",
            "provider": provider,
            "count": res.get("count", 0),
            "message": res.get("message", f"Successfully verified connectivity to {provider.upper()} API gateway.")
        }
    else:
        return {
            "status": "error",
            "provider": provider,
            "count": 0,
            "message": res.get("message", f"Failed to connect to {provider.upper()} API gateway.")
        }

@router.post("/pipelines")
async def create_pipeline(payload: PipelineCreateSchema, db: AsyncSession = Depends(get_db)):
    p_name = payload.name.strip() if payload.name else ""
    if not p_name:
        raise HTTPException(status_code=400, detail="Pipeline name cannot be empty.")

    pipeline = PipelineConfig(
        name=p_name,
        description=(payload.description or "").strip(),
        chunking_strategy=payload.chunking_strategy,
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
        separators=payload.separators or "\\n\\n,\\n, ,",
        embedding_provider=payload.embedding_provider,
        embedding_model=payload.embedding_model,
        embedding_dimension=payload.embedding_dimension,
        vector_store=payload.vector_store,
        retrieval_mode=payload.retrieval_mode,
        top_k=payload.top_k,
        similarity_threshold=payload.similarity_threshold,
        mmr_diversity=payload.mmr_diversity,
        generation_provider=payload.generation_provider,
        generation_model=payload.generation_model,
        system_prompt=payload.system_prompt or "You are an expert RAG research assistant.",
        temperature=payload.temperature
    )
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)
    return pipeline

@router.get("/pipelines")
async def list_pipelines(db: AsyncSession = Depends(get_db)):
    stmt = select(PipelineConfig).order_by(PipelineConfig.created_at.desc())
    pipelines = (await db.execute(stmt)).scalars().all()
    return pipelines

@router.get("/pipelines/{pipeline_id}")
async def get_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    pipeline = await db.get(PipelineConfig, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline configuration not found")
    return pipeline

@router.put("/pipelines/{pipeline_id}")
async def update_pipeline(pipeline_id: str, payload: PipelineUpdateSchema, db: AsyncSession = Depends(get_db)):
    pipeline = await db.get(PipelineConfig, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        if not data["name"] or not data["name"].strip():
            raise HTTPException(status_code=400, detail="Pipeline name cannot be empty.")
        data["name"] = data["name"].strip()

    for k, v in data.items():
        if v is not None:
            setattr(pipeline, k, v)

    await db.commit()
    await db.refresh(pipeline)
    return pipeline

@router.delete("/pipelines/{pipeline_id}")
async def delete_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    pipeline = await db.get(PipelineConfig, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    if settings.DEMO_MODE and "baseline" in pipeline.name.lower():
        raise HTTPException(status_code=403, detail="The baseline demo pipeline is protected from deletion in Demo Mode.")

    p_name = pipeline.name

    # 1. Clean up associated evaluation runs and scores if any
    runs_stmt = select(EvaluationRun).where(EvaluationRun.pipeline_id == pipeline_id)
    eval_runs = (await db.execute(runs_stmt)).scalars().all()
    for run in eval_runs:
        await db.execute(delete(EvaluationScore).where(EvaluationScore.run_id == run.id))
        await db.delete(run)

    # 2. Nullify chat message pipeline references if any
    await db.execute(
        update(ChatMessage)
        .where(ChatMessage.pipeline_id == pipeline_id)
        .values(pipeline_id=None)
    )

    # 3. Delete the pipeline config itself
    await db.delete(pipeline)
    await db.commit()

    return {
        "status": "success",
        "message": f"Pipeline '{p_name}' deleted successfully",
        "id": pipeline_id
    }

@router.post("/pipelines/batch-delete")
async def batch_delete_pipelines(payload: BatchDeletePipelinesRequest, db: AsyncSession = Depends(get_db)):
    deleted_ids = []
    for pid in payload.pipeline_ids:
        pipeline = await db.get(PipelineConfig, pid)
        if not pipeline:
            continue
        if settings.DEMO_MODE and "baseline" in pipeline.name.lower():
            continue
        # 1. Clean up associated evaluation runs and scores if any
        runs_stmt = select(EvaluationRun).where(EvaluationRun.pipeline_id == pid)
        eval_runs = (await db.execute(runs_stmt)).scalars().all()
        for run in eval_runs:
            await db.execute(delete(EvaluationScore).where(EvaluationScore.run_id == run.id))
            await db.delete(run)

        # 2. Nullify chat message pipeline references if any
        await db.execute(
            update(ChatMessage)
            .where(ChatMessage.pipeline_id == pid)
            .values(pipeline_id=None)
        )

        # 3. Delete the pipeline config itself
        await db.delete(pipeline)
        deleted_ids.append(pid)

    await db.commit()
    return {
        "status": "success",
        "deleted_count": len(deleted_ids),
        "deleted_ids": deleted_ids
    }

@router.post("/pipelines/preview-chunks")
async def preview_chunks(payload: PreviewChunkRequest, db: AsyncSession = Depends(get_db)):
    """
    Simulates chunking across documents and generates immediate statistical telemetry.
    """
    stmt = select(Document)
    if payload.document_ids:
        stmt = stmt.where(Document.id.in_(payload.document_ids))
    docs = (await db.execute(stmt)).scalars().all()
    
    if not docs:
        return {
            "total_chunks": 0,
            "min_length": 0,
            "max_length": 0,
            "avg_length": 0,
            "estimated_tokens": 0,
            "estimated_indexing_seconds": 0.0,
            "sample_chunks": []
        }

    all_sections = []
    for doc in docs:
        if os.path.exists(doc.storage_path):
            sections, _, _ = DocumentParser.parse_file(doc.storage_path, doc.file_name)
            all_sections.extend(sections)
            
    sep_list = [s.strip() for s in (payload.separators or "\\n\\n,\\n, ,").split(",")]
    chunks = ChunkingEngine.chunk_sections(
        all_sections,
        strategy=payload.chunking_strategy,
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
        separators=sep_list
    )
    
    return ChunkingEngine.calculate_statistics(chunks)

@router.post("/pipelines/{pipeline_id}/index")
async def reindex_pipeline(pipeline_id: str, db: AsyncSession = Depends(get_db)):
    """
    Rebuilds index using the selected pipeline configuration parameters.
    """
    pipeline = await db.get(PipelineConfig, pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Pipeline not found")
        
    docs = (await db.execute(select(Document))).scalars().all()
    vector_store.clear()
    
    total_chunks_created = 0
    sep_list = [s.strip() for s in (pipeline.separators or "\\n\\n,\\n, ,").split(",")]
    
    for doc in docs:
        if not os.path.exists(doc.storage_path):
            continue
        sections, _, _ = DocumentParser.parse_file(doc.storage_path, doc.file_name)
        chunks = ChunkingEngine.chunk_sections(
            sections,
            strategy=pipeline.chunking_strategy,
            chunk_size=pipeline.chunk_size,
            chunk_overlap=pipeline.chunk_overlap,
            separators=sep_list
        )
        
        texts = [c.content for c in chunks]
        vectors = EmbeddingRegistry.embed_texts(texts, pipeline.embedding_model, pipeline.embedding_dimension)
        
        records = [
            VectorRecord(
                chunk_id=f"{doc.id}_c{c.chunk_index}",
                document_id=doc.id,
                content=c.content,
                vector=vec,
                metadata={
                    "page": c.page_number,
                    "section": c.section_path,
                    "file_name": doc.file_name,
                    "pipeline_id": pipeline_id
                }
            )
            for c, vec in zip(chunks, vectors)
        ]
        vector_store.add_records(records)
        total_chunks_created += len(records)
        
    return {
        "status": "success",
        "pipeline_id": pipeline_id,
        "indexed_chunks": total_chunks_created,
        "indexed_documents": len(docs)
    }
