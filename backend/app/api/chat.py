import json
import uuid
import time
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.database import get_db, ChatMessage, PipelineConfig
from backend.app.core.rate_limiter import rate_limiter
from backend.app.embeddings.registry import EmbeddingRegistry
from backend.app.vectorstores.store import vector_store
from backend.app.generation.llm import LLMGenerationService

router = APIRouter(tags=["chat"])

class ChatRequest(BaseModel):
    query: str
    pipeline_id: Optional[str] = None
    conversation_id: Optional[str] = None
    top_k: Optional[int] = 5
    retrieval_mode: Optional[str] = "dense"
    mmr_diversity: Optional[float] = 0.5
    filter_doc_ids: Optional[List[str]] = None
    generation_model: Optional[str] = None
    generation_provider: Optional[str] = None
    temperature: Optional[float] = None
    system_prompt: Optional[str] = None

class RetrievalPreviewRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    retrieval_mode: Optional[str] = "dense"
    mmr_diversity: Optional[float] = 0.5
    filter_doc_ids: Optional[List[str]] = None
    pipeline_id: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_dimension: Optional[int] = None

@router.post("/chat")
async def handle_chat(payload: ChatRequest, request: Request, db: AsyncSession = Depends(get_db)):
    # Rate limiter protection for live demos
    rate_limiter.check(request)
    start_total = time.time()
    conv_id = payload.conversation_id or str(uuid.uuid4())
    
    # 1. Fetch pipeline config if provided
    pipeline = None
    if payload.pipeline_id:
        pipeline = await db.get(PipelineConfig, payload.pipeline_id)

    top_k = payload.top_k or (pipeline.top_k if pipeline else 5)
    mode = payload.retrieval_mode or (pipeline.retrieval_mode if pipeline else "dense")
    mmr_div = payload.mmr_diversity if payload.mmr_diversity is not None else (pipeline.mmr_diversity if pipeline else 0.5)
    model_name = payload.generation_model or (pipeline.generation_model if pipeline else None)
    provider_name = payload.generation_provider or (pipeline.generation_provider if pipeline else None)
    sys_prompt = payload.system_prompt or (pipeline.system_prompt if pipeline and pipeline.system_prompt else None)
    temp = payload.temperature if payload.temperature is not None else (pipeline.temperature if pipeline and pipeline.temperature is not None else 0.2)
    
    # 2. Embed query with proper pipeline model & dimension
    emb_model = pipeline.embedding_model if pipeline else "BAAI/bge-small-en-v1.5"
    model_info = EmbeddingRegistry.get_model_info(emb_model)
    emb_dim = (pipeline.embedding_dimension if pipeline and pipeline.embedding_dimension else None) or model_info.get("dimension", 384)
    store_dim = vector_store.get_dimension()
    active_dim = store_dim if (store_dim is not None and store_dim > 0) else emb_dim

    embed_start = time.time()
    query_vector = EmbeddingRegistry.embed_query(payload.query, model_id=emb_model, dimension=active_dim)
    embed_latency = round((time.time() - embed_start) * 1000, 2)
    
    # 3. Retrieve chunks
    retrieval_start = time.time()
    if mode == "mmr":
        retrieved_chunks = vector_store.search_mmr(
            query_vector,
            top_k=top_k,
            lambda_mult=mmr_div,
            filter_doc_ids=payload.filter_doc_ids
        )
    else:
        retrieved_chunks = vector_store.search_dense(
            query_vector,
            top_k=top_k,
            filter_doc_ids=payload.filter_doc_ids
        )
    retrieval_latency = round((time.time() - retrieval_start) * 1000, 2)

    # 4. Generate Answer with Citations using active LLM
    gen_result = LLMGenerationService.generate_answer(
        query=payload.query,
        retrieved_chunks=retrieved_chunks,
        system_prompt=sys_prompt,
        provider=provider_name,
        model_name=model_name,
        temperature=temp
    )

    total_latency = round((time.time() - start_total) * 1000, 2)

    run_meta = {
        "total_latency_ms": total_latency,
        "embedding_latency_ms": embed_latency,
        "retrieval_latency_ms": retrieval_latency,
        "generation_latency_ms": gen_result["latency_ms"],
        "prompt_tokens": gen_result["prompt_tokens"],
        "completion_tokens": gen_result["completion_tokens"],
        "top_k": top_k,
        "retrieval_mode": mode,
        "model": gen_result.get("model", model_name),
        "provider": gen_result.get("provider", provider_name or "auto"),
        "is_fallback": gen_result.get("is_fallback", False),
        "generation_error": gen_result.get("generation_error")
    }

    # 5. Persist Chat Messages
    user_msg = ChatMessage(
        conversation_id=conv_id,
        pipeline_id=payload.pipeline_id,
        role="user",
        content=payload.query
    )
    db.add(user_msg)

    asst_msg = ChatMessage(
        conversation_id=conv_id,
        pipeline_id=payload.pipeline_id,
        role="assistant",
        content=gen_result["answer"],
        citations=json.dumps(gen_result["citations"]),
        retrieved_chunks=json.dumps(retrieved_chunks),
        run_metadata=json.dumps(run_meta)
    )
    db.add(asst_msg)
    await db.commit()

    return {
        "conversation_id": conv_id,
        "message_id": asst_msg.id,
        "answer": gen_result["answer"],
        "citations": gen_result["citations"],
        "retrieved_chunks": retrieved_chunks,
        "run_metadata": run_meta,
        "is_citation_valid": gen_result["is_citation_valid"],
        "is_fallback": gen_result.get("is_fallback", False),
        "provider": gen_result.get("provider", provider_name or "auto"),
        "model": gen_result.get("model", model_name)
    }

