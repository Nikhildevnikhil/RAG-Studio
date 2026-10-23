import pytest
import asyncio
import httpx
from backend.app.main import app, lifespan

@pytest.mark.asyncio
async def test_smoke():
    async with lifespan(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Health check
            res = await client.get("/health")
            print("Health status:", res.status_code, res.json())
            assert res.status_code == 200

            # 2. List documents
            res = await client.get("/api/v1/documents")
            print("Documents count:", len(res.json()))
            assert res.status_code == 200

            # 3. List pipelines
            res = await client.get("/api/v1/pipelines")
            print("Pipelines count:", len(res.json()))
            assert res.status_code == 200
            pipeline_id = res.json()[0]["id"]

            # 4. Chat query with citations
            res = await client.post("/api/v1/chat", json={
                "query": "What are the key chunking strategies supported by RAG Studio?",
                "pipeline_id": pipeline_id,
                "top_k": 3
            })
            print("Chat response status:", res.status_code)
            chat_data = res.json()
            print("Generated Answer:", chat_data["answer"][:120] + "...")
            print("Citations count:", len(chat_data["citations"]))
            print("Is citation valid:", chat_data["is_citation_valid"])
            assert res.status_code == 200
            assert len(chat_data["citations"]) > 0

            # 5. Dashboard analytics
            res = await client.get("/api/v1/analytics/dashboard")
            print("Dashboard metrics:", res.json()["metrics"])
            assert res.status_code == 200

            print("\n=== ALL BACKEND SMOKE TESTS PASSED! ===")

if __name__ == "__main__":
    asyncio.run(test_smoke())
