import React, { useState, useEffect, useRef } from "react";
import {
  Database,
  Sparkles,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  FileCheck,
  ChevronDown,
  Layers,
  HelpCircle,
  Plus,
  RefreshCw,
  X,
  CheckSquare,
  Square
} from "lucide-react";
import { api, API_BASE } from "../services/api";
import { EvaluationDataset, EvaluationExample } from "../types";

export const DatasetStudioScreen: React.FC = () => {
  const [datasets, setDatasets] = useState<EvaluationDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");
  const [currentDataset, setCurrentDataset] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Deletion state & notifications
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dropdown menu & Batch Delete states
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  // Generator modal states
  const [showGenModal, setShowGenModal] = useState(false);
  const [genName, setGenName] = useState("Handbook Eval Suite v1");
  const [numQuestions, setNumQuestions] = useState(6);
  const [difficulty, setDifficulty] = useState("medium");
  const [includeUnanswerable, setIncludeUnanswerable] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSelectForDelete = (id: string) => {
    setSelectedForDelete((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedForDelete.length === datasets.length) {
      setSelectedForDelete([]);
    } else {
      setSelectedForDelete(datasets.map((d) => d.id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedForDelete.length === 0) return;
    try {
      setBatchDeleting(true);
      await api.batchDeleteDatasets(selectedForDelete);
      showNotification("success", `Successfully deleted ${selectedForDelete.length} dataset(s).`);
      setShowBatchDeleteModal(false);
      setSelectedForDelete([]);
      setDropdownOpen(false);

      const list = await api.getDatasets();
      setDatasets(list);
      if (list.length > 0) {
        setSelectedDatasetId(list[0].id);
        await loadDatasetDetails(list[0].id);
      } else {
        setSelectedDatasetId("");
        setCurrentDataset(null);
      }
    } catch (e: any) {
      console.error(e);
      showNotification("error", e.message || "Failed to batch delete datasets.");
    } finally {
      setBatchDeleting(false);
    }
  };

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const list = await api.getDatasets();
      setDatasets(list);
      if (list.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(list[0].id);
        loadDatasetDetails(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadDatasetDetails = async (id: string) => {
    try {
      const ds = await api.getDataset(id);
      setCurrentDataset(ds);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const res = await api.generateSyntheticDataset({
        name: genName,
        num_questions: numQuestions,
        difficulty,
        include_unanswerable: includeUnanswerable,
      });
      setShowGenModal(false);
      await loadDatasets();
      setSelectedDatasetId(res.dataset_id);
      await loadDatasetDetails(res.dataset_id);
    } catch (e: any) {
      alert(e.message || "Failed to generate dataset.");
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedDatasetId) return;
    try {
      await api.approveDataset(selectedDatasetId);
      await loadDatasetDetails(selectedDatasetId);
      await loadDatasets();
      showNotification("success", "Dataset version approved successfully.");
    } catch (e: any) {
      console.error(e);
      showNotification("error", e.message || "Failed to approve dataset.");
    }
  };

  const handleDeleteDataset = async () => {
    if (!selectedDatasetId || !currentDataset) return;
    try {
      setDeleting(true);
      await api.deleteDataset(selectedDatasetId);
      showNotification("success", `Dataset "${currentDataset.name}" was successfully deleted.`);
      setShowDeleteModal(false);

      const list = await api.getDatasets();
      setDatasets(list);
      if (list.length > 0) {
        setSelectedDatasetId(list[0].id);
        await loadDatasetDetails(list[0].id);
      } else {
        setSelectedDatasetId("");
        setCurrentDataset(null);
      }
    } catch (e: any) {
      console.error(e);
      showNotification("error", e.message || "Failed to delete dataset.");
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = (format: "json" | "csv") => {
    if (!selectedDatasetId) return;
    window.open(`${API_BASE}/datasets/${selectedDatasetId}/export?format=${format}`);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm ${
            notification.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : "bg-rose-50 dark:bg-rose-950/80 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300"
          }`}
        >
          <span>{notification.text}</span>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            Dataset Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Synthesize grounded evaluation questions across archetypes, inspect gold passages, and version test suites.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={() => handleExport("json")}
            disabled={!currentDataset}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-800 flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
          <button
            onClick={() => handleExport("csv")}
            disabled={!currentDataset}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-800 flex items-center gap-1.5 disabled:opacity-50 transition-all shadow-sm active:scale-95"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button
            onClick={() => setShowGenModal(true)}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 flex items-center gap-2 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4" /> Synthesize Dataset
          </button>
        </div>
      </div>

      {/* Dataset Selector & Version Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Database className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-semibold">Active Evaluation Dataset</span>
            <div className="flex items-center gap-2 mt-1 relative" ref={dropdownRef}>
              {datasets.length > 0 ? (
                <>
                  {/* Dropdown trigger button */}
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    className="bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-slate-900 dark:text-white flex items-center justify-between gap-3 w-full sm:w-auto min-w-[200px] sm:min-w-[260px] max-w-full sm:max-w-[360px] transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                    title="Click to view datasets or select multiple for batch deletion"
                  >
                    <span className="truncate text-left font-semibold">
                      {currentDataset?.name
                        ? `${currentDataset.name} (${currentDataset.example_count || currentDataset.examples?.length || 0} questions)`
                        : "Select Evaluation Dataset"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${
                        dropdownOpen ? "rotate-180 text-cyan-600 dark:text-cyan-400" : ""
                      }`}
                    />
                  </button>

                  {/* Dropdown Menu Popup with Checkboxes */}
                  {dropdownOpen && (
                    <div className="absolute left-0 top-full mt-2 w-96 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in divide-y divide-slate-100 dark:divide-slate-800/60">
                      {/* Top Action Bar */}
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/70 flex items-center justify-between gap-2 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-semibold">
                          <input
                            type="checkbox"
                            checked={datasets.length > 0 && selectedForDelete.length === datasets.length}
                            onChange={handleSelectAll}
                            className="w-3.5 h-3.5 rounded border-slate-300 bg-white dark:bg-slate-900 text-cyan-600 accent-cyan-600 cursor-pointer"
                          />
                          <span>
                            {selectedForDelete.length === datasets.length
                              ? "Deselect All"
                              : `Select All (${datasets.length})`}
                          </span>
                        </label>

                        {selectedForDelete.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowBatchDeleteModal(true)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all"
                            title="Delete all selected datasets"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete Selected ({selectedForDelete.length})</span>
                          </button>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-900/80 p-1">
                        {datasets.map((d) => {
                          const isCurrent = d.id === selectedDatasetId;
                          const isChecked = selectedForDelete.includes(d.id);

                          return (
                            <div
                              key={d.id}
                              className={`group flex items-center justify-between gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer ${
                                isCurrent
                                  ? "bg-cyan-50 dark:bg-cyan-950/30 text-slate-900 dark:text-white border border-cyan-200 dark:border-cyan-500/20"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-900/80 text-slate-700 dark:text-slate-300"
                              }`}
                              onClick={() => {
                                setSelectedDatasetId(d.id);
                                loadDatasetDetails(d.id);
                                setDropdownOpen(false);
                              }}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleSelectForDelete(d.id);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 rounded border-slate-300 bg-white dark:bg-slate-900 text-cyan-600 accent-cyan-600 cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-xs truncate">
                                      {d.name}
                                    </span>
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-700/50">
                                        Active
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                                    <span>{d.example_count} questions</span>
                                    <span>•</span>
                                    <span className={d.is_approved ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-amber-600 dark:text-amber-400 font-medium"}>
                                      {d.is_approved ? "Approved" : "Draft"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDatasetId(d.id);
                                  loadDatasetDetails(d.id);
                                  setShowDeleteModal(true);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all shrink-0"
                                title="Delete this dataset"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer Hint */}
                      <div className="p-2 bg-slate-50 dark:bg-slate-950/80 text-[10px] text-slate-500 dark:text-slate-400 font-mono text-center">
                        Select checkboxes to batch delete • Click item to switch active
                      </div>
                    </div>
                  )}

                  {/* Quick single-item delete icon button */}
                  {currentDataset && (
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(true)}
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-950 hover:bg-rose-50 text-slate-500 hover:text-rose-600 dark:hover:bg-rose-950 dark:hover:text-rose-400 border border-slate-300 dark:border-slate-800 transition-colors shadow-sm"
                      title="Delete active dataset"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-500 font-mono italic">
                  No evaluation datasets found.
                </span>
              )}
            </div>
          </div>
        </div>

        {currentDataset && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-mono">
              Status:{" "}
              {currentDataset.is_approved ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                  Draft / Needs Review
                </span>
              )}
            </div>

            {!currentDataset.is_approved && (
              <button
                onClick={handleApprove}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
              >
                <FileCheck className="w-3.5 h-3.5" /> Approve Version
              </button>
            )}

            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 dark:bg-slate-900 dark:hover:bg-rose-950 dark:hover:text-rose-400 border border-slate-300 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm active:scale-95"
              title="Delete dataset"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Dataset
            </button>
          </div>
        )}
      </div>

      {/* Examples Table */}
      <div className="double-bezel">
        <div className="double-bezel-inner overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
              Evaluation Examples ({currentDataset?.examples?.length || 0})
            </h3>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Includes Gold Passage ID & Ground Truth</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-mono tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-semibold">Type</th>
                  <th className="py-3 px-4 font-semibold">Evaluation Question</th>
                  <th className="py-3 px-4 font-semibold">Reference Ground Truth</th>
                  <th className="py-3 px-4 font-semibold">Difficulty</th>
                  <th className="py-3 px-4 font-semibold">Gold Passage ID</th>
                  <th className="py-3 px-4 font-semibold text-right">Answerable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {currentDataset?.examples?.map((ex: EvaluationExample) => (
                  <tr key={ex.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {ex.question_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white max-w-sm">
                      {ex.question}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] max-w-xs truncate">
                      {ex.reference_answer}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400 uppercase text-[10px] font-semibold">
                      {ex.difficulty}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-cyan-700 dark:text-cyan-400 text-[10px] truncate max-w-[120px] font-semibold">
                      {ex.relevant_chunk_ids?.[0] || "None (Unanswerable)"}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          ex.answerable
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/40"
                            : "bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800/40"
                        }`}
                      >
                        {ex.answerable ? "Yes" : "Abstention Test"}
                      </span>
                    </td>
                  </tr>
                ))}
                {(!currentDataset?.examples || currentDataset.examples.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      No evaluation examples in this dataset. Click "Synthesize Dataset" to generate questions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Synthesis Modal */}
      {showGenModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Synthesize Evaluation Dataset
              </h3>
              <button
                onClick={() => setShowGenModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-700 dark:text-slate-300 font-semibold">Dataset Name</label>
                <input
                  type="text"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">Number of Questions</label>
                  <input
                    type="number"
                    min="2"
                    max="30"
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  >
                    <option value="easy">Easy (Direct factual lookup)</option>
                    <option value="medium">Medium (Synthesized conceptual)</option>
                    <option value="hard">Hard (Multi-hop inference)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="unans"
                  checked={includeUnanswerable}
                  onChange={(e) => setIncludeUnanswerable(e.target.checked)}
                  className="accent-cyan-600 rounded cursor-pointer"
                />
                <label htmlFor="unans" className="text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                  Include unanswerable edge cases to test system abstention quality
                </label>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setShowGenModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold disabled:opacity-50 flex items-center gap-2 shadow-md shadow-cyan-500/20 active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {generating ? "Synthesizing Examples..." : "Generate Dataset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && currentDataset && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Evaluation Dataset</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete dataset{" "}
                <span className="font-mono text-slate-900 dark:text-white font-semibold">{currentDataset.name}</span>?
                This will delete all <span className="text-cyan-600 dark:text-cyan-400 font-mono font-medium">{currentDataset.examples?.length || currentDataset.example_count || 0} evaluation question(s)</span> and purge any associated evaluation benchmark runs.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteDataset}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting Dataset...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {showBatchDeleteModal && selectedForDelete.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Batch Delete Datasets</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                Are you sure you want to permanently delete{" "}
                <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{selectedForDelete.length}</span> selected dataset(s)?
                This action is irreversible and will purge all underlying evaluation questions and associated test run benchmark results.
              </p>
              <div className="mt-3 max-h-32 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800/80">
                {datasets
                  .filter((d) => selectedForDelete.includes(d.id))
                  .map((d) => (
                    <div key={d.id} className="text-[11px] text-slate-700 dark:text-zinc-300 flex items-center justify-between font-mono">
                      <span className="truncate">{d.name}</span>
                      <span className="font-mono text-[10px] text-slate-400 dark:text-zinc-500">{d.example_count} questions</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={batchDeleting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {batchDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Deleting ({selectedForDelete.length})...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete {selectedForDelete.length} Dataset(s)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
