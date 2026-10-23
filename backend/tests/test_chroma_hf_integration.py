import os
import pytest
import numpy as np
from backend.app.embeddings.registry import EmbeddingRegistry, EMBEDDING_CATALOG
from backend.app.vectorstores.store import ChromaVectorStore, VectorRecord
from backend.app.generation.llm import LLMGenerationService

def test_huggingface_embedding_models_catalog():
    hf_models = [m for m in EMBEDDING_CATALOG if m["provider"] == "huggingface"]
    assert len(hf_models) >= 4
    model_ids = [m["model_id"] for m in hf_models]
    assert "BAAI/bge-small-en-v1.5" in model_ids
    assert "sentence-transformers/all-MiniLM-L6-v2" in model_ids
    assert "BAAI/bge-large-en-v1.5" in model_ids
    assert "intfloat/e5-base-v2" in model_ids

def test_huggingface_embedding_vector_dimensions():
    # Test BGE Small (384)
    texts = ["Retrieval augmented generation enables factual accuracy.", "Vector search uses cosine similarity."]
    bge_vecs = EmbeddingRegistry.embed_texts(texts, model_id="BAAI/bge-small-en-v1.5", dimension=384)
    assert len(bge_vecs) == 2
    assert len(bge_vecs[0]) == 384
    norm0 = np.linalg.norm(bge_vecs[0])
    assert abs(norm0 - 1.0) < 1e-4

    # Test BGE Large (1024)
    large_vecs = EmbeddingRegistry.embed_texts(texts, model_id="BAAI/bge-large-en-v1.5", dimension=1024)
    assert len(large_vecs) == 2
    assert len(large_vecs[0]) == 1024

    # Test query embedding
    q_vec = EmbeddingRegistry.embed_query("What is RAG?", model_id="sentence-transformers/all-MiniLM-L6-v2", dimension=384)
    assert len(q_vec) == 384

def test_chroma_vector_store_operations():
    test_dir = "./storage/test_chroma_db"
    store = ChromaVectorStore(persist_directory=test_dir)
    store.clear()
    assert store.count() == 0

    # Create test records
    texts = [
        "Recursive character chunking preserves paragraph structure and formatting.",
        "BM25 is a term-frequency based lexical retrieval scoring algorithm.",
        "LLM-as-a-Judge utilizes rubrics to evaluate generation correctness and faithfulness."
    ]
    vectors = EmbeddingRegistry.embed_texts(texts, model_id="BAAI/bge-small-en-v1.5", dimension=384)
    records = [
        VectorRecord(
            chunk_id=f"c_{i}",
            document_id=f"doc_{i % 2}",
            content=text,
            vector=vec,
            metadata={"page": i + 1, "section": f"Section {i + 1}", "file_name": f"test_doc_{i % 2}.md"}
        )
        for i, (text, vec) in enumerate(zip(texts, vectors))
    ]

    store.add_records(records)
    assert store.count() >= 3

    # Query dense similarity
    q_vec = EmbeddingRegistry.embed_query("How does chunking preserve structure?", model_id="BAAI/bge-small-en-v1.5", dimension=384)
    dense_results = store.search_dense(q_vec, top_k=2)
    assert len(dense_results) > 0
    assert "chunk_id" in dense_results[0]
    assert "content" in dense_results[0]
    assert "score" in dense_results[0]
    assert dense_results[0]["score"] >= 0.0

    # MMR Search
    mmr_results = store.search_mmr(q_vec, top_k=2, lambda_mult=0.5)
    assert len(mmr_results) > 0

    # Filter by document_id
    filtered = store.search_dense(q_vec, top_k=5, filter_doc_ids=["doc_0"])
    for r in filtered:
        assert r["document_id"] == "doc_0"

    # Cleanup
    store.clear()

def test_huggingface_llm_generation_and_citations():
    retrieved_chunks = [
        {
            "chunk_id": "c_1",
            "document_id": "doc_rag",
            "content": "RAG Studio combines neural vector search with dense cosine similarity and MMR re-ranking.",
            "metadata": {"page": 2, "section": "Retrieval Engine", "file_name": "architecture.pdf"}
        },
        {
            "chunk_id": "c_2",
            "document_id": "doc_rag",
            "content": "Automated evaluation calculates Precision@K, Recall@K, and nDCG@K across gold standards.",
            "metadata": {"page": 5, "section": "Evaluation Suite", "file_name": "architecture.pdf"}
        }
    ]

    res = LLMGenerationService.generate_answer(
        query="What evaluation metrics and retrieval methods does RAG Studio use?",
        retrieved_chunks=retrieved_chunks,
        model_name="HuggingFaceH4/zephyr-7b-beta"
    )

    assert "answer" in res
    assert "citations" in res
    assert "is_citation_valid" in res
    assert res["model"] == "HuggingFaceH4/zephyr-7b-beta"
    assert len(res["citations"]) > 0
    assert res["is_citation_valid"] is True
