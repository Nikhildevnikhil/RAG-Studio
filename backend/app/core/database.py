import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import Column, String, Integer, Float, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from backend.app.core.config import settings

Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(50), default="default", index=True)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_size = Column(Integer, default=0)
    content_hash = Column(String(64), nullable=False, index=True)
    storage_path = Column(String(500), nullable=False)
    processing_status = Column(String(50), default="Uploaded")  # Uploaded, Parsing, Parsed, Chunking, Embedding, Indexing, Ready, Failed
    page_count = Column(Integer, default=0)
    character_count = Column(Integer, default=0)
    preview_text = Column(Text, nullable=True)
    error_details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    index_version_id = Column(String(50), default="v1", index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    page_number = Column(Integer, default=1)
    section_path = Column(String(255), default="")
    token_count = Column(Integer, default=0)
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="chunks")

    @property
    def metadata_dict(self) -> Dict[str, Any]:
        try:
            return json.loads(self.metadata_json) if self.metadata_json else {}
        except Exception:
            return {}


class PipelineConfig(Base):
    __tablename__ = "pipeline_configs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(50), default="default")
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    
    # Chunking options
    chunking_strategy = Column(String(50), default="recursive_character")  # recursive_character, fixed_size, token_based, sentence_based, paragraph_based, markdown_aware
    chunk_size = Column(Integer, default=500)
    chunk_overlap = Column(Integer, default=50)
    separators = Column(String(200), default="\\n\\n,\\n, ,")
    
    # Embedding options
    embedding_provider = Column(String(50), default="mock")  # mock, openai, gemini, groq, ollama, local
    embedding_model = Column(String(100), default="text-embedding-3-small")
    embedding_dimension = Column(Integer, default=1536)
    
    # Vector store & Retrieval options
    vector_store = Column(String(50), default="memory")  # memory, pgvector, qdrant
    retrieval_mode = Column(String(50), default="dense")  # dense, mmr, hybrid
    top_k = Column(Integer, default=5)
    similarity_threshold = Column(Float, default=0.0)
    mmr_diversity = Column(Float, default=0.5)
    reranker = Column(String(50), default="none")
    
    # Generation options
    generation_provider = Column(String(50), default="groq")  # groq, openai, gemini, ollama, huggingface
    generation_model = Column(String(100), default="qwen/qwen3.8-27b")
    system_prompt = Column(Text, default="You are an expert RAG research assistant. Answer questions using only the provided retrieved contexts and format all factual statements with source citations [1], [2], etc.")
    temperature = Column(Float, default=0.2)
    
    created_at = Column(DateTime, default=datetime.utcnow)


class EvaluationDataset(Base):
    __tablename__ = "evaluation_datasets"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(50), default="default")
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    version = Column(String(20), default="1.0.0")
    source_type = Column(String(50), default="synthetic")  # synthetic, manual, imported
    example_count = Column(Integer, default=0)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    examples = relationship("EvaluationExample", back_populates="dataset", cascade="all, delete-orphan")


class EvaluationExample(Base):
    __tablename__ = "evaluation_examples"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String(36), ForeignKey("evaluation_datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    reference_answer = Column(Text, nullable=False)
    reference_facts = Column(Text, default="[]")  # JSON list of critical facts
    relevant_document_ids = Column(Text, default="[]")  # JSON list of doc ids
    relevant_chunk_ids = Column(Text, default="[]")  # JSON list of gold chunk ids
    supporting_locations = Column(Text, default="[]")  # JSON list of page/section refs
    difficulty = Column(String(20), default="medium")  # easy, medium, hard
    question_type = Column(String(50), default="factual")  # factual, conceptual, procedural, comparative, multi_hop, unanswerable, etc.
    answerable = Column(Boolean, default=True)
    review_status = Column(String(20), default="approved")  # draft, approved, rejected
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("EvaluationDataset", back_populates="examples")


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    pipeline_id = Column(String(36), ForeignKey("pipeline_configs.id"), nullable=False)
    dataset_id = Column(String(36), ForeignKey("evaluation_datasets.id"), nullable=False)
    name = Column(String(100), nullable=False)
    status = Column(String(20), default="running")  # running, completed, failed
    total_queries = Column(Integer, default=0)
    duration_ms = Column(Float, default=0.0)
    retrieval_k = Column(Integer, default=5)
    aggregate_scores = Column(Text, default="{}")  # JSON object storing avg of all 10 retrieval metrics + judge scores
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    scores = relationship("EvaluationScore", back_populates="run", cascade="all, delete-orphan")


class EvaluationScore(Base):
    __tablename__ = "evaluation_scores"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String(36), ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    example_id = Column(String(36), nullable=False)
    query = Column(Text, nullable=False)
    retrieved_chunks = Column(Text, default="[]")  # JSON list of retrieved chunk dicts
    generated_answer = Column(Text, default="")
    ranking_metrics = Column(Text, default="{}")  # JSON of the 10 retrieval metrics
    judge_scores = Column(Text, default="{}")  # JSON of 11 judge criteria
    failure_tags = Column(Text, default="[]")  # e.g., ["low_recall", "hallucination", "invalid_citation"]
    latency_ms = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("EvaluationRun", back_populates="scores")


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(50), nullable=False, index=True)
    pipeline_id = Column(String(36), nullable=True)
    role = Column(String(20), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    citations = Column(Text, default="[]")  # JSON list of resolved citations
    retrieved_chunks = Column(Text, default="[]")  # JSON list of retrieved passages
    run_metadata = Column(Text, default="{}")  # Latency, token usage, top_k, etc.
    created_at = Column(DateTime, default=datetime.utcnow)


# Async database engine and session maker
connect_args = {"timeout": 30.0} if "sqlite" in settings.DATABASE_URL else {}
engine = create_async_engine(settings.DATABASE_URL, echo=False, connect_args=connect_args)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
