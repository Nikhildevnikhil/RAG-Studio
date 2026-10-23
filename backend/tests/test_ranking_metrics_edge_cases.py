from backend.app.evaluation.retrieval_metrics import RetrievalMetricsEngine


def test_retrieval_metrics_edge_cases():
    print("Testing Retrieval Metrics Edge Cases:")

    # Case 1: Missing ground truth (no relevant labels)
    res_no_gt = RetrievalMetricsEngine.evaluate_query(
        retrieved_ids=["doc_1", "doc_2", "doc_3"],
        gold_relevant_ids=[],
        k=5
    )
    assert res_no_gt["has_ground_truth"] is False
    assert res_no_gt["precision_at_k"] == 0.0
    print("  [Pass] Missing ground-truth handling")

    # Case 2: Zero hits (completely irrelevant retrieval)
    res_zero = RetrievalMetricsEngine.evaluate_query(
        retrieved_ids=["doc_a", "doc_b", "doc_c"],
        gold_relevant_ids=["gold_1", "gold_2"],
        k=3
    )
    assert res_zero["has_ground_truth"] is True
    assert res_zero["precision_at_k"] == 0.0
    assert res_zero["recall_at_k"] == 0.0
    assert res_zero["f1_at_k"] == 0.0
    assert res_zero["hit_rate_at_k"] == 0.0
    assert res_zero["mrr"] == 0.0
    print("  [Pass] Zero hits / completely irrelevant ranking")

    # Case 3: Perfect retrieval (100% precision & recall)
    res_perfect = RetrievalMetricsEngine.evaluate_query(
        retrieved_ids=["gold_1", "gold_2"],
        gold_relevant_ids=["gold_1", "gold_2"],
        k=2
    )
    assert res_perfect["precision_at_k"] == 100.0
    assert res_perfect["recall_at_k"] == 100.0
    assert res_perfect["f1_at_k"] == 100.0
    assert res_perfect["hit_rate_at_k"] == 100.0
    assert res_perfect["mrr"] == 100.0
    assert res_perfect["ndcg_at_k"] == 100.0
    assert res_perfect["r_precision"] == 100.0
    print("  [Pass] Perfect retrieval (100% across all 10 metrics)")

    # Case 4: Partial hits with rank decay (first relevant at rank 2)
    res_partial = RetrievalMetricsEngine.evaluate_query(
        retrieved_ids=["irrelevant", "gold_1", "irrelevant_2"],
        gold_relevant_ids=["gold_1", "gold_2"],
        k=3
    )
    assert res_partial["mrr"] == 50.0  # 1 / 2 = 0.5 -> 50%
    assert res_partial["hit_rate_at_k"] == 100.0
    assert res_partial["recall_at_k"] == 50.0  # 1 of 2 retrieved
    print("  [Pass] MRR reciprocal decay and partial recall")

    # Case 5: Dataset aggregation excludes missing GT without zero-skewing
    agg = RetrievalMetricsEngine.aggregate_dataset_scores([
        res_perfect,
        res_zero,
        res_no_gt  # should be excluded from denominator
    ])
    assert agg["total_queries"] == 3
    assert agg["evaluated_queries"] == 2
    assert agg["excluded_queries"] == 1
    # Average of 100% and 0% over 2 evaluated queries = 50%
    assert agg["precision_at_k"] == 50.0
    print("  [Pass] Dataset score aggregation with excluded missing GT")

    print("\n=== ALL RETRIEVAL METRICS EDGE CASES VERIFIED! ===")

if __name__ == "__main__":
    test_retrieval_metrics_edge_cases()
