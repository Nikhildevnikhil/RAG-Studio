import React, { useEffect, useState } from "react";
import {
  FileText,
  Layers,
  Cpu,
  Activity,
  ArrowUpRight,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronRight,
  TrendingUp,
  Database,
  ShieldCheck,
  Zap,
  BarChart3,
  Bot
} from "lucide-react";
import { api } from "../services/api";

interface DashboardProps {
  onNavigate: (screen: any) => void;
}

export const DashboardScreen: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await api.getDashboard();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const metrics = data?.metrics || {
    total_documents: 0,
    total_indexed_chunks: 0,
    active_pipelines: 0,
    evaluation_runs: 0,
  };

  const benchmarks = data?.retrieval_benchmarks || {};

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      {/* Top Banner / Welcome Hero - High-End Obsidian Command Surface */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-slate-50/60 to-slate-100/90 dark:from-[#141417] dark:via-[#111114] dark:to-[#09090b] p-4 sm:p-6 md:p-8 border border-slate-200/90 dark:border-white/[0.08] shadow-sm dark:shadow-2xl transition-colors duration-200">
        {/* Subtle, refined ambient glow: single gentle micro-cyan ambient illumination instead of muddy blur clouds */}
        <div className="absolute -top-16 -right-16 w-80 h-80 bg-cyan-500/[0.03] rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700/80 text-slate-800 dark:text-zinc-200 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
              RAG Studio Enterprise Intelligence
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Retrieval & Evaluation Command Center
            </h1>
            <p className="text-sm text-slate-600 dark:text-zinc-400 leading-relaxed">
              Synthesize unstructured documentation into vector stores, configure modular hybrid RAG pipelines, and track empirical retrieval accuracy against golden test sets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate("playground")}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold border border-slate-200/90 hover:border-slate-300 shadow-sm dark:bg-zinc-800/90 dark:hover:bg-zinc-700/90 dark:text-white dark:border-zinc-700 transition-all flex items-center gap-2 active:scale-95"
            >
              <Bot className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
              Launch Playground
            </button>
            <button
              onClick={() => onNavigate("documents")}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              Upload Documents
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards (Double-Bezel Hardware aesthetic) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Documents",
            value: metrics.total_documents,
            subtext: "Ingested in Vault",
            icon: FileText,
            color: "text-cyan-600 dark:text-cyan-400",
            bg: "bg-cyan-50 dark:bg-zinc-800/80 border-cyan-200 dark:border-zinc-700/60",
            action: () => onNavigate("documents"),
          },
          {
            label: "Indexed Chunks",
            value: metrics.total_indexed_chunks,
            subtext: "Vector Embeddings",
            icon: Layers,
            color: "text-indigo-600 dark:text-indigo-400",
            bg: "bg-indigo-50 dark:bg-zinc-800/80 border-indigo-200 dark:border-zinc-700/60",
            action: () => onNavigate("documents"),
          },
          {
            label: "Active Pipelines",
            value: metrics.active_pipelines,
            subtext: "Configured Architectures",
            icon: Cpu,
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-zinc-800/80 border-emerald-200 dark:border-zinc-700/60",
            action: () => onNavigate("pipeline-builder"),
          },
          {
            label: "Evaluation Runs",
            value: metrics.evaluation_runs,
            subtext: "Benchmark Suites Executed",
            icon: Activity,
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-zinc-800/80 border-amber-200 dark:border-zinc-700/60",
            action: () => onNavigate("evaluations"),
          },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={card.action}
              className="double-bezel cursor-pointer group transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="double-bezel-inner p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {loading ? "..." : card.value}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {card.subtext}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm ${card.bg} group-hover:scale-110 transition-transform`}
                >
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Retrieval Quality Benchmarks Section */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
                Retrieval Performance Benchmarks (Telemetry Gauges)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Evaluated against gold-standard labeled passages from active evaluation suites.
              </p>
            </div>
            <button
              onClick={() => onNavigate("evaluations")}
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              Run Evaluation Suite <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
            {[
              { label: "Precision@K", key: "precision_at_k", unit: "%" },
              { label: "Recall@K", key: "recall_at_k", unit: "%" },
              { label: "MRR", key: "mrr", unit: "%" },
              { label: "nDCG@K", key: "ndcg_at_k", unit: "%" },
              { label: "Context Precision", key: "context_precision", unit: "%" },
              { label: "Context Recall", key: "context_recall", unit: "%" },
            ].map((metric, idx) => {
              const val = benchmarks[metric.key] ?? 0.0;
              const hasScore = val > 0;
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 hover:border-cyan-400 dark:hover:border-cyan-500/40 hover:bg-white dark:hover:bg-slate-900/90 transition-all shadow-xs"
                >
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block truncate">
                    {metric.label}
                  </span>
                  <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1">
                    {hasScore ? `${val}${metric.unit}` : "Pending"}
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        val >= 75
                          ? "bg-emerald-500"
                          : val >= 50
                          ? "bg-cyan-500"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(8, val))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Two-Column Activity Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Recent Documents
              </h3>
              <button
                onClick={() => onNavigate("documents")}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                View all ({metrics.total_documents})
              </button>
            </div>

            <div className="space-y-2.5">
              {data?.recent_documents && data.recent_documents.length > 0 ? (
                data.recent_documents.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between text-xs hover:border-cyan-400/80 hover:bg-white dark:hover:bg-slate-900/80 transition-all shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-200/80 dark:bg-slate-800 flex items-center justify-center font-mono text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">
                        {doc.file_type}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                          {doc.file_name}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                          {Math.round(doc.file_size / 1024)} KB
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300/80 dark:border-emerald-800/40">
                      {doc.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                  No documents uploaded yet. Head to Document Vault to ingest files.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Evaluation Runs */}
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Recent Evaluation Runs
              </h3>
              <button
                onClick={() => onNavigate("evaluations")}
                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                View all ({metrics.evaluation_runs})
              </button>
            </div>

            <div className="space-y-2.5">
              {data?.recent_runs && data.recent_runs.length > 0 ? (
                data.recent_runs.map((run: any) => {
                  const judgeScore =
                    run.aggregate_scores?.overall_judge_score ?? "—";
                  return (
                    <div
                      key={run.id}
                      className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 flex items-center justify-between text-xs hover:border-indigo-400/80 hover:bg-white dark:hover:bg-slate-900/80 transition-all shadow-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[240px]">
                          {run.name}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 text-[11px] flex items-center gap-2 mt-0.5">
                          <span>{run.total_queries} queries</span>
                          <span>•</span>
                          <span>{run.duration_ms ? `${Math.round(run.duration_ms)}ms` : "In progress"}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">
                          Judge Score
                        </span>
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400 text-xs">
                          {judgeScore !== "—" ? `${judgeScore}%` : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
                  No evaluation benchmarks executed yet. Launch test suite in Evaluation Center.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
