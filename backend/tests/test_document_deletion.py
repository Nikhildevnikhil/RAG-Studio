import pytest
import httpx
from backend.app.main import app, lifespan
from backend.app.core.database import AsyncSessionLocal, Document, DocumentChunk
from backend.app.vectorstores.store import vector_store
from sqlalchemy import select

@pytest.mark.asyncio
async def test_complete_document_deletion_lifecycle():
    async with lifespan(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Upload a dedicated document for deletion test
            file_content = b"## Temporary Test File\nThis document is created solely to test end-to-end cascading deletion from DB and Chroma vector storage."
            files = [("files", ("temp_delete_spec.md", file_content, "text/markdown"))]
            upload_res = await client.post("/api/v1/documents/upload", files=files)
            assert upload_res.status_code == 200
            data = upload_res.json()
            assert len(data["uploaded"]) == 1
            doc_id = data["uploaded"][0]["id"]

            # 2. Verify chunks and vectors exist
            async with AsyncSessionLocal() as session:
                doc = await session.get(Document, doc_id)
                assert doc is not None
                chunks = (await session.execute(select(DocumentChunk).where(DocumentChunk.document_id == doc_id))).scalars().all()
                assert len(chunks) > 0
                chunk_ids = [c.id for c in chunks]

            # Vector store check
            memory_count_before = len([cid for cid, r in vector_store.fallback_memory.records.items() if r.document_id == doc_id])
            assert memory_count_before > 0

            # 3. Call DELETE /api/v1/documents/{doc_id}
            del_res = await client.delete(f"/api/v1/documents/{doc_id}")
            assert del_res.status_code == 200
            del_data = del_res.json()
            assert del_data["id"] == doc_id
            assert del_data["deleted_vectors"] == memory_count_before

            # 4. Verify Document row is gone
            async with AsyncSessionLocal() as session:
                deleted_doc = await session.get(Document, doc_id)
                assert deleted_doc is None

                # Verify all chunks are purged
                remaining_chunks = (await session.execute(select(DocumentChunk).where(DocumentChunk.document_id == doc_id))).scalars().all()
                assert len(remaining_chunks) == 0

            # 5. Verify vectors purged from vector store
            memory_count_after = len([cid for cid, r in vector_store.fallback_memory.records.items() if r.document_id == doc_id])
            assert memory_count_after == 0

            # 6. Verify 404 on get
            get_res = await client.get(f"/api/v1/documents/{doc_id}")
            assert get_res.status_code == 404
