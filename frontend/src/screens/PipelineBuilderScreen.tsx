import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  Layers,
  Sparkles,
  Sliders,
  CheckCircle2,
  Database,
  Search,
  MessageSquare,
  Zap,
  Info,
  RefreshCw,
  Trash2,
  Plus,
  AlertTriangle,
  Copy,
  Edit3,
  X,
  ArrowRight,
  ArrowLeft
} from "lucide-react";
import { api } from "../services/api";
import { ChunkStats, PipelineConfig } from "../types";

export const PipelineBuilderScreen: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [embeddingCatalog, setEmbeddingCatalog] = useState<any[]>([]);
  const [generationCatalog, setGenerationCatalog] = useState<any[]>([]);

  // Wizard state & refs
  const builderSectionRef = useRef<HTMLDivElement>(null);
  const [highlightCreation, setHighlightCreation] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [name, setName] = useState("Production Semantic Pipeline");
  const [description, setDescription] = useState("Configured for precision technical search");
  
  // 1. Chunking
  const [chunkingStrategy, setChunkingStrategy] = useState("recursive_character");
  const [chunkSize, setChunkSize] = useState(500);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [separators, setSeparators] = useState("\\n\\n,\\n, ,");
  const [chunkStats, setChunkStats] = useState<ChunkStats | null>(null);
  const [previewingChunks, setPreviewingChunks] = useState(false);

  // 2. Embedding
  const [embeddingModel, setEmbeddingModel] = useState("BAAI/bge-small-en-v1.5");
  const [embeddingDimension, setEmbeddingDimension] = useState(384);
  const [onlyAvailableModels, setOnlyAvailableModels] = useState(true);

  // 3. Vector DB & Retrieval
  const [vectorStore, setVectorStore] = useState("chroma");
  const [retrievalMode, setRetrievalMode] = useState("dense");
  const [topK, setTopK] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.0);
  const [mmrDiversity, setMmrDiversity] = useState(0.5);

  // 4. Generation
  const [generationModel, setGenerationModel] = useState("HuggingFaceH4/zephyr-7b-beta");
  const [temperature, setTemperature] = useState(0.2);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are an expert RAG research assistant. Answer questions using only the provided retrieved contexts and format all factual statements with source citations [1], [2], etc."
  );

  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Creation / Naming Prompt Modal state
  const [namePromptOpen, setNamePromptOpen] = useState(false);
  const [pendingSaveAsNew, setPendingSaveAsNew] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [pipelineToRename, setPipelineToRename] = useState<PipelineConfig | null>(null);
  const [promptName, setPromptName] = useState("");
  const [promptDescription, setPromptDescription] = useState("");
  const [promptError, setPromptError] = useState("");

  // Deletion modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pipelineToDelete, setPipelineToDelete] = useState<PipelineConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadMetadata();
  }, []);

  const selectPipeline = (pipe: PipelineConfig | null) => {
    if (pipe) {
      setSelectedPipelineId(pipe.id);
      setName(pipe.name || "");
      setDescription(pipe.description || "");
      setChunkingStrategy(pipe.chunking_strategy || "recursive_character");
      setChunkSize(pipe.chunk_size || 500);
      setChunkOverlap(pipe.chunk_overlap || 50);
      setSeparators(pipe.separators || "\\n\\n,\\n, ,");
      setEmbeddingModel(pipe.embedding_model || "BAAI/bge-small-en-v1.5");
      setEmbeddingDimension(pipe.embedding_dimension || 384);
      setVectorStore(pipe.vector_store || "chroma");
      setRetrievalMode(pipe.retrieval_mode || "dense");
      setTopK(pipe.top_k || 5);
      setSimilarityThreshold(pipe.similarity_threshold || 0.0);
      setMmrDiversity(pipe.mmr_diversity || 0.5);
      setGenerationModel(pipe.generation_model || "HuggingFaceH4/zephyr-7b-beta");
      setTemperature(pipe.temperature !== undefined ? pipe.temperature : 0.2);
      setSystemPrompt(
        pipe.system_prompt ||
          "You are an expert RAG research assistant. Answer questions using only the provided retrieved contexts and format all factual statements with source citations [1], [2], etc."
      );
    } else {
      setSelectedPipelineId(null);
      setName("Custom Architecture " + (pipelines.length + 1));
      setDescription("Newly configured semantic retrieval pipeline");
      setChunkingStrategy("recursive_character");
      setChunkSize(500);
      setChunkOverlap(50);
      setSeparators("\\n\\n,\\n, ,");
      setEmbeddingModel("BAAI/bge-small-en-v1.5");
      setEmbeddingDimension(384);
      setVectorStore("chroma");
      setRetrievalMode("dense");
      setTopK(5);
      setSimilarityThreshold(0.0);
      setMmrDiversity(0.5);
      setGenerationModel("HuggingFaceH4/zephyr-7b-beta");
      setTemperature(0.2);
    }
    setSuccessMsg("");
    setErrorMsg("");
  };

  const handleStartNewPipeline = () => {
    selectPipeline(null);
    setActiveStep(1);
    setHighlightCreation(true);
    setTimeout(() => {
      builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    setTimeout(() => {
      setHighlightCreation(false);
    }, 3500);
  };

  const loadMetadata = async (preferredId?: string) => {
    try {
      const [embeds, gens, pipes] = await Promise.all([
        api.getEmbeddingModels(false),
        api.getGenerationModels(false),
        api.getPipelines(),
      ]);
      setEmbeddingCatalog(embeds || []);
      setGenerationCatalog(gens || []);
      setPipelines(pipes || []);

      if (pipes.length > 0) {
        const target = preferredId
          ? pipes.find((p: PipelineConfig) => p.id === preferredId) || pipes[0]
          : pipes[0];
        selectPipeline(target);
      } else {
        selectPipeline(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePreviewChunks = async () => {
    try {
      setPreviewingChunks(true);
      const res = await api.previewChunks({
        chunking_strategy: chunkingStrategy,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        separators,
      });
      setChunkStats(res);
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewingChunks(false);
    }
  };

  const openCreatePromptModal = (asNew: boolean = false) => {
    setIsRenaming(false);
    setPipelineToRename(null);
    setPendingSaveAsNew(asNew);
    if (asNew && selectedPipelineId) {
      setPromptName(name ? `${name} (Copy)` : "New Pipeline Copy");
      setPromptDescription(description || "");
    } else {
      setPromptName("");
      setPromptDescription("");
    }
    setPromptError("");
    setNamePromptOpen(true);
  };

  const openRenameModal = (pipe?: PipelineConfig, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = pipe || activePipelineObj || null;
    setPipelineToRename(target);
    setIsRenaming(true);
    setPendingSaveAsNew(false);
    setPromptName(target?.name || name || "");
    setPromptDescription(target?.description || description || "");
    setPromptError("");
    setNamePromptOpen(true);
  };

  const handleConfirmPromptSave = async () => {
    const trimmed = promptName.trim();
    if (!trimmed) {
      setPromptError("Pipeline name cannot be empty. Please enter a valid name.");
      return;
    }

    setPromptError("");
    setSaving(true);

    try {
      const selectedEmbed = embeddingCatalog.find((m) => m.model_id === embeddingModel);
      const selectedGen = generationCatalog.find((g) => g.model_id === generationModel);

      const payload = {
        name: trimmed,
        description: promptDescription.trim(),
        chunking_strategy: chunkingStrategy,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        separators,
        embedding_provider: selectedEmbed?.provider || "huggingface",
        embedding_model: embeddingModel,
        embedding_dimension: embeddingDimension,
        vector_store: vectorStore,
        retrieval_mode: retrievalMode,
        top_k: topK,
        similarity_threshold: similarityThreshold,
        mmr_diversity: mmrDiversity,
        generation_provider: selectedGen?.provider || "huggingface",
        generation_model: generationModel,
        system_prompt: systemPrompt,
        temperature,
      };

      if (isRenaming) {
        const targetId = pipelineToRename?.id || selectedPipelineId;
        if (!targetId) return;
        const updated = await api.updatePipeline(targetId, {
          name: trimmed,
          description: promptDescription.trim(),
        });
        if (selectedPipelineId === targetId) {
          setName(updated.name);
          setDescription(updated.description);
        }
        setSuccessMsg(`Pipeline renamed to "${updated.name}" successfully!`);
        setNamePromptOpen(false);
        await loadMetadata(targetId);
      } else {
        const created = await api.createPipeline(payload);
        setNamePromptOpen(false);
        setSuccessMsg(`Pipeline "${created.name}" created and indexed successfully!`);
        await loadMetadata(created.id);
      }
    } catch (e: any) {
      console.error(e);
      setPromptError(e.message || "Failed to process pipeline.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateExistingPipeline = async () => {
    if (!selectedPipelineId) return;
    try {
      setSaving(true);
      setErrorMsg("");
      setSuccessMsg("");

      const selectedEmbed = embeddingCatalog.find((m) => m.model_id === embeddingModel);
      const selectedGen = generationCatalog.find((g) => g.model_id === generationModel);

      const payload = {
        name,
        description,
        chunking_strategy: chunkingStrategy,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        separators,
        embedding_provider: selectedEmbed?.provider || "huggingface",
        embedding_model: embeddingModel,
        embedding_dimension: embeddingDimension,
        vector_store: vectorStore,
        retrieval_mode: retrievalMode,
        top_k: topK,
        similarity_threshold: similarityThreshold,
        mmr_diversity: mmrDiversity,
        generation_provider: selectedGen?.provider || "huggingface",
        generation_model: generationModel,
        system_prompt: systemPrompt,
        temperature,
      };

      const updated = await api.updatePipeline(selectedPipelineId, payload);
      await api.reindexPipeline(updated.id);
      setSuccessMsg(`Pipeline "${updated.name}" updated and re-indexed successfully!`);
      await loadMetadata(updated.id);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to update pipeline.");
    } finally {
      setSaving(false);
    }
  };

  const requestDeletePipeline = (pipe: PipelineConfig, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPipelineToDelete(pipe);
    setDeleteModalOpen(true);
  };

  const confirmDeletePipeline = async () => {
    if (!pipelineToDelete) return;
    try {
      setDeleting(true);
      await api.deletePipeline(pipelineToDelete.id);
      setSuccessMsg(`Pipeline "${pipelineToDelete.name}" was successfully deleted.`);
      setDeleteModalOpen(false);

      const updatedPipes = await api.getPipelines();
      setPipelines(updatedPipes);

      if (selectedPipelineId === pipelineToDelete.id) {
        if (updatedPipes.length > 0) {
          selectPipeline(updatedPipes[0]);
        } else {
          selectPipeline(null);
        }
      }
      setPipelineToDelete(null);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to delete pipeline.");
    } finally {
      setDeleting(false);
    }
  };

  const activePipelineObj = pipelines.find((p) => p.id === selectedPipelineId);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            RAG Pipeline Architect
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure chunking strategies, embeddings, vector stores, and generation models.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {successMsg && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-400 text-xs font-semibold shadow-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/40 text-rose-800 dark:text-rose-300 text-xs font-semibold shadow-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. Saved Pipelines Selector / Management Bar */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-950/70 border border-cyan-300 dark:border-cyan-800/40 flex items-center justify-center text-cyan-700 dark:text-cyan-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                  Configured Pipelines ({pipelines.length})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Select a pipeline to inspect or tune parameters, or architect a brand new pipeline.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleStartNewPipeline}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 active:scale-95 ${
                  selectedPipelineId === null
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/20 ring-2 ring-cyan-500/40"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-cyan-400 border border-slate-200 dark:border-slate-800"
                }`}
                title="Start building a new pipeline"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Pipeline</span>
              </button>
            </div>
          </div>

          {/* Pipelines Grid */}
          {pipelines.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pipelines.map((pipe) => {
                const isSelected = selectedPipelineId === pipe.id;
                return (
                  <div
                    key={pipe.id}
                    onClick={() => selectPipeline(pipe)}
                    className={`group relative p-3.5 rounded-xl border text-xs cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-500/80 shadow-md shadow-cyan-500/10 text-slate-900 dark:text-white"
                        : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white truncate text-xs block">
                            {pipe.name}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-700/50">
                              Active
                            </span>
                          )}
                        </div>
                        {pipe.description && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                            {pipe.description}
                          </p>
                        )}
                      </div>

                      {/* Action buttons: Rename & Delete */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => openRenameModal(pipe, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors"
                          title={`Rename pipeline "${pipe.name}"`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => requestDeletePipeline(pipe, e)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title={`Delete pipeline "${pipe.name}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-200 dark:border-slate-800/60 text-[10px] text-slate-500 dark:text-slate-500 font-mono">
                      <span className="truncate max-w-[120px]">{pipe.chunking_strategy}</span>
                      <span>•</span>
                      <span className="truncate max-w-[110px]">{pipe.embedding_model.split("/").pop()}</span>
                      <span>•</span>
                      <span>k={pipe.top_k}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs flex flex-col items-center gap-3">
              <span>No saved pipelines yet. Configure parameters below and create your first pipeline!</span>
              <button
                type="button"
                onClick={handleStartNewPipeline}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start Creating Pipeline</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. Pipeline Creation / Configuration Workspace */}
      <div ref={builderSectionRef} className="scroll-mt-20 space-y-4">
        {/* Creation / Active Pipeline Context Banner */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-300 ${
            selectedPipelineId === null
              ? "bg-cyan-50/90 dark:bg-cyan-950/30 border-cyan-300 dark:border-cyan-700/60 shadow-lg shadow-cyan-500/5"
              : "bg-slate-100/90 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800"
          } ${
            highlightCreation
              ? "ring-2 ring-cyan-500 ring-offset-2 dark:ring-offset-[#09090b] shadow-xl shadow-cyan-500/20"
              : ""
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-600 dark:bg-cyan-500 text-white dark:text-slate-950 flex items-center justify-center font-bold shadow-md shadow-cyan-600/30 shrink-0">
                {selectedPipelineId === null ? <Sparkles className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 dark:bg-cyan-900/80 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-700">
                    {selectedPipelineId === null ? "Architecting New Pipeline" : "Configuring Pipeline"}
                  </span>
                  {selectedPipelineId === null && (
                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 animate-pulse">
                      <span>👇 Pipeline creation starts here</span>
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-2">
                  <span>{selectedPipelineId ? name || activePipelineObj?.name : (name || "Custom Architecture " + (pipelines.length + 1))}</span>
                  <button
                    type="button"
                    onClick={() => openRenameModal()}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    title="Change pipeline name"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Step {activeStep} of 5:
              </span>
              <span className="font-bold text-cyan-700 dark:text-cyan-400">
                {activeStep === 1 && "1. Chunking"}
                {activeStep === 2 && "2. Embeddings"}
                {activeStep === 3 && "3. Vector Index"}
                {activeStep === 4 && "4. Retrieval Mode"}
                {activeStep === 5 && "5. Generator LLM"}
              </span>
            </div>
          </div>
        </div>

        {/* Step Tabs */}
        <div className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-5 gap-1.5 sm:gap-2 border-b border-slate-200 dark:border-slate-800/80 pb-3 sm:pb-4">
        {[
          { step: 1, label: "1. Chunking" },
          { step: 2, label: "2. Embeddings" },
          { step: 3, label: "3. Vector Index" },
          { step: 4, label: "4. Retrieval Mode" },
          { step: 5, label: "5. Generator LLM" },
        ].map((s) => (
          <button
            key={s.step}
            onClick={() => setActiveStep(s.step)}
            className={`py-2 px-3 text-xs font-semibold rounded-xl text-left whitespace-nowrap sm:whitespace-normal shrink-0 transition-all ${
              activeStep === s.step
                ? "bg-slate-100 dark:bg-slate-800 text-cyan-700 dark:text-cyan-400 border border-slate-300 dark:border-slate-700/80 shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>

      {/* Step 1: Chunking */}
      {activeStep === 1 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="double-bezel">
              <div className="double-bezel-inner p-4 sm:p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Chunking Configuration (6 Strategies)
                </h3>

                <div className="space-y-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Strategy</label>
                  <select
                    value={chunkingStrategy}
                    onChange={(e) => setChunkingStrategy(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  >
                    <option value="recursive_character">Recursive Character (Separators hierarchy)</option>
                    <option value="fixed_size">Fixed-Size Character Window</option>
                    <option value="token_based">Token-Based (Tokenizer approximation)</option>
                    <option value="sentence_based">Sentence-Based (Grammatical grouping)</option>
                    <option value="paragraph_based">Paragraph-Based (Boundary preservation)</option>
                    <option value="markdown_aware">Markdown-Aware (Header & table preservation)</option>
                    <option value="semantic">Semantic Chunking (Embedding similarity shifts)</option>
                    <option value="parent_child">Parent-Child Chunking (Hierarchical context)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                      Chunk Size: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{chunkSize} chars</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="50"
                      value={chunkSize}
                      onChange={(e) => setChunkSize(Number(e.target.value))}
                      className="w-full accent-cyan-600 dark:accent-cyan-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                      Overlap: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{chunkOverlap} chars</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={chunkSize / 2}
                      step="10"
                      value={chunkOverlap}
                      onChange={(e) => setChunkOverlap(Number(e.target.value))}
                      className="w-full accent-cyan-600 dark:accent-cyan-400"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Hierarchy Separators</label>
                  <input
                    type="text"
                    value={separators}
                    onChange={(e) => setSeparators(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 font-mono shadow-sm"
                  />
                  <p className="text-[11px] text-slate-500">Comma-separated separator hierarchy.</p>
                </div>

                <button
                  onClick={handlePreviewChunks}
                  disabled={previewingChunks}
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-cyan-700 dark:text-cyan-400 text-xs font-semibold border border-slate-300 dark:border-slate-700/80 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${previewingChunks ? "animate-spin" : ""}`} />
                  {previewingChunks ? "Analyzing Chunks..." : "Generate Live Chunk Preview"}
                </button>
              </div>
            </div>

            {/* Chunk Preview Telemetry */}
            <div className="double-bezel">
              <div className="double-bezel-inner p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Chunk Distribution Telemetry
                </h3>

                {chunkStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Total Chunks</span>
                        <span className="font-mono text-lg font-bold text-slate-900 dark:text-white">{chunkStats.total_chunks}</span>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Avg Length</span>
                        <span className="font-mono text-lg font-bold text-cyan-600 dark:text-cyan-400">{chunkStats.avg_length} ch</span>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800">
                        <span className="text-[10px] text-slate-500 block uppercase font-medium">Est. Tokens</span>
                        <span className="font-mono text-lg font-bold text-indigo-600 dark:text-indigo-400">{chunkStats.estimated_tokens}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-semibold block">Sample Chunk #1:</span>
                      <div className="p-3 bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-800 dark:text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                        {chunkStats.sample_chunks[0]?.content || "No chunks generated."}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                    Click "Generate Live Chunk Preview" to simulate splitting across vault documents.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step 1 Footer Navigation */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Step 1 of 5: Document chunking configured
            </span>
            <button
              type="button"
              onClick={() => {
                setActiveStep(2);
                builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <span>Next: Embedding Model</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Embeddings */}
      {activeStep === 2 && (
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800/80">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Select Embedding Model
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose a model to generate dense semantic vector representations for document passages.
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 select-none transition-colors">
                <input
                  type="checkbox"
                  checked={onlyAvailableModels}
                  onChange={(e) => setOnlyAvailableModels(e.target.checked)}
                  className="rounded accent-cyan-600 dark:accent-cyan-400"
                />
                <span className="flex items-center gap-1.5 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Show only models available right now
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {embeddingCatalog
                .filter((m) => !onlyAvailableModels || Boolean(m.is_available))
                .map((m) => {
                  const isSelected = embeddingModel === m.model_id;
                  const isAvail = Boolean(m.is_available);
                  return (
                    <div
                      key={m.model_id}
                      onClick={() => {
                        if (!isAvail) return;
                        setEmbeddingModel(m.model_id);
                        setEmbeddingDimension(m.dimension);
                      }}
                      className={`p-4 rounded-xl border transition-all ${
                        !isAvail
                          ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-zinc-900"
                          : isSelected
                          ? "bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-500/80 shadow-md shadow-cyan-500/10 cursor-pointer"
                          : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">{m.name}</span>
                        <div className="flex items-center gap-1.5">
                          {isAvail ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/40 flex items-center gap-1 font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Ready to use
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800">
                              API Key Required
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3">{m.description}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>Dim: {m.dimension}</span>
                        <span>Max: {m.max_tokens} toks</span>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Step 2 Footer Navigation */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(1);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back: Chunking</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(3);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <span>Next: Vector Index</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Vector Store */}
      {activeStep === 3 && (
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-4">
            <div className="pb-2 border-b border-slate-200 dark:border-slate-800/80">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Vector Database Engine
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Chroma DB is active and ready on disk. In-memory index is also available with zero dependencies.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  id: "chroma",
                  name: "Chroma DB (Persistent)",
                  desc: "Embedded vector database with on-disk collection persistence and metadata filtering.",
                  badge: "Ready & Active",
                  isReady: true,
                },
                {
                  id: "memory",
                  name: "In-Memory NumPy Index",
                  desc: "Zero external dependencies. Blazing fast vector cosine execution.",
                  badge: "Ready & Active",
                  isReady: true,
                },
                {
                  id: "pgvector",
                  name: "PostgreSQL pgvector",
                  desc: "Relational persistence with HNSW and IVFFlat index support.",
                  badge: "Server Required",
                  isReady: false,
                },
                {
                  id: "qdrant",
                  name: "Qdrant Vector DB",
                  desc: "Rust-native vector database for massive scale similarity search.",
                  badge: "Server Required",
                  isReady: false,
                },
              ]
                .filter((v) => !onlyAvailableModels || v.isReady)
                .map((v) => (
                  <div
                    key={v.id}
                    onClick={() => {
                      if (v.isReady) setVectorStore(v.id);
                    }}
                    className={`p-4 rounded-xl border transition-all ${
                      !v.isReady
                        ? "opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-zinc-900"
                        : vectorStore === v.id
                        ? "bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-500/80 shadow-md shadow-cyan-500/10 cursor-pointer"
                        : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{v.name}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          v.isReady
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/40"
                            : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {v.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{v.desc}</p>
                  </div>
                ))}
            </div>

            {/* Step 3 Footer Navigation */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(2);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back: Embeddings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(4);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <span>Next: Retrieval Mode</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Retrieval */}
      {activeStep === 4 && (
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Retrieval & Ranking Strategy
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: "dense", name: "Dense Cosine Similarity", desc: "Standard high-dimensional embedding distance." },
                { id: "mmr", name: "Maximal Marginal Relevance (MMR)", desc: "Balances relevance and passage diversity." },
                { id: "hybrid", name: "Hybrid (Dense + Keyword BM25)", desc: "Combined lexical and semantic score weighting." },
              ].map((r) => (
                <div
                  key={r.id}
                  onClick={() => setRetrievalMode(r.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    retrievalMode === r.id
                      ? "bg-cyan-50/70 dark:bg-slate-800/90 border-cyan-500/80 shadow-md shadow-cyan-500/10"
                      : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  <span className="font-bold text-slate-900 dark:text-white text-xs block mb-1">{r.name}</span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">{r.desc}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="space-y-2">
                <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                  Top-K Retrieved Passages: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{topK}</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(Number(e.target.value))}
                  className="w-full accent-cyan-600 dark:accent-cyan-400"
                />
              </div>

              {retrievalMode === "mmr" && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                    MMR Diversity Lambda (λ): <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{mmrDiversity}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={mmrDiversity}
                    onChange={(e) => setMmrDiversity(Number(e.target.value))}
                    className="w-full accent-cyan-600 dark:accent-cyan-400"
                  />
                  <p className="text-[11px] text-slate-500">
                    Higher λ prioritizes relevance; lower λ maximizes topic diversity.
                  </p>
                </div>
              )}
            </div>

            {/* Step 4 Footer Navigation */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(3);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back: Vector Index</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveStep(5);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all active:scale-95"
              >
                <span>Next: Generator LLM</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Generation */}
      {activeStep === 5 && (
        <div className="double-bezel">
          <div className="double-bezel-inner p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Generation Model & Citation Rubric
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Generation LLM</label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Ready to use
                    </span>
                  </div>
                  <select
                    value={generationModel}
                    onChange={(e) => setGenerationModel(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white shadow-sm"
                  >
                    {generationCatalog
                      .filter((g) => !onlyAvailableModels || Boolean(g.is_available))
                      .map((g) => (
                        <option key={g.model_id} value={g.model_id}>
                          {g.name} {Boolean(g.is_available) ? "● [Ready to use]" : "[Key required]"}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">
                    Temperature: <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{temperature}</span>
                  </label>
                  <input
                    type="range"
                    min="0.0"
                    max="1.0"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-cyan-600 dark:accent-cyan-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Citation System Instructions</label>
                <textarea
                  rows={5}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-200 font-mono leading-relaxed shadow-sm"
                />
              </div>
            </div>

            {/* Step 5 Footer Navigation */}
            <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveStep(4);
                  builderSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back: Retrieval Mode</span>
              </button>
              <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                <span>All 5 steps configured</span>
                <span className="text-slate-400">•</span>
                <span>Review & save below ↓</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commit, Save & Delete Controls */}
      <div className="p-5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
            {selectedPipelineId
              ? `Pipeline: "${name || activePipelineObj?.name || "Active Architecture"}"`
              : "Save & Build New Pipeline"}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {selectedPipelineId
              ? "Update active parameters, rename architecture, or duplicate as a new version."
              : "Review architecture settings then create and build vector embeddings across documents."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedPipelineId && (
            <>
              {/* Option to Delete the pipeline */}
              <button
                onClick={() => {
                  const p = pipelines.find((x) => x.id === selectedPipelineId);
                  if (p) requestDeletePipeline(p);
                }}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-400 text-xs font-semibold transition-all flex items-center gap-2 active:scale-95"
                title="Delete this pipeline architecture"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Pipeline</span>
              </button>

              {/* Option to Save as a new copy */}
              <button
                onClick={() => openCreatePromptModal(true)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold border border-slate-300 dark:border-slate-700/80 transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                title="Save current parameters as a new pipeline"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Save as New Copy</span>
              </button>
            </>
          )}

          {/* Primary Save / Update Button */}
          <button
            onClick={() => {
              if (selectedPipelineId) {
                handleUpdateExistingPipeline();
              } else {
                openCreatePromptModal(false);
              }
            }}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
          >
            <Zap className="w-4 h-4" />
            {saving
              ? "Re-indexing Documents..."
              : selectedPipelineId
              ? "Update Pipeline & Re-index"
              : "Save & Build Index"}
          </button>
        </div>
      </div>

      {/* Prompt to Give Pipeline Name Modal */}
      {namePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/80 border border-cyan-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isRenaming
                      ? `Rename "${pipelineToRename?.name || name || "Pipeline"}"`
                      : pendingSaveAsNew
                      ? "Save as New Pipeline Copy"
                      : "Name Your Pipeline"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isRenaming
                      ? "Update title and notes for this architecture"
                      : "Give your pipeline architecture a name to proceed"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setNamePromptOpen(false);
                  setPipelineToRename(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Input fields */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                  <span>Pipeline Name</span>
                  <span className="text-cyan-600 dark:text-cyan-400 font-mono text-[10px]">* Required</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={promptName}
                  onChange={(e) => {
                    setPromptName(e.target.value);
                    if (promptError) setPromptError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmPromptSave();
                  }}
                  placeholder="e.g., Production Semantic Hybrid v2"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 font-medium transition-all shadow-sm"
                />
                {promptError && (
                  <span className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1 mt-1 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {promptError}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Description & Notes (Optional)
                </label>
                <input
                  type="text"
                  value={promptDescription}
                  onChange={(e) => setPromptDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleConfirmPromptSave();
                  }}
                  placeholder="e.g., Optimized for dense technical doc retrieval"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all shadow-sm"
                />
              </div>

              {/* Configuration Summary Pill Preview */}
              {!isRenaming && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-slate-500 block font-semibold">
                    Architecture Summary
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {chunkingStrategy} ({chunkSize}c / {chunkOverlap}o)
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-50 dark:bg-slate-800 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800/40">
                      {embeddingModel.split("/").pop()}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-slate-800 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                      {vectorStore} ({retrievalMode}, k={topK})
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setNamePromptOpen(false);
                  setPipelineToRename(null);
                }}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white text-xs font-semibold border border-slate-200 dark:border-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPromptSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95"
              >
                <Zap className="w-3.5 h-3.5" />
                {saving
                  ? "Saving & Building..."
                  : isRenaming
                  ? "Save Name"
                  : "Create & Build Index"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Pipeline Confirmation Modal */}
      {deleteModalOpen && pipelineToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Pipeline Architecture
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to permanently delete{" "}
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">
                    "{pipelineToDelete.name}"
                  </span>
                  ?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <span className="text-rose-600 dark:text-rose-400 font-bold block mb-0.5">Warning:</span>
              This will delete the pipeline configuration and all its associated evaluation benchmark runs and scores. This operation cannot be undone.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setPipelineToDelete(null);
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-200 dark:border-slate-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePipeline}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all flex items-center gap-2 shadow-md shadow-rose-600/30 disabled:opacity-50 active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? "Deleting Pipeline..." : "Delete Pipeline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
