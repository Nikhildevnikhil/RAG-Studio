import pytest
import asyncio
import httpx
import uuid
from backend.app.main import app, lifespan
from backend.app.core.database import AsyncSessionLocal, EvaluationDataset, EvaluationExample

@pytest.mark.asyncio
async def test_evaluation_pipeline():
    async with lifespan(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Generate Synthetic Dataset
            gen_res = await client.post("/api/v1/datasets/generate", json={
                "name": "Handbook Test Suite v1",
                "description": "Synthetic evaluation set covering chunking and retrieval metrics",
                "num_questions": 6,
                "difficulty": "medium",
                "include_unanswerable": True
            })
            print("Dataset generation status:", gen_res.status_code)
            dataset_info = gen_res.json()
            dataset_id = dataset_info["dataset_id"]
            print("Created Dataset ID:", dataset_id, "Example count:", dataset_info["example_count"])
            assert gen_res.status_code == 200

            # 2. Inspect Dataset Examples
            ds_res = await client.get(f"/api/v1/datasets/{dataset_id}")
            examples = ds_res.json()["examples"]
            print(f"Sample Question 1 ({examples[0]['question_type']}):", examples[0]["question"])
            print("Reference Answer:", examples[0]["reference_answer"][:80] + "...")
            print("Gold Chunk IDs:", examples[0]["relevant_chunk_ids"])
            assert len(examples) == 6

            # 3. Get pipeline id
            pipes = (await client.get("/api/v1/pipelines")).json()
            pipeline_id = pipes[0]["id"]

            # 4. Trigger Full Evaluation Run
            print("\nTriggering Multi-Tier Evaluation Run...")
            eval_res = await client.post("/api/v1/evaluations", json={
                "pipeline_id": pipeline_id,
                "dataset_id": dataset_id,
                "name": "Benchmark: Baseline Recursive Chunker",
                "retrieval_k": 5
            })
            print("Evaluation run status:", eval_res.status_code)
            assert eval_res.status_code == 200
            run_data = eval_res.json()
            run_id = run_data["id"]
            aggs = run_data["aggregate_scores"]

            print("\n=== TOP 10 RETRIEVAL METRICS ===")
            retrieval = aggs["retrieval"]
            for metric in [
                "precision_at_k", "recall_at_k", "f1_at_k", "hit_rate_at_k",
                "mrr", "map_at_k", "ndcg_at_k", "r_precision",
                "context_precision", "context_recall"
            ]:
                print(f"  {metric:<20}: {retrieval.get(metric, 0.0)}%")

            print("\n=== LLM-AS-A-JUDGE METRICS (0-100 normalized) ===")
            judge = aggs["judge"]
            for crit, val in judge.items():
                print(f"  {crit:<22}: {val}%")
            print(f"  Overall Judge Score   : {aggs['overall_judge_score']}%")

            # 5. Query-level Result Inspection
            results_res = await client.get(f"/api/v1/evaluations/{run_id}/results")
            q_results = results_res.json()["results"]
            print(f"\nEvaluated {len(q_results)} individual queries.")
            print("Query 1 Failure Tags:", q_results[0]["failure_tags"])

            print("\n=== EVALUATION PIPELINE VERIFIED SUCCESSFULLY! ===")

@pytest.mark.asyncio
async def test_dataset_single_and_batch_deletion():
    async with lifespan(app):
        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())

        # Seed two datasets in DB
        async with AsyncSessionLocal() as db:
            d1 = EvaluationDataset(id=id1, workspace_id="default", name="Batch Delete Test DS 1", example_count=1)
            d2 = EvaluationDataset(id=id2, workspace_id="default", name="Batch Delete Test DS 2", example_count=1)
            ex1 = EvaluationExample(id=str(uuid.uuid4()), dataset_id=id1, question="Q1?", reference_answer="A1")
            ex2 = EvaluationExample(id=str(uuid.uuid4()), dataset_id=id2, question="Q2?", reference_answer="A2")
            db.add_all([d1, d2, ex1, ex2])
            await db.commit()

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # Verify both datasets exist
            res1 = await client.get(f"/api/v1/datasets/{id1}")
            res2 = await client.get(f"/api/v1/datasets/{id2}")
            assert res1.status_code == 200
            assert res2.status_code == 200

            # Batch delete both datasets
            batch_res = await client.post("/api/v1/datasets/batch-delete", json={"dataset_ids": [id1, id2]})
            assert batch_res.status_code == 200
            batch_data = batch_res.json()
            assert batch_data["status"] == "success"
            assert batch_data["deleted_count"] == 2
            assert id1 in batch_data["deleted_ids"]
            assert id2 in batch_data["deleted_ids"]

            # Verify both datasets are removed
            assert (await client.get(f"/api/v1/datasets/{id1}")).status_code == 404
            assert (await client.get(f"/api/v1/datasets/{id2}")).status_code == 404


