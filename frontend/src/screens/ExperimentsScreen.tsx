import React, { useState, useEffect } from "react";
import {
  GitCompare,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  CheckCircle2,
  Clock,
  Sparkles
} from "lucide-react";
import { api } from "../services/api";
import { EvaluationRun } from "../types";

export const ExperimentsScreen: React.FC = () => {
  const [runs, setRuns] = useState<EvaluationRun[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    try {
      const list = await api.getEvaluationRuns();
      setRuns(list);
      if (list.length >= 2) {
        setSelectedRunIds([list[0].id, list[1].id]);
        compareRuns([list[0].id, list[1].id]);
      } else if (list.length === 1) {
        setSelectedRunIds([list[0].id]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const compareRuns = async (ids: string[]) => {
    if (ids.length < 2) return;
    try {
      setLoading(true);
      const res = await api.compareExperiments(ids);
      setComparison(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRun = (id: string) => {
    let next: string[];
    if (selectedRunIds.includes(id)) {
      next = selectedRunIds.filter((x) => x !== id);
    } else {
      next = [...selectedRunIds, id];
    }
    setSelectedRunIds(next);
    if (next.length >= 2) {
      compareRuns(next);
    } else {
      setComparison(null);
    }
  };

  const expA = comparison?.experiments?.[0];
  const expB = comparison?.experiments?.[1];

  const renderDelta = (valA: number = 0, valB: number = 0, invert = false) => {
    const diff = round(valB - valA, 2);
    if (diff === 0) return <span className="text-slate-400 dark:text-zinc-500 font-mono text-[10px]">0%</span>;
    const isPositive = invert ? diff < 0 : diff > 0;
    return (
      <span
        className={`font-mono text-[10px] font-bold inline-flex items-center gap-0.5 ${
          isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {diff > 0 ? `+${diff}%` : `${diff}%`}
      </span>
    );
  };

  function round(val: number, decimals: number) {
    return Number(Math.round(Number(val + "e" + decimals)) + "e-" + decimals);
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Experiment Comparison & Regression Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Side-by-side differential analysis of 2+ pipeline architectures tested on identical evaluation datasets.
          </p>
        </div>
      </div>

      {/* Select Experiments to Compare */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-mono">
            <span>Select Benchmark Runs to Compare (Select 2+)</span>
            <span className="text-cyan-600 dark:text-cyan-400">{selectedRunIds.length} Selected</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {runs.map((r) => {
              const isChecked = selectedRunIds.includes(r.id);
              const score = r.aggregate_scores?.overall_judge_score ?? "—";
              return (
                <div
                  key={r.id}
                  onClick={() => handleToggleRun(r.id)}
                  className={`p-3 rounded-xl border cursor-pointer text-xs transition-all flex items-center justify-between ${
                    isChecked
                      ? "bg-cyan-50 dark:bg-zinc-800/90 border-cyan-400 dark:border-cyan-500/80 shadow-md shadow-cyan-500/10 text-slate-900 dark:text-white"
                      : "bg-white dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="truncate max-w-[200px]">
                    <span className="font-bold text-slate-900 dark:text-white block truncate">{r.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-zinc-500">{r.total_queries} queries</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold block">{score !== "—" ? `${score}%` : "—"}</span>
                    <span className="text-[9px] uppercase font-mono text-slate-400 dark:text-zinc-500 font-semibold">{isChecked ? "Comparing" : "Select"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Side-by-Side Differential Matrix */}
      {comparison && expA && expB ? (
        <div className="space-y-6">
          {/* Architecture Specs Diff */}
          <div className="double-bezel">
            <div className="double-bezel-inner overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 uppercase font-mono tracking-wider">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Architecture Dimension</th>
                      <th className="py-3 px-4 font-semibold text-cyan-600 dark:text-cyan-400">Baseline (Run A)</th>
                      <th className="py-3 px-4 font-semibold text-indigo-600 dark:text-indigo-400">Candidate (Run B)</th>
                      <th className="py-3 px-4 font-semibold text-right">Delta / Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-zinc-800/60 text-slate-700 dark:text-zinc-300">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Pipeline Name</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expA.pipeline_name}</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expB.pipeline_name}</td>
                      <td className="py-3 px-4 font-mono text-right text-slate-400 dark:text-zinc-500">—</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Chunking Strategy</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expA.chunking_strategy}</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expB.chunking_strategy}</td>
                      <td className="py-3 px-4 font-mono text-right text-slate-500 dark:text-zinc-400">
                        {expA.chunking_strategy === expB.chunking_strategy ? "Identical" : "Variant"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Retrieval Mode</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expA.retrieval_mode}</td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-zinc-300 font-medium">{expB.retrieval_mode}</td>
                      <td className="py-3 px-4 font-mono text-right text-slate-500 dark:text-zinc-400">
                        {expA.retrieval_mode === expB.retrieval_mode ? "Identical" : "Variant"}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">Overall Judge Quality</td>
                      <td className="py-3 px-4 font-mono text-cyan-600 dark:text-cyan-400 font-bold">{expA.overall_judge_score}%</td>
                      <td className="py-3 px-4 font-mono text-indigo-600 dark:text-indigo-400 font-bold">{expB.overall_judge_score}%</td>
                      <td className="py-3 px-4 font-mono text-right font-bold">
                        {renderDelta(expA.overall_judge_score, expB.overall_judge_score)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Metric-by-Metric Differential Table */}
          <div className="double-bezel">
            <div className="double-bezel-inner p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Retrieval & Generation Quality Deltas
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Retrieval Metrics Diff */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-sm">
                  <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 block font-mono uppercase">
                    Retrieval Ranking Metrics
                  </span>
                  {[
                    "precision_at_k",
                    "recall_at_k",
                    "f1_at_k",
                    "hit_rate_at_k",
                    "mrr",
                    "ndcg_at_k",
                  ].map((m) => {
                    const valA = expA.retrieval_metrics?.[m] ?? 0;
                    const valB = expB.retrieval_metrics?.[m] ?? 0;
                    return (
                      <div key={m} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200/60 dark:border-zinc-800/40">
                        <span className="font-mono text-slate-600 dark:text-zinc-400 uppercase text-[11px] font-medium">{m}</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-slate-600 dark:text-zinc-300 font-medium">{valA}%</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
                          <span className="text-slate-900 dark:text-white font-bold">{valB}%</span>
                          {renderDelta(valA, valB)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Judge Criteria Diff */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-3 shadow-sm">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block font-mono uppercase">
                    LLM-as-a-Judge Criteria
                  </span>
                  {[
                    "correctness",
                    "completeness",
                    "faithfulness",
                    "groundedness",
                    "answer_relevance",
                    "citation_correctness",
                  ].map((c) => {
                    const valA = expA.judge_metrics?.[c] ?? 0;
                    const valB = expB.judge_metrics?.[c] ?? 0;
                    return (
                      <div key={c} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-200/60 dark:border-zinc-800/40">
                        <span className="font-mono text-slate-600 dark:text-zinc-400 uppercase text-[11px] font-medium">{c}</span>
                        <div className="flex items-center gap-3 font-mono">
                          <span className="text-slate-600 dark:text-zinc-300 font-medium">{valA}%</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
                          <span className="text-slate-900 dark:text-white font-bold">{valB}%</span>
                          {renderDelta(valA, valB)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-16 text-center text-slate-400 dark:text-zinc-500 text-xs">
          Select at least two evaluation runs above to activate the side-by-side differential regression comparison.
        </div>
      )}
    </div>
  );
};
