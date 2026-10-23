import math
from typing import List, Set, Dict, Any, Optional

class RetrievalMetricsEngine:
    @classmethod
    def evaluate_query(
        cls,
        retrieved_ids: List[str],
        gold_relevant_ids: List[str],
        k: int = 5,
        graded_relevance: Optional[Dict[str, int]] = None,
        retrieved_texts: Optional[List[str]] = None,
        gold_facts: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Calculates all Top 10 Retrieval Metrics for a single query.
        Returns exact normalized 0-100 scores along with raw float values and diagnostic flags.
        """
        top_k = retrieved_ids[:k]
        actual_k = len(top_k)
        effective_k = max(1, k)
        
        target_set: Set[str] = set(gold_relevant_ids)
        has_gold_labels = len(target_set) > 0

        # If no gold relevance labels exist, ranking metrics cannot be computed ground-truth
        if not has_gold_labels:
            return {
                "has_ground_truth": False,
                "warning": "No gold relevance labels provided for this query. Ranking metrics excluded.",
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "f1_at_k": 0.0,
                "hit_rate_at_k": 0.0,
                "mrr": 0.0,
                "map_at_k": 0.0,
                "ndcg_at_k": 0.0,
                "r_precision": 0.0,
                "context_precision": 0.0,
                "context_recall": 0.0,
            }

        # Check if an item at index idx is relevant (via ID match or fact content coverage fallback)
        def is_hit(item: str, item_idx: int) -> bool:
            if item in target_set:
                return True
            if retrieved_texts and item_idx < len(retrieved_texts) and gold_facts:
                text = retrieved_texts[item_idx].lower()
                for fact in gold_facts:
                    key_words = [w for w in fact.lower().split() if len(w) > 4]
                    if key_words and sum(1 for w in key_words if w in text) / len(key_words) >= 0.7:
                        return True
            return False

        # 1. Precision@K
        hits_in_k = [item for idx, item in enumerate(top_k) if is_hit(item, idx)]
        num_hits_k = len(hits_in_k)
        precision_at_k = num_hits_k / effective_k

        # 2. Recall@K
        total_gold = len(target_set)
        recall_at_k = num_hits_k / total_gold if total_gold > 0 else 0.0

        # 3. F1@K
        if precision_at_k + recall_at_k > 0:
            f1_at_k = 2 * (precision_at_k * recall_at_k) / (precision_at_k + recall_at_k)
        else:
            f1_at_k = 0.0

        # 4. Hit Rate@K
        hit_rate_at_k = 1.0 if num_hits_k > 0 else 0.0

        # 5. MRR (Mean Reciprocal Rank)
        mrr = 0.0
        for rank_idx, item in enumerate(retrieved_ids, start=1):
            if is_hit(item, rank_idx - 1):
                mrr = 1.0 / rank_idx
                break

        # 6. MAP@K (Mean Average Precision)
        running_hits = 0
        sum_precisions = 0.0
        for idx, item in enumerate(top_k, start=1):
            if is_hit(item, idx - 1):
                running_hits += 1
                sum_precisions += (running_hits / idx)
        
        denominator = min(total_gold, effective_k)
        map_at_k = (sum_precisions / denominator) if denominator > 0 else 0.0

        # 7. nDCG@K
        # Default binary relevance: 1 if is_hit else 0, or use graded dictionary
        relevance_grades = graded_relevance or {}
        def get_rel(doc_id: str, doc_idx: int) -> int:
            if doc_id in relevance_grades:
                return relevance_grades[doc_id]
            return 1 if is_hit(doc_id, doc_idx) else 0

        dcg_k = 0.0
        for idx, item in enumerate(top_k, start=1):
            rel = get_rel(item, idx - 1)
            dcg_k += (math.pow(2, rel) - 1.0) / math.log2(idx + 1)

        # Ideal DCG: sort all labeled gold items by descending relevance
        all_rels = sorted([relevance_grades.get(item, 1) for item in gold_relevant_ids], reverse=True)[:effective_k]
        idcg_k = 0.0
        for idx, rel in enumerate(all_rels, start=1):
            idcg_k += (math.pow(2, rel) - 1.0) / math.log2(idx + 1)

        ndcg_at_k = (dcg_k / idcg_k) if idcg_k > 0.0 else 0.0

        # 8. R-Precision (Precision at cutoff R = len(gold))
        cutoff_r = total_gold
        top_r = retrieved_ids[:cutoff_r]
        hits_in_r = len([item for idx, item in enumerate(top_r) if is_hit(item, idx)])
        r_precision = (hits_in_r / cutoff_r) if cutoff_r > 0 else 0.0

        # 9. Context Precision (Position-weighted precision over retrieved text/chunks)
        weighted_precisions = []
        context_hits = 0
        for idx, item in enumerate(top_k, start=1):
            if is_hit(item, idx - 1):
                context_hits += 1
                weighted_precisions.append(context_hits / idx)
            else:
                weighted_precisions.append(0.0)
        context_precision = (sum(weighted_precisions) / max(1, context_hits)) if context_hits > 0 else 0.0

        # 10. Context Recall (proportion of reference statements covered)
        if gold_facts and retrieved_texts:
            combined_context = " ".join(retrieved_texts).lower()
            covered_facts = sum(1 for f in gold_facts if any(w in combined_context for w in f.lower().split() if len(w) > 4))
            context_recall = covered_facts / len(gold_facts)
        else:
            # Fallback to recall@k
            context_recall = recall_at_k

        return {
            "has_ground_truth": True,
            "precision_at_k": round(precision_at_k * 100, 2),
            "recall_at_k": round(recall_at_k * 100, 2),
            "f1_at_k": round(f1_at_k * 100, 2),
            "hit_rate_at_k": round(hit_rate_at_k * 100, 2),
            "mrr": round(mrr * 100, 2),
            "map_at_k": round(map_at_k * 100, 2),
            "ndcg_at_k": round(ndcg_at_k * 100, 2),
            "r_precision": round(r_precision * 100, 2),
            "context_precision": round(context_precision * 100, 2),
            "context_recall": round(context_recall * 100, 2),
            "raw": {
                "precision": precision_at_k,
                "recall": recall_at_k,
                "f1": f1_at_k,
                "hit_rate": hit_rate_at_k,
                "mrr": mrr,
                "map": map_at_k,
                "ndcg": ndcg_at_k,
                "r_precision": r_precision,
                "context_precision": context_precision,
                "context_recall": context_recall
            }
        }

    @classmethod
    def aggregate_dataset_scores(cls, per_query_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Computes macro-average scores across the entire evaluation dataset.
        Never treats missing ground-truth queries as zero.
        """
        valid_queries = [res for res in per_query_results if res.get("has_ground_truth", False)]
        total_queries = len(per_query_results)
        valid_count = len(valid_queries)
        
        if valid_count == 0:
            return {
                "total_queries": total_queries,
                "evaluated_queries": 0,
                "excluded_queries": total_queries,
                "precision_at_k": 0.0,
                "recall_at_k": 0.0,
                "f1_at_k": 0.0,
                "hit_rate_at_k": 0.0,
                "mrr": 0.0,
                "map_at_k": 0.0,
                "ndcg_at_k": 0.0,
                "r_precision": 0.0,
                "context_precision": 0.0,
                "context_recall": 0.0,
            }

        metrics = [
            "precision_at_k", "recall_at_k", "f1_at_k", "hit_rate_at_k",
            "mrr", "map_at_k", "ndcg_at_k", "r_precision",
            "context_precision", "context_recall"
        ]
        
        aggregates = {
            "total_queries": total_queries,
            "evaluated_queries": valid_count,
            "excluded_queries": total_queries - valid_count
        }

        for m in metrics:
            scores = [q[m] for q in valid_queries]
            aggregates[m] = round(sum(scores) / valid_count, 2)

        return aggregates
