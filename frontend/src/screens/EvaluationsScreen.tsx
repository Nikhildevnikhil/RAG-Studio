import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Layers,
  Sparkles,
  BarChart2,
  ShieldCheck,
  FileText,
  Search,
  Filter,
  Clock,
  Timer,
  CheckCircle,
  Cpu
} from "lucide-react";
import { api } from "../services/api";
import { EvaluationRun, PipelineConfig, EvaluationDataset, QueryEvaluationResult } from "../types";

export const EvaluationsScreen: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [retrievalK, setRetrievalK] = useState(5);
  const [runningEval, setRunningEval] = useState(false);

  // Real-time progress bar & telemetry state
  const [evalProgress, setEvalProgress] = useState(0);
  const [evalElapsedSec, setEvalElapsedSec] = useState(0);
  const [evalEstRemainingSec, setEvalEstRemainingSec] = useState(0);
  const [evalCurrentQuery, setEvalCurrentQuery] = useState(1);
  const [evalStageText, setEvalStageText] = useState("");
  const [evalCompletedAnimation, setEvalCompletedAnimation] = useState(false);
  const timerRef = useRef<any>(null);

  // Active run details
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunDetails, setActiveRunDetails] = useState<any>(null);
  const [runQueryResults, setRunQueryResults] = useState<QueryEvaluationResult[]>([]);
  const [filterFailureTag, setFilterFailureTag] = useState<string>("all");

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadData = async () => {
    try {
      const [pList, dList, rList] = await Promise.all([
        api.getPipelines(),
        api.getDatasets(),
        api.getEvaluationRuns(),
      ]);
      setPipelines(pList);
      setDatasets(dList);
      setRuns(rList);
      if (pList.length > 0) setSelectedPipelineId(pList[0].id);
      if (dList.length > 0) setSelectedDatasetId(dList[0].id);
      if (rList.length > 0) {
        selectRun(rList[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const selectRun = async (runId: string) => {
    setActiveRunId(runId);
    try {
      const [runData, resultsData] = await Promise.all([
        api.getEvaluationRun(runId),
        api.getRunResults(runId),
      ]);
      setActiveRunDetails(runData);
      setRunQueryResults(resultsData.results || []);
    } catch (e) {
      console.error(e);
    }
  };

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId);
  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const totalQuestions = selectedDataset?.example_count || 10;

  // Calculate dynamic query latency from past runs
  const avgSecPerQuery = useMemo(() => {
    const completedRuns = runs.filter(
      (r) => r.status === "completed" && (r.duration_ms || 0) > 0 && (r.total_queries || 0) > 0
    );
    if (completedRuns.length > 0) {
      const totalMs = completedRuns.reduce((sum, r) => sum + r.duration_ms, 0);
      const totalQ = completedRuns.reduce((sum, r) => sum + r.total_queries, 0);
      if (totalQ > 0) {
        return Math.max(3, Math.round((totalMs / totalQ) / 1000));
      }
    }
    return 15; // default fallback (15s per query)
  }, [runs]);

  const estimatedTotalSec = totalQuestions * avgSecPerQuery;

  const formatDuration = (totalSec: number) => {
    if (totalSec <= 0) return "0s";
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    if (mins > 0) {
      return `${mins}m ${secs.toString().padStart(2, "0")}s`;
    }
    return `${secs}s`;
  };

  const formatDigitalTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleStartRun = async () => {
    if (!selectedPipelineId || !selectedDatasetId) {
      alert("Please select both a pipeline configuration and an evaluation dataset.");
      return;
    }

    if (timerRef.current) clearInterval(timerRef.current);

    setRunningEval(true);
    setEvalCompletedAnimation(false);
    setEvalProgress(3);
    setEvalElapsedSec(0);
    setEvalEstRemainingSec(estimatedTotalSec);
    setEvalCurrentQuery(1);
    setEvalStageText("Initializing benchmark runner & querying embeddings...");

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setEvalElapsedSec(elapsed);

      // Remaining estimate countdown
      const remaining = Math.max(0, Math.ceil(estimatedTotalSec - elapsed));
      setEvalEstRemainingSec(remaining);

      // Current query index (1-indexed)
      const currentQ = Math.min(totalQuestions, Math.floor(elapsed / Math.max(1, avgSecPerQuery)) + 1);
      setEvalCurrentQuery(currentQ);

      // Stage description cycle
      const cycleSec = elapsed % Math.max(1, avgSecPerQuery);
      const ratio = cycleSec / Math.max(1, avgSecPerQuery);
      let stage = `Query ${currentQ}/${totalQuestions}: Evaluating ranking metrics...`;
      if (ratio < 0.18) {
        stage = `Query ${currentQ}/${totalQuestions}: Dense vector retrieval (Top-${retrievalK} candidates)...`;
      } else if (ratio < 0.55) {
        stage = `Query ${currentQ}/${totalQuestions}: Synthesizing LLM answer & resolving citations...`;
      } else {
        stage = `Query ${currentQ}/${totalQuestions}: LLM Judge grading 11 discrete quality rubrics...`;
      }
      setEvalStageText(stage);

      // Smooth percentage progression:
      const timeRatio = elapsed / Math.max(1, estimatedTotalSec);
      let calculatedProgress = timeRatio * 92;
      if (timeRatio > 1.0) {
        calculatedProgress = 92 + (1 - Math.exp(-(elapsed - estimatedTotalSec) / 20)) * 6;
      }
      setEvalProgress(Math.min(98, Math.max(3, calculatedProgress)));
    }, 250);

    try {
      const res = await api.startEvaluationRun({
        pipeline_id: selectedPipelineId,
        dataset_id: selectedDatasetId,
        retrieval_k: retrievalK,
      });

      if (timerRef.current) clearInterval(timerRef.current);
      setEvalProgress(100);
      setEvalEstRemainingSec(0);
      setEvalStageText("Evaluation complete! Compiling aggregate metrics & diagnostics...");
      setEvalCompletedAnimation(true);

      await loadData();
      await selectRun(res.id);

      setTimeout(() => {
        setRunningEval(false);
        setEvalCompletedAnimation(false);
      }, 1200);
    } catch (e: any) {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunningEval(false);
      setEvalCompletedAnimation(false);
      alert(e.message || "Failed to complete evaluation run.");
    }
  };

  const retrievalScores = activeRunDetails?.aggregate_scores?.retrieval || {};
  const judgeScores = activeRunDetails?.aggregate_scores?.judge || {};
  const overallJudge = activeRunDetails?.aggregate_scores?.overall_judge_score ?? 0;

  const filteredQueryResults = runQueryResults.filter((q) => {
    if (filterFailureTag === "all") return true;
    return q.failure_tags.includes(filterFailureTag);
  });

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Evaluation Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Execute repeatable evaluations measuring the Top 10 Retrieval Metrics and 11 LLM-as-a-Judge criteria.
          </p>
        </div>
      </div>

      {/* Trigger New Evaluation Control Bar */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 font-mono flex items-center gap-2">
              <Play className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
              Configure New Benchmark Run
            </h3>
            <div className="flex items-center gap-3 font-mono text-[11px]">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline">
                Evaluates Ranking Precision + LLM Correctness
              </span>
              <span className="text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-zinc-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-zinc-800/80">
                Est. Duration: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">~{formatDuration(estimatedTotalSec)}</strong>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Pipeline Configuration</label>
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                disabled={runningEval}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white disabled:opacity-50 shadow-sm"
              >
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">Evaluation Dataset</label>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                disabled={runningEval}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white disabled:opacity-50 shadow-sm"
              >
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.example_count} Qs)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold block mb-1">
                Evaluation Cutoff: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">K={retrievalK}</span>
              </label>
              <select
                value={retrievalK}
                onChange={(e) => setRetrievalK(Number(e.target.value))}
                disabled={runningEval}
                className="w-full bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white disabled:opacity-50 shadow-sm"
              >
                <option value={3}>K = 3 (Aggressive Precision)</option>
                <option value={5}>K = 5 (Standard RAG Cutoff)</option>
                <option value={10}>K = 10 (Deep Context)</option>
                <option value={20}>K = 20 (Broad Recall)</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleStartRun}
                disabled={runningEval}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-80 disabled:cursor-not-allowed active:scale-95"
              >
                <Activity className={`w-4 h-4 ${runningEval ? "animate-spin text-cyan-200" : ""}`} />
                {runningEval
                  ? evalCompletedAnimation
                    ? "Evaluation Finished!"
                    : `Evaluating (${Math.round(evalProgress)}%)...`
                  : "Start Evaluation"}
              </button>
            </div>
          </div>

          {/* Active Evaluation Progress Bar & Time Remaining Panel */}
          {runningEval && (
            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-zinc-950/80 border border-cyan-500/30 space-y-3.5 transition-all duration-300 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-zinc-900 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                  </span>
                  <div className="text-xs font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5 flex-wrap">
                    {evalCompletedAnimation ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Evaluation Complete — Scores Loaded!
                      </span>
                    ) : (
                      <>
                        <span className="text-slate-500 dark:text-zinc-400">Benchmarking:</span>
                        <span className="text-cyan-600 dark:text-cyan-300 font-semibold">{selectedPipeline?.name || "Pipeline"}</span>
                        <span className="text-slate-400 dark:text-zinc-600">→</span>
                        <span className="text-slate-700 dark:text-zinc-300">{selectedDataset?.name || "Dataset"}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Real-time Time Telemetry */}
                <div className="flex items-center gap-2.5 text-xs font-mono">
                  <div className="flex items-center gap-1 text-slate-500 dark:text-zinc-400">
                    <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500" />
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500">Elapsed:</span>
                    <span className="text-slate-800 dark:text-zinc-200 font-semibold">{formatDigitalTime(evalElapsedSec)}</span>
                  </div>
                  <span className="text-slate-300 dark:text-zinc-700">|</span>
                  <div className="flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                    <span className="text-[11px] text-slate-500 dark:text-zinc-400">Est. Remaining:</span>
                    <span className="text-cyan-600 dark:text-cyan-400 font-bold">
                      {evalCompletedAnimation ? "0s" : `~${formatDuration(evalEstRemainingSec)}`}
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-zinc-700 hidden md:inline">|</span>
                  <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 dark:text-zinc-500">
                    <span>Est. Total: ~{formatDuration(estimatedTotalSec)}</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Stage Indicator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 truncate max-w-[80%] font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                    {evalStageText}
                  </span>
                  <span className="font-bold text-cyan-600 dark:text-cyan-400 shrink-0 font-mono">
                    {Math.round(evalProgress)}%
                  </span>
                </div>

                <div className="relative w-full h-3 bg-slate-200 dark:bg-zinc-900 rounded-full border border-slate-300 dark:border-zinc-800 overflow-hidden p-0.5 shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden ${
                      evalCompletedAnimation
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-cyan-500 via-indigo-500 to-cyan-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, evalProgress))}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                  </div>
                </div>
              </div>

              {/* Progress Steps / Stages breakdown */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-zinc-400 pt-0.5">
                <div className="flex items-center gap-2">
                  <span>
                    Query <strong className="text-slate-800 dark:text-zinc-200">{evalCurrentQuery}</strong> of{" "}
                    <strong className="text-slate-800 dark:text-zinc-200">{totalQuestions}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">•</span>
                  <span className="text-slate-500">Pace: ~{avgSecPerQuery}s/query</span>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                    1. Dense/MMR Retrieval
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">→</span>
                  <span className="flex items-center gap-1 text-indigo-700 dark:text-indigo-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    2. Answer Generation
                  </span>
                  <span className="text-slate-300 dark:text-zinc-700">→</span>
                  <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    3. 11 LLM Judges
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benchmark Results Inspector */}
      {activeRunDetails && (
        <div className="space-y-6">
          {/* Run Header / Selector */}
          <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-zinc-900/60 rounded-2xl border border-slate-200 dark:border-zinc-800 flex-wrap gap-3">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-zinc-500 uppercase font-mono font-semibold block">Selected Run</span>
              <div className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">
                {activeRunDetails.name}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={activeRunId || ""}
                onChange={(e) => selectRun(e.target.value)}
                className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-zinc-300 font-mono shadow-sm"
              >
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 1: The Top 10 Retrieval Metrics (FR-07) */}
          <div className="double-bezel">
            <div className="double-bezel-inner p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800/80">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    Top 10 Retrieval Quality Metrics (FR-07)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Evaluates candidate ranking against labeled ground-truth passages (0-100%).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { name: "Precision@K", key: "precision_at_k", desc: "Relevant in top-K / K" },
                  { name: "Recall@K", key: "recall_at_k", desc: "Captured gold / Total gold" },
                  { name: "F1@K", key: "f1_at_k", desc: "Harmonic mean P&R" },
                  { name: "Hit Rate@K", key: "hit_rate_at_k", desc: "Queries with >=1 hit" },
                  { name: "MRR", key: "mrr", desc: "Reciprocal rank 1st hit" },
                  { name: "MAP@K", key: "map_at_k", desc: "Mean Average Precision" },
                  { name: "nDCG@K", key: "ndcg_at_k", desc: "Graded logarithmic gain" },
                  { name: "R-Precision", key: "r_precision", desc: "Precision at cutoff R" },
                  { name: "Context Precision", key: "context_precision", desc: "Top-heavy relevance" },
                  { name: "Context Recall", key: "context_recall", desc: "Fact coverage ratio" },
                ].map((m, i) => {
                  const val = retrievalScores[m.key] ?? 0;
                  return (
                    <div
                      key={i}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 space-y-1.5 shadow-sm"
                    >
                      <span className="text-[11px] font-mono font-semibold text-slate-700 dark:text-zinc-300 block truncate" title={m.name}>
                        {m.name}
                      </span>
                      <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">
                        {val}%
                      </div>
                      <span className="text-[9px] text-slate-400 dark:text-zinc-500 block truncate" title={m.desc}>
                        {m.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: LLM-as-a-Judge Evaluation (11 Criteria) */}
          <div className="double-bezel">
            <div className="double-bezel-inner p-6 space-y-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-zinc-800/80">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    LLM-as-a-Judge Evaluation (11 Quality Criteria)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    Normalized 0-100 scale from 5-point discrete rubric: Score_100 = ((Score_1-5 - 1) / 4) * 100.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 block uppercase font-mono font-semibold">
                    Macro Composite Score
                  </span>
                  <span className="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {overallJudge}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { name: "Correctness", key: "correctness" },
                  { name: "Completeness", key: "completeness" },
                  { name: "Faithfulness", key: "faithfulness" },
                  { name: "Groundedness", key: "groundedness" },
                  { name: "Answer Relevance", key: "answer_relevance" },
                  { name: "Citation Correctness", key: "citation_correctness" },
                  { name: "Citation Coverage", key: "citation_coverage" },
                  { name: "Coherence", key: "coherence" },
                  { name: "Conciseness", key: "conciseness" },
                  { name: "Abstention Quality", key: "abstention_quality" },
                  { name: "Safety & Compliance", key: "safety" },
                ].map((crit, idx) => {
                  const val = judgeScores[crit.key] ?? 0;
                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs space-y-1 shadow-sm"
                    >
                      <span className="text-[10px] font-mono text-slate-500 dark:text-zinc-400 block truncate font-medium" title={crit.name}>
                        {crit.name}
                      </span>
                      <div className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                        {val}%
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(5, val))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 3: Per-Query Diagnostics & Failure Filter */}
          <div className="double-bezel">
            <div className="double-bezel-inner p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-zinc-800/80">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500 dark:text-zinc-400" />
                  Query-Level Diagnostics & Failure Root Causes ({filteredQueryResults.length})
                </h3>

                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                  <select
                    value={filterFailureTag}
                    onChange={(e) => setFilterFailureTag(e.target.value)}
                    className="bg-white dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-slate-800 dark:text-zinc-200 shadow-sm"
                  >
                    <option value="all">All Queries</option>
                    <option value="low_retrieval_recall">Low Retrieval Recall</option>
                    <option value="noisy_retrieval">Noisy Retrieval</option>
                    <option value="hallucination_unfaithful">Hallucination / Unfaithful</option>
                    <option value="invalid_citation_hallucination">Invalid Citation</option>
                    <option value="failed_abstention">Failed Abstention</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                {filteredQueryResults.map((q) => (
                  <div
                    key={q.id}
                    className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 text-xs space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{q.query}</span>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        <span className="text-slate-500 dark:text-zinc-400">{q.latency_ms}ms</span>
                      </div>
                    </div>

                    <div className="p-3 bg-white dark:bg-zinc-950/80 rounded-lg border border-slate-200 dark:border-zinc-800/80 font-mono text-[11px] text-slate-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed shadow-sm">
                      {q.generated_answer}
                    </div>

                    {/* Failure Root Cause Badges */}
                    {q.failure_tags && q.failure_tags.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-slate-500 font-mono">Failure Tags:</span>
                        {q.failure_tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-rose-50 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
