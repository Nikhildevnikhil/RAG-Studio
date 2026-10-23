import os
import shutil
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from backend.app.core.config import settings
from backend.app.core.database import get_db, Document, DocumentChunk, PipelineConfig
from backend.app.documents.parser import DocumentParser
from backend.app.chunking.engine import ChunkingEngine
from backend.app.embeddings.registry import EmbeddingRegistry
from backend.app.vectorstores.store import vector_store, VectorRecord

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/upload")
async def upload_documents(
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Handles multi-file document upload, SHA256 duplicate detection, parsing, and auto-indexing.
    """
    created_docs = []
    
    for file in files:
        safe_filename = os.path.basename(file.filename)
        dest_path = os.path.join(settings.STORAGE_DIR, safe_filename)
        
        # Save file to disk
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        file_size = os.path.getsize(dest_path)
        content_hash = DocumentParser.compute_sha256(dest_path)
        
        # Duplicate detection
        dup_stmt = select(Document).where(Document.content_hash == content_hash)
        existing = (await db.execute(dup_stmt)).scalars().first()
        if existing:
            # Sync existing chunks to vector store in case vector store was rebuilt
            chunk_stmt = select(DocumentChunk).where(DocumentChunk.document_id == existing.id).order_by(DocumentChunk.chunk_index)
            existing_chunks = (await db.execute(chunk_stmt)).scalars().all()
            if existing_chunks:
                store_dim = vector_store.get_dimension()
                pipe_stmt = select(PipelineConfig).order_by(PipelineConfig.name.asc())
                pipe = (await db.execute(pipe_stmt)).scalars().first()
                emb_model = pipe.embedding_model if pipe else "BAAI/bge-small-en-v1.5"
                emb_dim = store_dim or (pipe.embedding_dimension if pipe else 384)
                
                texts = [c.content for c in existing_chunks]
                vecs = EmbeddingRegistry.embed_texts(texts, model_id=emb_model, dimension=emb_dim)
                recs = [
                    VectorRecord(
                        chunk_id=c.id,
                        document_id=existing.id,
                        content=c.content,
                        vector=v,
                        metadata={
                            "page": c.page_number,
                            "section": c.section_path,
                            "file_name": existing.file_name
                        }
                    )
                    for c, v in zip(existing_chunks, vecs)
                ]
                vector_store.add_records(recs)

            created_docs.append({
                "id": existing.id,
                "file_name": existing.file_name,
                "status": "Ready (Already Uploaded - Synced to Vector Store)",
                "page_count": existing.page_count,
                "is_duplicate": True
            })
            continue

        # Create record
        doc = Document(
            file_name=safe_filename,
            file_type=os.path.splitext(safe_filename)[1].lower().replace(".", ""),
            file_size=file_size,
            content_hash=content_hash,
            storage_path=dest_path,
            processing_status="Parsing"
        )
        db.add(doc)
        await db.flush()

        # Parse content
        try:
            sections, page_count, char_count = DocumentParser.parse_file(dest_path, safe_filename)
            doc.page_count = page_count
            doc.character_count = char_count
            doc.preview_text = "\n\n".join(s.content for s in sections[:3])[:2000]
            doc.processing_status = "Chunking"
            
            # Auto-chunk with default recursive character splitter
            chunks = ChunkingEngine.chunk_sections(sections, strategy="recursive_character", chunk_size=500, chunk_overlap=50)
            
            doc.processing_status = "Embedding"
            # Embed chunks with active dimension from vector store or active pipeline
            chunk_texts = [c.content for c in chunks]
            store_dim = vector_store.get_dimension()
            pipe_stmt = select(PipelineConfig).order_by(PipelineConfig.name.asc())
            pipe = (await db.execute(pipe_stmt)).scalars().first()
            emb_model = pipe.embedding_model if pipe else "BAAI/bge-small-en-v1.5"
            emb_dim = store_dim or (pipe.embedding_dimension if pipe else 384)

            vectors = EmbeddingRegistry.embed_texts(chunk_texts, model_id=emb_model, dimension=emb_dim)
            
            doc.processing_status = "Indexing"
            # Save chunks to DB and Vector Store
            for c, vec in zip(chunks, vectors):
                db_chunk = DocumentChunk(
                    document_id=doc.id,
                    chunk_index=c.chunk_index,
                    content=c.content,
                    page_number=c.page_number,
                    section_path=c.section_path,
                    token_count=c.token_count
                )
                db.add(db_chunk)
                await db.flush()
                
                # Register in local vector store
                vector_store.add_records([
                    VectorRecord(
                        chunk_id=db_chunk.id,
                        document_id=doc.id,
                        content=c.content,
                        vector=vec,
                        metadata={
                            "page": c.page_number,
                            "section": c.section_path,
                            "file_name": safe_filename
                        }
                    )
                ])

            doc.processing_status = "Ready"
        except Exception as e:
            doc.processing_status = "Failed"
            doc.error_details = str(e)
            
        await db.commit()
        await db.refresh(doc)
        created_docs.append({
            "id": doc.id,
            "file_name": doc.file_name,
            "status": doc.processing_status,
            "page_count": doc.page_count,
            "character_count": doc.character_count,
            "error_details": doc.error_details,
            "is_duplicate": False
        })
        
    return {"uploaded": created_docs, "total": len(created_docs)}

@router.get("")
async def list_documents(db: AsyncSession = Depends(get_db)):
    stmt = select(Document).order_by(Document.created_at.desc())
    docs = (await db.execute(stmt)).scalars().all()
    return [
        {
            "id": d.id,
            "file_name": d.file_name,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "processing_status": d.processing_status,
            "page_count": d.page_count,
            "character_count": d.character_count,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "error_details": d.error_details
        }
        for d in docs
    ]

@router.get("/{doc_id}")
async def get_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc.id,
        "file_name": doc.file_name,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "processing_status": doc.processing_status,
        "page_count": doc.page_count,
        "character_count": doc.character_count,
        "preview_text": doc.preview_text,
        "error_details": doc.error_details,
        "created_at": doc.created_at.isoformat() if doc.created_at else None
    }

@router.get("/{doc_id}/preview")
async def get_document_preview(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    chunk_stmt = select(DocumentChunk).where(DocumentChunk.document_id == doc_id).order_by(DocumentChunk.chunk_index).limit(20)
    chunks = (await db.execute(chunk_stmt)).scalars().all()
    
    return {
        "document_id": doc.id,
        "file_name": doc.file_name,
        "preview_text": doc.preview_text,
        "sample_chunks": [
            {
                "chunk_id": c.id,
                "chunk_index": c.chunk_index,
                "page_number": c.page_number,
                "section_path": c.section_path,
                "content": c.content,
                "token_count": c.token_count
            }
            for c in chunks
        ]
    }

@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if settings.DEMO_MODE and "handbook" in doc.file_name.lower():
        raise HTTPException(status_code=403, detail="The baseline demo handbook is protected from deletion in Demo Mode.")
        
    # Remove from storage if exists
    if os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except Exception:
            pass

    # Explicitly remove chunks from DB
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc_id))
    await db.delete(doc)
    await db.commit()

    # Remove vector embeddings from Chroma DB and in-memory index
    deleted_vectors = vector_store.delete_document(doc_id)

    return {
        "message": "Document deleted successfully",
        "id": doc_id,
        "deleted_vectors": deleted_vectors
    }

@router.post("/{doc_id}/reindex")
async def reindex_document(doc_id: str, db: AsyncSession = Depends(get_db)):
    doc = await db.get(Document, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    chunk_stmt = select(DocumentChunk).where(DocumentChunk.document_id == doc_id).order_by(DocumentChunk.chunk_index)
    chunks = (await db.execute(chunk_stmt)).scalars().all()
    if not chunks:
        raise HTTPException(status_code=400, detail="Document has no chunks to reindex")
        
    store_dim = vector_store.get_dimension()
    active_pipe_stmt = select(PipelineConfig).order_by(PipelineConfig.name.asc())
    active_pipe = (await db.execute(active_pipe_stmt)).scalars().first()
    emb_model = active_pipe.embedding_model if active_pipe else "BAAI/bge-small-en-v1.5"
    emb_dim = store_dim or (active_pipe.embedding_dimension if active_pipe else 384)
    
    texts = [c.content for c in chunks]
    vectors = EmbeddingRegistry.embed_texts(texts, model_id=emb_model, dimension=emb_dim)
    
    records = [
        VectorRecord(
            chunk_id=c.id,
            document_id=doc.id,
            content=c.content,
            vector=v,
            metadata={
                "page": c.page_number,
                "section": c.section_path,
                "file_name": doc.file_name
            }
        )
        for c, v in zip(chunks, vectors)
    ]
    vector_store.add_records(records)
    
    return {
        "status": "success",
        "document_id": doc_id,
        "reindexed_chunks": len(records),
        "embedding_dimension": emb_dim
    }
