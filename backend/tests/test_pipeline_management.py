import pytest
import httpx
from sqlalchemy import select
from backend.app.main import app, lifespan
from backend.app.core.database import AsyncSessionLocal, PipelineConfig

@pytest.mark.asyncio
async def test_pipeline_naming_and_deletion():
    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Validation: Empty name should be rejected with 400
            empty_res = await client.post("/api/v1/pipelines", json={
                "name": "   ",
                "embedding_model": "BAAI/bge-small-en-v1.5"
            })
            assert empty_res.status_code == 400
            assert "name cannot be empty" in empty_res.json()["detail"].lower()

            # 2. Creation with custom name and description
            custom_name = "Custom Enterprise QA Pipeline"
            custom_desc = "Testing pipeline naming and deletion"
            create_res = await client.post("/api/v1/pipelines", json={
                "name": custom_name,
                "description": custom_desc,
                "chunking_strategy": "sentence_based",
                "chunk_size": 400,
                "chunk_overlap": 40,
                "embedding_provider": "huggingface",
                "embedding_model": "BAAI/bge-small-en-v1.5",
                "embedding_dimension": 384,
                "vector_store": "chroma",
                "retrieval_mode": "dense",
                "top_k": 3,
                "generation_provider": "huggingface",
                "generation_model": "HuggingFaceH4/zephyr-7b-beta"
            })
            assert create_res.status_code == 200
            created_data = create_res.json()
            pipeline_id = created_data["id"]
            assert created_data["name"] == custom_name
            assert created_data["description"] == custom_desc

            # 3. Verify it appears in list
            list_res = await client.get("/api/v1/pipelines")
            assert list_res.status_code == 200
            pipelines = list_res.json()
            assert any(p["id"] == pipeline_id for p in pipelines)

            # 4. Update pipeline name via PUT
            new_name = "Renamed Enterprise QA Pipeline"
            put_res = await client.put(f"/api/v1/pipelines/{pipeline_id}", json={
                "name": new_name
            })
            assert put_res.status_code == 200
            assert put_res.json()["name"] == new_name

            # 5. Delete pipeline via DELETE
            del_res = await client.delete(f"/api/v1/pipelines/{pipeline_id}")
            assert del_res.status_code == 200
            del_data = del_res.json()
            assert del_data["status"] == "success"
            assert del_data["id"] == pipeline_id

            # 6. Verify pipeline is gone
            get_res = await client.get(f"/api/v1/pipelines/{pipeline_id}")
            assert get_res.status_code == 404

            # 7. Verify deleting non-existent returns 404
            del_res_again = await client.delete(f"/api/v1/pipelines/{pipeline_id}")
            assert del_res_again.status_code == 404

@pytest.mark.asyncio
async def test_pipeline_batch_deletion():
    async with lifespan(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Create two test pipelines
            p1 = await client.post("/api/v1/pipelines", json={"name": "Batch Delete Pipe 1"})
            p2 = await client.post("/api/v1/pipelines", json={"name": "Batch Delete Pipe 2"})
            assert p1.status_code == 200
            assert p2.status_code == 200
            id1 = p1.json()["id"]
            id2 = p2.json()["id"]

            # Batch delete both
            batch_res = await client.post("/api/v1/pipelines/batch-delete", json={"pipeline_ids": [id1, id2]})
            assert batch_res.status_code == 200
            data = batch_res.json()
            assert data["status"] == "success"
            assert data["deleted_count"] == 2
            assert id1 in data["deleted_ids"]
            assert id2 in data["deleted_ids"]

            # Confirm both are gone
            assert (await client.get(f"/api/v1/pipelines/{id1}")).status_code == 404
            assert (await client.get(f"/api/v1/pipelines/{id2}")).status_code == 404

