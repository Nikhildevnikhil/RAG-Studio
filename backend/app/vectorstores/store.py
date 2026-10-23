import logging
import numpy as np
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class VectorRecord:
    def __init__(self, chunk_id: str, document_id: str, content: str, vector: List[float], metadata: Dict[str, Any] = None):
        self.chunk_id = chunk_id
        self.document_id = document_id
        self.content = content
        self.vector = np.array(vector, dtype=np.float32)
        self.metadata = metadata or {}

class LocalVectorStore:
    def __init__(self):
        self.records: Dict[str, VectorRecord] = {}

    def get_dimension(self) -> Optional[int]:
        if self.records:
            first = next(iter(self.records.values()))
            return len(first.vector)
        return None

    def add_records(self, records: List[VectorRecord]):
        for r in records:
            self.records[r.chunk_id] = r

    def clear(self):
        self.records.clear()

    def delete_document(self, document_id: str) -> int:
        to_delete = [cid for cid, r in self.records.items() if r.document_id == document_id]
        for cid in to_delete:
            del self.records[cid]
        return len(to_delete)

    def count(self) -> int:
        return len(self.records)

    def search_dense(
        self,
        query_vector: List[float],
        top_k: int = 5,
        similarity_threshold: float = 0.0,
        filter_doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Dense cosine similarity vector search."""
        if not self.records:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        results = []
        for chunk_id, record in self.records.items():
            if filter_doc_ids and record.document_id not in filter_doc_ids:
                continue

            r_norm = np.linalg.norm(record.vector)
            if r_norm > 0:
                normed_vec = record.vector / r_norm
            else:
                normed_vec = record.vector

            sim = float(np.dot(q_vec, normed_vec))
            # Normalized score mapped to [0, 1]
            sim_score = (sim + 1.0) / 2.0
            
            if sim_score >= similarity_threshold:
                results.append({
                    "chunk_id": chunk_id,
                    "document_id": record.document_id,
                    "content": record.content,
                    "score": round(sim_score, 4),
                    "metadata": record.metadata
                })

        # Sort descending by score
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def search_mmr(
        self,
        query_vector: List[float],
        top_k: int = 5,
        lambda_mult: float = 0.5,
        candidate_multiplier: int = 4,
        filter_doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Maximum Marginal Relevance (MMR) retrieval.
        Balances query relevance with chunk diversity.
        """
        candidates = self.search_dense(
            query_vector,
            top_k=top_k * candidate_multiplier,
            filter_doc_ids=filter_doc_ids
        )
        if not candidates or len(candidates) <= top_k:
            return candidates

        selected: List[Dict[str, Any]] = []
        selected_vectors: List[np.ndarray] = []
        
        # Pick top candidate first
        first = candidates.pop(0)
        selected.append(first)
        selected_vectors.append(self.records[first["chunk_id"]].vector)

        while len(selected) < top_k and candidates:
            best_idx = 0
            best_mmr_score = -float("inf")

            for idx, cand in enumerate(candidates):
                c_vec = self.records[cand["chunk_id"]].vector
                sim_to_query = cand["score"]

                # Max similarity to already selected items
                sim_to_selected = max([
                    float(np.dot(c_vec, s_vec) / (np.linalg.norm(c_vec) * np.linalg.norm(s_vec) + 1e-8))
                    for s_vec in selected_vectors
                ])
                sim_to_selected = (sim_to_selected + 1.0) / 2.0

                mmr_score = lambda_mult * sim_to_query - (1.0 - lambda_mult) * sim_to_selected
                if mmr_score > best_mmr_score:
                    best_mmr_score = mmr_score
                    best_idx = idx

            chosen = candidates.pop(best_idx)
            selected.append(chosen)
            selected_vectors.append(self.records[chosen["chunk_id"]].vector)

        return selected

class ChromaVectorStore:
    def __init__(self, persist_directory: Optional[str] = None):
        from backend.app.core.config import settings
        self.persist_directory = persist_directory or settings.CHROMA_PERSIST_DIRECTORY
        self.fallback_memory = LocalVectorStore()
        self._client = None
        self._collection = None
        self._init_chroma()

    def _init_chroma(self):
        try:
            import chromadb
            if self.persist_directory:
                self._client = chromadb.PersistentClient(path=self.persist_directory)
            else:
                self._client = chromadb.Client()
            self._collection = self._client.get_or_create_collection(
                name="rag_studio_chunks",
                metadata={"hnsw:space": "cosine"}
            )
        except Exception as e:
            logger.warning(f"ChromaDB initialization failed, using in-memory vector store: {e}")
            self._client = None
            self._collection = None

    def get_dimension(self) -> Optional[int]:
        if self._collection is not None:
            try:
                sample = self._collection.peek(limit=1)
                embs = sample.get("embeddings")
                if embs is not None and len(embs) > 0:
                    return len(embs[0])
            except Exception:
                pass
        return self.fallback_memory.get_dimension()

    def add_records(self, records: List[VectorRecord]):
        self.fallback_memory.add_records(records)
        if self._collection is not None and records:
            try:
                # If collection already has items with a different dimension, re-create collection
                curr_dim = self.get_dimension()
                new_dim = len(records[0].vector)
                if curr_dim is not None and curr_dim != new_dim:
                    logger.warning(
                        f"Collection dimension ({curr_dim}) differs from incoming records dimension ({new_dim}). Recreating collection."
                    )
                    self._client.delete_collection("rag_studio_chunks")
                    self._collection = self._client.get_or_create_collection(
                        name="rag_studio_chunks",
                        metadata={"hnsw:space": "cosine"}
                    )

                ids = [r.chunk_id for r in records]
                embeddings = [r.vector.tolist() for r in records]
                documents = [r.content for r in records]
                metadatas = [
                    {
                        "document_id": str(r.document_id),
                        "page": int(r.metadata.get("page", 1)),
                        "section": str(r.metadata.get("section", "")),
                        "file_name": str(r.metadata.get("file_name", "")),
                        "pipeline_id": str(r.metadata.get("pipeline_id", ""))
                    }
                    for r in records
                ]
                self._collection.upsert(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas
                )
            except Exception as e:
                logger.error(f"Error during ChromaDB upsert: {e}", exc_info=True)

    def count(self) -> int:
        if self._collection is not None:
            try:
                return self._collection.count()
            except Exception:
                pass
        return self.fallback_memory.count()

    def clear(self):
        self.fallback_memory.clear()
        if self._collection is not None and self._client is not None:
            try:
                self._client.delete_collection("rag_studio_chunks")
                self._collection = self._client.get_or_create_collection(
                    name="rag_studio_chunks",
                    metadata={"hnsw:space": "cosine"}
                )
            except Exception as e:
                logger.error(f"Error clearing ChromaDB collection: {e}")

    def delete_document(self, document_id: str) -> int:
        mem_count = self.fallback_memory.delete_document(document_id)
        if self._collection is not None:
            try:
                self._collection.delete(where={"document_id": document_id})
            except Exception as e:
                logger.error(f"Error deleting document {document_id} from Chroma: {e}")
        return mem_count

    def search_dense(
        self,
        query_vector: List[float],
        top_k: int = 5,
        similarity_threshold: float = 0.0,
        filter_doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        if self._collection is not None and self.count() > 0:
            try:
                coll_dim = self.get_dimension()
                if coll_dim is not None and len(query_vector) != coll_dim:
                    logger.warning(
                        f"Search vector dimension mismatch: query={len(query_vector)}, collection={coll_dim}. Adapting dimension."
                    )
                    if len(query_vector) < coll_dim:
                        query_vector = list(query_vector) + [0.0] * (coll_dim - len(query_vector))
                    else:
                        query_vector = list(query_vector[:coll_dim])

                where_filter = None
                if filter_doc_ids and len(filter_doc_ids) == 1:
                    where_filter = {"document_id": filter_doc_ids[0]}
                elif filter_doc_ids and len(filter_doc_ids) > 1:
                    where_filter = {"document_id": {"$in": filter_doc_ids}}

                results = self._collection.query(
                    query_embeddings=[query_vector],
                    n_results=min(top_k, self._collection.count()),
                    where=where_filter,
                    include=["documents", "metadatas", "distances"]
                )
                if results and results.get("ids") and len(results["ids"][0]) > 0:
                    formatted = []
                    for cid, doc, meta, dist in zip(
                        results["ids"][0],
                        results["documents"][0],
                        results["metadatas"][0],
                        results["distances"][0]
                    ):
                        sim_score = max(0.0, min(1.0, 1.0 - (dist / 2.0)))
                        if sim_score >= similarity_threshold:
                            formatted.append({
                                "chunk_id": cid,
                                "document_id": meta.get("document_id", ""),
                                "content": doc,
                                "score": round(sim_score, 4),
                                "metadata": meta
                            })
                    if formatted:
                        return formatted
            except Exception as e:
                logger.error(f"Error during ChromaDB search_dense: {e}", exc_info=True)

        return self.fallback_memory.search_dense(query_vector, top_k, similarity_threshold, filter_doc_ids)

    def search_mmr(
        self,
        query_vector: List[float],
        top_k: int = 5,
        lambda_mult: float = 0.5,
        candidate_multiplier: int = 4,
        filter_doc_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        if self._collection is not None and self.count() > 0:
            try:
                coll_dim = self.get_dimension()
                if coll_dim is not None and len(query_vector) != coll_dim:
                    logger.warning(
                        f"MMR Query vector dimension mismatch: query={len(query_vector)}, collection={coll_dim}. Adapting."
                    )
                    if len(query_vector) < coll_dim:
                        query_vector = list(query_vector) + [0.0] * (coll_dim - len(query_vector))
                    else:
                        query_vector = list(query_vector[:coll_dim])

                where_filter = None
                if filter_doc_ids and len(filter_doc_ids) == 1:
                    where_filter = {"document_id": filter_doc_ids[0]}
                elif filter_doc_ids and len(filter_doc_ids) > 1:
                    where_filter = {"document_id": {"$in": filter_doc_ids}}

                n_cand = min(top_k * candidate_multiplier, self._collection.count())
                results = self._collection.query(
                    query_embeddings=[query_vector],
                    n_results=n_cand,
                    where=where_filter,
                    include=["documents", "metadatas", "distances", "embeddings"]
                )
                if results and results.get("ids") and len(results["ids"][0]) > 0:
                    candidates = []
                    candidate_vectors = []
                    for cid, doc, meta, dist, emb in zip(
                        results["ids"][0],
                        results["documents"][0],
                        results["metadatas"][0],
                        results["distances"][0],
                        results["embeddings"][0]
                    ):
                        sim_score = max(0.0, min(1.0, 1.0 - (dist / 2.0)))
                        candidates.append({
                            "chunk_id": cid,
                            "document_id": meta.get("document_id", ""),
                            "content": doc,
                            "score": round(sim_score, 4),
                            "metadata": meta
                        })
                        candidate_vectors.append(np.array(emb, dtype=np.float32))

                    if not candidates or len(candidates) <= top_k:
                        return candidates

                    selected: List[Dict[str, Any]] = []
                    selected_vectors: List[np.ndarray] = []

                    # Pick top candidate first
                    first = candidates.pop(0)
                    first_vec = candidate_vectors.pop(0)
                    selected.append(first)
                    selected_vectors.append(first_vec)

                    while len(selected) < top_k and candidates:
                        best_idx = 0
                        best_mmr_score = -float("inf")

                        for idx, (cand, c_vec) in enumerate(zip(candidates, candidate_vectors)):
                            sim_to_query = cand["score"]
                            sim_to_selected = max([
                                float(np.dot(c_vec, s_vec) / (np.linalg.norm(c_vec) * np.linalg.norm(s_vec) + 1e-8))
                                for s_vec in selected_vectors
                            ])
                            sim_to_selected = (sim_to_selected + 1.0) / 2.0

                            mmr_score = lambda_mult * sim_to_query - (1.0 - lambda_mult) * sim_to_selected
                            if mmr_score > best_mmr_score:
                                best_mmr_score = mmr_score
                                best_idx = idx

                        chosen = candidates.pop(best_idx)
                        chosen_vec = candidate_vectors.pop(best_idx)
                        selected.append(chosen)
                        selected_vectors.append(chosen_vec)

                    return selected
            except Exception as e:
                logger.error(f"Error during ChromaDB search_mmr: {e}", exc_info=True)

        return self.fallback_memory.search_mmr(
            query_vector,
            top_k=top_k,
            lambda_mult=lambda_mult,
            candidate_multiplier=candidate_multiplier,
            filter_doc_ids=filter_doc_ids
        )

# Global vector store singleton using Chroma with local in-memory fallback
vector_store = ChromaVectorStore()