@router.post("/retrieval/preview")
async def preview_retrieval(payload: RetrievalPreviewRequest, db: AsyncSession = Depends(get_db)):
    """
    Direct inspection of retrieved evidence without invoking generation model.
    """
    start_time = time.time()
    pipeline = None
    if payload.pipeline_id:
        pipeline = await db.get(PipelineConfig, payload.pipeline_id)

    emb_model = payload.embedding_model or (pipeline.embedding_model if pipeline else "BAAI/bge-small-en-v1.5")
    model_info = EmbeddingRegistry.get_model_info(emb_model)
    emb_dim = payload.embedding_dimension or (pipeline.embedding_dimension if pipeline and pipeline.embedding_dimension else None) or model_info.get("dimension", 384)
    store_dim = vector_store.get_dimension()
    active_dim = store_dim if (store_dim is not None and store_dim > 0) else emb_dim

    query_vector = EmbeddingRegistry.embed_query(payload.query, model_id=emb_model, dimension=active_dim)
    
    if payload.retrieval_mode == "mmr":
        chunks = vector_store.search_mmr(
            query_vector,
            top_k=payload.top_k or 5,
            lambda_mult=payload.mmr_diversity or 0.5,
            filter_doc_ids=payload.filter_doc_ids
        )
    else:
        chunks = vector_store.search_dense(
            query_vector,
            top_k=payload.top_k or 5,
            filter_doc_ids=payload.filter_doc_ids
        )
        
    latency_ms = round((time.time() - start_time) * 1000, 2)
    return {
        "query": payload.query,
        "retrieved_count": len(chunks),
        "latency_ms": latency_ms,
        "chunks": chunks
    }

@router.get("/chat/history")
async def get_chat_history(conversation_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    stmt = select(ChatMessage)
    if conversation_id:
        stmt = stmt.where(ChatMessage.conversation_id == conversation_id)
    stmt = stmt.order_by(ChatMessage.created_at.asc())
    
    msgs = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "citations": json.loads(m.citations) if m.citations else [],
            "retrieved_chunks": json.loads(m.retrieved_chunks) if m.retrieved_chunks else [],
            "run_metadata": json.loads(m.run_metadata) if m.run_metadata else {},
            "created_at": m.created_at.isoformat() if m.created_at else None
        }
        for m in msgs
    ]

@router.get("/chat/conversations")
async def list_conversations(db: AsyncSession = Depends(get_db)):
    stmt = select(ChatMessage).order_by(ChatMessage.created_at.asc())
    msgs = (await db.execute(stmt)).scalars().all()
    
    convs_dict: Dict[str, Dict[str, Any]] = {}
    for m in msgs:
        cid = m.conversation_id
        if cid not in convs_dict:
            convs_dict[cid] = {
                "conversation_id": cid,
                "first_query": m.content if m.role == "user" else "Chat session",
                "message_count": 0,
                "last_active": m.created_at.isoformat() if m.created_at else None,
                "pipeline_id": m.pipeline_id
            }
        convs_dict[cid]["message_count"] += 1
        if m.role == "user" and convs_dict[cid]["first_query"] == "Chat session":
            convs_dict[cid]["first_query"] = m.content
        if m.created_at:
            convs_dict[cid]["last_active"] = m.created_at.isoformat()
            
    conversations = list(convs_dict.values())
    conversations.reverse()
    return conversations

@router.delete("/chat/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, db: AsyncSession = Depends(get_db)):
    stmt = select(ChatMessage).where(ChatMessage.conversation_id == conversation_id)
    msgs = (await db.execute(stmt)).scalars().all()
    for m in msgs:
        await db.delete(m)
    await db.commit()
    return {"status": "deleted", "conversation_id": conversation_id, "deleted_count": len(msgs)}

@router.delete("/chat/history")
async def clear_all_chat_history(db: AsyncSession = Depends(get_db)):
    stmt = select(ChatMessage)
    msgs = (await db.execute(stmt)).scalars().all()
    for m in msgs:
        await db.delete(m)
    await db.commit()
    return {"status": "cleared", "deleted_count": len(msgs)}
