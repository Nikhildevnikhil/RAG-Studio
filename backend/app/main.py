import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from backend.app.core.config import settings
from backend.app.core.database import init_db, AsyncSessionLocal, PipelineConfig, Document, DocumentChunk
from backend.app.api.documents import router as documents_router
from backend.app.api.pipelines import router as pipelines_router
from backend.app.api.chat import router as chat_router
from backend.app.api.datasets import router as datasets_router
from backend.app.api.evaluations import router as evaluations_router
from backend.app.api.analytics import router as analytics_router
from backend.app.api.settings import router as settings_router
from backend.app.documents.parser import DocumentParser
from backend.app.chunking.engine import ChunkingEngine
from backend.app.embeddings.registry import EmbeddingRegistry
from backend.app.vectorstores.store import vector_store, VectorRecord

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schemas
    await init_db()
    
    # Seed default baseline pipeline and sample documents if empty
    async with AsyncSessionLocal() as session:
        existing_pipe = (await session.execute(select(PipelineConfig))).scalars().first()
        if not existing_pipe:
            default_pipeline = PipelineConfig(
                name="Baseline: Open-Weights Hugging Face + Chroma DB",
                description="Production-grade local RAG baseline with Hugging Face BGE embeddings and Chroma DB persistent storage",
                chunking_strategy="recursive_character",
                chunk_size=500,
                chunk_overlap=50,
                embedding_provider="huggingface",
                embedding_model="BAAI/bge-small-en-v1.5",
                embedding_dimension=384,
                vector_store="chroma",
                retrieval_mode="dense",
                top_k=5,
                similarity_threshold=0.0,
                mmr_diversity=0.5,
                generation_provider="huggingface",
                generation_model="HuggingFaceH4/zephyr-7b-beta",
                system_prompt="You are an expert RAG research assistant. Answer questions using only the provided retrieved contexts and format all factual statements with source citations [1], [2], etc."
            )
            session.add(default_pipeline)
            await session.commit()
            
        # Check if sample document exists
        existing_doc = (await session.execute(select(Document))).scalars().first()
        if not existing_doc:
            sample_file_path = os.path.join(settings.STORAGE_DIR, "rag_platform_handbook.md")
            sample_content = """# RAG Studio Engineering Handbook

## Overview and Architecture
RAG Studio is an enterprise retrieval-augmented generation platform designed for rigorous pipeline experimentation and verifiable answer generation. The system orchestrates document parsing, customizable chunking, embedding generation, vector indexing, and multi-faceted LLM evaluation.

## Key Chunking Strategies
The platform supports six core chunking strategies:
1. Recursive Character Chunking: Uses hierarchical separators (\n\n, \n, whitespace) to preserve natural semantic boundaries.
2. Fixed-Size Chunking: Enforces strict window length with specified character overlap.
3. Token-Based Chunking: Calculates boundaries based on model tokenizer limits to prevent context overflow.
4. Sentence-Based Chunking: Groups logical sentences while maintaining reading flow.
5. Paragraph-Based Chunking: Retains cohesive prose paragraphs.
6. Markdown-Aware Chunking: Preserves header hierarchies (#, ##, ###) and table integrity.

## Evaluation Standards & Metrics
Evaluation separates retrieval accuracy from generation fidelity. The top 10 retrieval metrics include:
- Precision@K: Proportion of retrieved passages that are relevant.
- Recall@K: Proportion of gold passages successfully captured.
- F1@K: Harmonic mean of precision and recall.
- Hit Rate@K: Frequency of retrieving at least one relevant passage.
- MRR (Mean Reciprocal Rank): Rank position of the first relevant passage.
- MAP@K (Mean Average Precision): Overall ranking precision across all relevant items.
- nDCG@K: Graded relevance quality with logarithmic position discounting.
- R-Precision: Precision measured at cutoff R equal to total relevant items.
- Context Precision: Density of relevant context placed near the top.
- Context Recall: Percentage of reference facts supported by retrieved context.

## LLM-as-a-Judge Evaluation
Answer generation is scored against 11 criteria using a 5-point discrete rubric normalized to a 0-100 scale. Key criteria include correctness, completeness, faithfulness, groundedness, answer relevance, citation correctness, and abstention quality.
"""
            with open(sample_file_path, "w", encoding="utf-8") as f:
                f.write(sample_content)

            sections, page_count, char_count = DocumentParser.parse_file(sample_file_path, "rag_platform_handbook.md")
            sample_doc = Document(
                file_name="rag_platform_handbook.md",
                file_type="md",
                file_size=len(sample_content),
                content_hash=DocumentParser.compute_sha256(sample_file_path),
                storage_path=sample_file_path,
                processing_status="Ready",
                page_count=page_count,
                character_count=char_count,
                preview_text=sample_content[:600]
            )
            session.add(sample_doc)
            await session.flush()

            # Index chunks
            chunks = ChunkingEngine.chunk_sections(sections, strategy="recursive_character", chunk_size=400, chunk_overlap=40)
            texts = [c.content for c in chunks]
            vectors = EmbeddingRegistry.embed_texts(texts)

            for c, vec in zip(chunks, vectors):
                db_chunk = DocumentChunk(
                    document_id=sample_doc.id,
                    chunk_index=c.chunk_index,
                    content=c.content,
                    page_number=c.page_number,
                    section_path=c.section_path,
                    token_count=c.token_count
                )
                session.add(db_chunk)
                await session.flush()

                vector_store.add_records([
                    VectorRecord(
                        chunk_id=db_chunk.id,
                        document_id=sample_doc.id,
                        content=c.content,
                        vector=vec,
                        metadata={
                            "page": c.page_number,
                            "section": c.section_path,
                            "file_name": sample_doc.file_name
                        }
                    )
                ])
            await session.commit()

        # Hydrate vector store from database if empty
        if vector_store.count() == 0:
            all_chunks_stmt = select(DocumentChunk, Document.file_name).join(
                Document, DocumentChunk.document_id == Document.id
            )
            chunk_rows = (await session.execute(all_chunks_stmt)).all()
            if chunk_rows:
                pipe_stmt = select(PipelineConfig).order_by(PipelineConfig.name.asc())
                pipe = (await session.execute(pipe_stmt)).scalars().first()
                emb_model = pipe.embedding_model if pipe else "BAAI/bge-small-en-v1.5"
                emb_dim = pipe.embedding_dimension if pipe else 384

                texts = [c.content for c, _ in chunk_rows]
                vectors = EmbeddingRegistry.embed_texts(texts, model_id=emb_model, dimension=emb_dim)
                records = [
                    VectorRecord(
                        chunk_id=c.id,
                        document_id=c.document_id,
                        content=c.content,
                        vector=vec,
                        metadata={
                            "page": c.page_number,
                            "section": c.section_path,
                            "file_name": file_name
                        }
                    )
                    for (c, file_name), vec in zip(chunk_rows, vectors)
                ]
                vector_store.add_records(records)

    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Configurable RAG Evaluation & Experimentation Platform API",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(documents_router, prefix=settings.API_V1_STR)
app.include_router(pipelines_router, prefix=settings.API_V1_STR)
app.include_router(chat_router, prefix=settings.API_V1_STR)
app.include_router(datasets_router, prefix=settings.API_V1_STR)
app.include_router(evaluations_router, prefix=settings.API_V1_STR)
app.include_router(analytics_router, prefix=settings.API_V1_STR)
app.include_router(settings_router, prefix=settings.API_V1_STR)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "indexed_chunks": vector_store.count()
    }
