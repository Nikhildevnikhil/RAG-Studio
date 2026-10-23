import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Sparkles,
  Bot,
  User,
  ExternalLink,
  Layers,
  Clock,
  Zap,
  Info,
  CheckCircle2,
  AlertCircle,
  Copy,
  ChevronRight,
  Plus,
  Trash2,
  MessageSquarePlus,
  SquarePen,
  RotateCcw,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  History,
  MessageSquare,
  Search,
  ChevronDown,
  X
} from "lucide-react";
import { api } from "../services/api";
import { ChatMessage, PipelineConfig, RetrievedChunk, Citation, ChatConversation } from "../types";

export const PlaygroundScreen: React.FC = () => {
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // History Drawer state (responsive: closed by default on < 1024px)
  const [historyOpen, setHistoryOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  const [historySearch, setHistorySearch] = useState("");
  const [targetDeleteConvId, setTargetDeleteConvId] = useState<string | null>(null);

  // Evidence Inspector drawer state (responsive: closed by default on < 1280px)
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1280);

  // Model override state
  const [genModels, setGenModels] = useState<any[]>([]);
  const [selectedGenModelKey, setSelectedGenModelKey] = useState<string>("auto");

  // Inspector states
  const [activeRetrievedChunks, setActiveRetrievedChunks] = useState<RetrievedChunk[]>([]);
  const [activeCitations, setActiveCitations] = useState<Citation[]>([]);
  const [activeRunMetadata, setActiveRunMetadata] = useState<any>(null);
  const [highlightedChunkId, setHighlightedChunkId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [pipes, convs, models] = await Promise.all([
        api.getPipelines(),
        api.getConversations(),
        api.getGenerationModels(true).catch(() => []),
      ]);
      setPipelines(pipes);
      setGenModels(models || []);
      if (pipes.length > 0) {
        setSelectedPipelineId(pipes[0].id);
      }
      setConversations(convs);
      if (convs.length > 0) {
        const firstConvId = convs[0].conversation_id;
        setCurrentConversationId(firstConvId);
        const history = await api.getChatHistory(firstConvId);
        setMessages(history);
        const lastAsst = [...history].reverse().find((m) => m.role === "assistant");
        if (lastAsst) {
          setActiveRetrievedChunks(lastAsst.retrieved_chunks || []);
          setActiveCitations(lastAsst.citations || []);
          setActiveRunMetadata(lastAsst.run_metadata || null);
        }
      } else {
        handleNewChat();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleNewChat = () => {
    const newConvId = "conv-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7);
    setCurrentConversationId(newConvId);
    setMessages([]);
    setActiveRetrievedChunks([]);
    setActiveCitations([]);
    setActiveRunMetadata(null);
    setHighlightedChunkId(null);
    setInputQuery("");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setHistoryOpen(false);
    }
    inputRef.current?.focus();
  };

  const handleSelectConversation = async (convId: string) => {
    if (!convId || convId === "new") {
      handleNewChat();
      return;
    }
    setCurrentConversationId(convId);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setHistoryOpen(false);
    }
    setLoading(true);
    try {
      const history = await api.getChatHistory(convId);
      setMessages(history);
      const lastAsst = [...history].reverse().find((m) => m.role === "assistant");
      if (lastAsst) {
        setActiveRetrievedChunks(lastAsst.retrieved_chunks || []);
        setActiveCitations(lastAsst.citations || []);
        setActiveRunMetadata(lastAsst.run_metadata || null);
      } else {
        setActiveRetrievedChunks([]);
        setActiveCitations([]);
        setActiveRunMetadata(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingConv, setDeletingConv] = useState(false);

  // Pipeline deletion state in Playground
  const [showDeletePipelineModal, setShowDeletePipelineModal] = useState(false);
  const [deletingPipeline, setDeletingPipeline] = useState(false);

  // Pipeline multi-select & batch deletion state
  const [pipelineDropdownOpen, setPipelineDropdownOpen] = useState(false);
  const [selectedPipelinesForDelete, setSelectedPipelinesForDelete] = useState<string[]>([]);
  const [showBatchDeletePipelineModal, setShowBatchDeletePipelineModal] = useState(false);
  const [batchDeletingPipelines, setBatchDeletingPipelines] = useState(false);
  const pipelineDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pipelineDropdownRef.current && !pipelineDropdownRef.current.contains(event.target as Node)) {
        setPipelineDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSelectPipelineForDelete = (id: string) => {
    setSelectedPipelinesForDelete((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPipelines = () => {
    if (selectedPipelinesForDelete.length === pipelines.length) {
      setSelectedPipelinesForDelete([]);
    } else {
      setSelectedPipelinesForDelete(pipelines.map((p) => p.id));
    }
  };

  const executeBatchDeletePipelines = async () => {
    if (selectedPipelinesForDelete.length === 0) return;
    try {
      setBatchDeletingPipelines(true);
      await api.batchDeletePipelines(selectedPipelinesForDelete);
      const updatedPipes = await api.getPipelines();
      setPipelines(updatedPipes);
      setShowBatchDeletePipelineModal(false);
      setSelectedPipelinesForDelete([]);
      setPipelineDropdownOpen(false);
      if (updatedPipes.length > 0) {
        setSelectedPipelineId(updatedPipes[0].id);
      } else {
        setSelectedPipelineId("");
      }
    } catch (err: any) {
      console.error("Failed to batch delete pipelines:", err);
      alert(err.message || "Failed to batch delete pipelines.");
    } finally {
      setBatchDeletingPipelines(false);
    }
  };

  const executeDeletePipeline = async () => {
    if (!selectedPipelineId) return;
    try {
      setDeletingPipeline(true);
      await api.deletePipeline(selectedPipelineId);
      const updatedPipes = await api.getPipelines();
      setPipelines(updatedPipes);
      setShowDeletePipelineModal(false);
      setSelectedPipelinesForDelete((prev) => prev.filter((id) => id !== selectedPipelineId));
      if (updatedPipes.length > 0) {
        setSelectedPipelineId(updatedPipes[0].id);
      } else {
        setSelectedPipelineId("");
      }
    } catch (err) {
      console.error("Failed to delete pipeline:", err);
      alert("Failed to delete pipeline.");
    } finally {
      setDeletingPipeline(false);
    }
  };

  const handleDeleteSession = (convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTargetDeleteConvId(convId);
    setShowDeleteModal(true);
  };

  const executeDeleteConversation = async () => {
    const idToDelete = targetDeleteConvId || currentConversationId;
    if (!idToDelete || idToDelete === "new") {
      handleNewChat();
      setShowDeleteModal(false);
      setTargetDeleteConvId(null);
      return;
    }
    try {
      setDeletingConv(true);
      await api.deleteConversation(idToDelete);
      const updated = await api.getConversations();
      setConversations(updated);
      setShowDeleteModal(false);
      if (currentConversationId === idToDelete) {
        if (updated.length > 0) {
          await handleSelectConversation(updated[0].conversation_id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
      setShowDeleteModal(false);
      handleNewChat();
    } finally {
      setDeletingConv(false);
      setTargetDeleteConvId(null);
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirm("Are you sure you want to clear all chat conversations?")) return;
    try {
      await api.clearAllChatHistory();
      setConversations([]);
      handleNewChat();
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const handleSendMessage = async (customQuery?: string) => {
    const query = (customQuery !== undefined ? customQuery : inputQuery).trim();
    if (!query || loading) return;
    setInputQuery("");

    const convId = currentConversationId || ("conv-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 7));
    if (!currentConversationId) {
      setCurrentConversationId(convId);
    }

    // Add user message optimistically
    const userMsg: ChatMessage = {
      id: "temp-" + Date.now(),
      conversation_id: convId,
      role: "user",
      content: query,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const chosenModel = selectedGenModelKey !== "auto"
        ? genModels.find((m) => `${m.provider}:${m.model_id}` === selectedGenModelKey)
        : null;

      const response = await api.sendChatMessage({
        query,
        pipeline_id: selectedPipelineId || undefined,
        conversation_id: convId,
        generation_provider: chosenModel ? chosenModel.provider : undefined,
        generation_model: chosenModel ? chosenModel.model_id : undefined,
      });

      const asstMsg: ChatMessage = {
        id: response.message_id,
        conversation_id: response.conversation_id || convId,
        role: "assistant",
        content: response.answer,
        citations: response.citations,
        retrieved_chunks: response.retrieved_chunks,
        run_metadata: response.run_metadata,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, asstMsg]);
      setActiveRetrievedChunks(response.retrieved_chunks || []);
      setActiveCitations(response.citations || []);
      setActiveRunMetadata(response.run_metadata || null);

      // Refresh conversations list
      const updatedConvs = await api.getConversations();
      setConversations(updatedConvs);
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Error generating answer. Ensure the backend is reachable.");
    } finally {
      setLoading(false);
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleCitationClick = (citationId: number) => {
    const citation = activeCitations.find((c) => c.citation_id === citationId);
    if (citation) {
      setHighlightedChunkId(citation.chunk_id);
      setInspectorOpen(true);
    }
  };

  // Render text with clickable citation links [1], [2]
  const renderMessageContent = (content: string) => {
    const parts = content.split(/(\[\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const citNum = parseInt(match[1]);
        return (
          <button
            key={index}
            onClick={() => handleCitationClick(citNum)}
            className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded bg-cyan-100 hover:bg-cyan-200 text-cyan-800 dark:bg-cyan-950/80 dark:hover:bg-cyan-900 dark:text-cyan-400 font-mono text-[11px] font-bold border border-cyan-300 dark:border-cyan-700/60 transition-all hover:scale-105"
            title={`View Source Citation [${citNum}]`}
          >
            [{citNum}]
          </button>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const activePipeline = pipelines.find((p) => p.id === selectedPipelineId);
  const activeConv = conversations.find((c) => c.conversation_id === currentConversationId);
  const targetConv = conversations.find((c) => c.conversation_id === (targetDeleteConvId || currentConversationId));

  const filteredConversations = conversations.filter((c) =>
    c.first_query.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <div className="flex h-[calc(100vh-62px)] overflow-hidden bg-slate-50 dark:bg-zinc-950 transition-colors duration-200">
      {/* Panel 1: Chat History Sidebar (Collapsible Left, drawer overlay on mobile) */}
      {historyOpen && (
        <>
          {/* Mobile/Tablet Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs z-40 lg:hidden animate-fade-in"
            onClick={() => setHistoryOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 flex flex-col shrink-0 shadow-2xl lg:static lg:z-auto lg:w-64 lg:shadow-none animate-fade-in transition-all select-none">
          {/* History Header */}
          <div className="p-3.5 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <History className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              <span>Chat History</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold">
                {conversations.length}
              </span>
            </div>
            <button
              onClick={() => setHistoryOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title="Collapse chat history sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* New Chat Primary Action */}
          <div className="p-3 border-b border-slate-200 dark:border-zinc-800/60">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 border border-slate-200 dark:border-zinc-700/70 text-slate-900 dark:text-zinc-100 text-xs font-semibold transition-all shadow-xs active:scale-95 group"
            >
              <div className="flex items-center gap-2">
                <SquarePen className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 group-hover:rotate-6 transition-transform" />
                <span>New Chat</span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Compose</span>
            </button>
          </div>

          {/* Search Filter if sessions >= 3 */}
          {conversations.length >= 3 && (
            <div className="px-3 pt-3 pb-1">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter sessions..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-900/80 border border-slate-200 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
            </div>
          )}

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((c) => {
                const isActive = currentConversationId === c.conversation_id;
                return (
                  <div
                    key={c.conversation_id}
                    onClick={() => handleSelectConversation(c.conversation_id)}
                    className={`group relative p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                      isActive
                        ? "bg-cyan-50/80 dark:bg-zinc-800/90 border-cyan-300 dark:border-cyan-500/60 shadow-sm text-slate-900 dark:text-white"
                        : "bg-transparent hover:bg-slate-100 dark:hover:bg-zinc-900/80 border-transparent hover:border-slate-200 dark:hover:border-zinc-800 text-slate-700 dark:text-zinc-300"
                    }`}
                  >
                    <MessageSquare
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        isActive ? "text-cyan-600 dark:text-cyan-400" : "text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-400"
                      }`}
                    />
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-xs font-semibold truncate leading-tight">
                        {c.first_query || "New Conversation"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                        <span>{c.message_count} {c.message_count === 1 ? "msg" : "msgs"}</span>
                        <span>•</span>
                        <span>{formatTime(c.last_active)}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(c.conversation_id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all absolute right-2 top-2"
                      title="Delete this chat"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">
                {historySearch ? "No matching conversations found." : "No saved chats yet."}
              </div>
            )}
          </div>

          {/* Bottom Sessions Counter / Clear All */}
          {conversations.length > 0 && (
            <div className="p-3 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-500">
              <span className="font-mono">{conversations.length} saved</span>
              <button
                onClick={handleClearAllHistory}
                className="hover:text-rose-600 dark:hover:text-rose-400 text-slate-400 dark:text-zinc-500 transition-colors flex items-center gap-1"
                title="Clear all chat history"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear all</span>
              </button>
            </div>
          )}
          </div>
        </>
      )}

      {/* Panel 2: Chat Conversation Area (Center) */}
      <div className="flex-1 flex flex-col border-r border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950/50 min-w-0">
        {/* Chat Header */}
        <div className="p-2.5 sm:p-3.5 border-b border-slate-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2.5 bg-white/90 dark:bg-zinc-950/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {!historyOpen && (
              <button
                onClick={() => setHistoryOpen(true)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all shrink-0"
                title="Open chat history sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}

            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/40 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">RAG Chat</h2>
                {activeConv && (
                  <span className="hidden md:inline-block max-w-[160px] truncate text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-cyan-700 dark:text-cyan-400">
                    {activeConv.first_query}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-zinc-500 truncate hidden xs:block">Traceable evidence with verified bracketed citations.</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {!historyOpen && (
              <button
                onClick={handleNewChat}
                className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700/80 text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700/70 font-semibold text-xs transition-all shadow-xs active:scale-95"
                title="Start a new grounded chat session"
              >
                <SquarePen className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 group-hover:rotate-6 transition-transform" />
                <span>New Chat</span>
              </button>
            )}

            {/* Pipeline & Model Selectors */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-zinc-400 hidden sm:inline font-mono">Pipeline:</span>

              {/* Custom Multi-Select Pipeline Dropdown */}
              <div className="relative" ref={pipelineDropdownRef}>
                <button
                  type="button"
                  onClick={() => setPipelineDropdownOpen((prev) => !prev)}
                  className="bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/90 border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-2 transition-all max-w-[210px] font-medium"
                >
                  <span className="truncate">
                    {activePipeline ? activePipeline.name : "Select Pipeline..."}
                  </span>
                  {selectedPipelinesForDelete.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 text-[10px] font-mono border border-rose-200 dark:border-rose-500/30 shrink-0">
                      {selectedPipelinesForDelete.length} sel
                    </span>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-zinc-400 shrink-0 transition-transform ${pipelineDropdownOpen ? "rotate-180 text-cyan-600 dark:text-cyan-400" : ""}`} />
                </button>

                {pipelineDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-80 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800/80 animate-fade-in">
                    {/* Header with Select All & Batch Delete action */}
                    <div className="p-2.5 bg-slate-50 dark:bg-zinc-900/60 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 dark:text-zinc-300 font-semibold hover:text-slate-900 dark:hover:text-white">
                        <input
                          type="checkbox"
                          checked={pipelines.length > 0 && selectedPipelinesForDelete.length === pipelines.length}
                          onChange={handleSelectAllPipelines}
                          className="w-3.5 h-3.5 rounded border-slate-300 bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-500 cursor-pointer accent-cyan-600"
                        />
                        <span>Select All ({pipelines.length})</span>
                      </label>
                      {selectedPipelinesForDelete.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPipelineDropdownOpen(false);
                            setShowBatchDeletePipelineModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-md shadow-rose-600/20 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete ({selectedPipelinesForDelete.length})</span>
                        </button>
                      )}
                    </div>

                    {/* Pipeline List with Checkboxes */}
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-900">
                      {pipelines.map((pipe) => {
                        const isSelected = selectedPipelinesForDelete.includes(pipe.id);
                        const isActive = pipe.id === selectedPipelineId;
                        return (
                          <div
                            key={pipe.id}
                            className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors cursor-pointer group ${
                              isActive ? "bg-cyan-50 dark:bg-cyan-950/30" : "hover:bg-slate-50 dark:hover:bg-zinc-900/50"
                            }`}
                            onClick={() => {
                              setSelectedPipelineId(pipe.id);
                              setPipelineDropdownOpen(false);
                            }}
                          >
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="shrink-0 flex items-center"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectPipelineForDelete(pipe.id)}
                                className="w-4 h-4 rounded border-slate-300 bg-white dark:bg-zinc-900 text-cyan-600 dark:text-cyan-500 cursor-pointer accent-cyan-600"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-semibold truncate ${isActive ? "text-cyan-700 dark:text-cyan-300" : "text-slate-800 dark:text-zinc-200 group-hover:text-slate-900 dark:group-hover:text-white"}`}>
                                  {pipe.name}
                                </span>
                                {isActive && (
                                  <span className="text-[10px] font-mono text-cyan-800 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-200 dark:border-cyan-800/40 shrink-0">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500 dark:text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                                <span>{pipe.generation_provider.toUpperCase()} • {pipe.generation_model}</span>
                                <span>|</span>
                                <span>{pipe.retrieval_mode}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {pipelines.length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                          No pipelines created yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* LLM Engine / Model Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-zinc-400 hidden md:inline font-mono">LLM:</span>
                <select
                  value={selectedGenModelKey}
                  onChange={(e) => setSelectedGenModelKey(e.target.value)}
                  className="bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-cyan-700 dark:text-cyan-300 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30 max-w-[210px] truncate font-medium"
                  title="Select LLM Generation Model"
                >
                  <option value="auto">
                    {activePipeline ? `Pipeline Default (${activePipeline.generation_provider.toUpperCase()} • ${activePipeline.generation_model})` : "Auto (Groq Qwen 27B)"}
                  </option>
                  {genModels
                    .filter((m) => m.provider === "groq" || m.is_available)
                    .map((m) => (
                      <option key={`${m.provider}:${m.model_id}`} value={`${m.provider}:${m.model_id}`}>
                        {m.provider.toUpperCase()} • {m.name || m.model_id}
                      </option>
                    ))}
                </select>
              </div>

              {/* Delete Pipeline Button: Single or Batch */}
              {selectedPipelinesForDelete.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowBatchDeletePipelineModal(true)}
                  className="p-1.5 px-2.5 rounded-xl border border-rose-300 dark:border-rose-800/80 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-1.5 text-xs font-mono transition-all ml-0.5 shadow-sm"
                  title={`Delete ${selectedPipelinesForDelete.length} selected pipeline(s)`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  <span>Delete ({selectedPipelinesForDelete.length})</span>
                </button>
              ) : (
                activePipeline && pipelines.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowDeletePipelineModal(true)}
                    className="p-1.5 rounded-xl border border-slate-200 hover:border-rose-300 dark:border-zinc-800 dark:hover:border-rose-900/60 bg-slate-100 hover:bg-rose-50 dark:bg-zinc-900/80 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-400 transition-all ml-0.5"
                    title={`Delete pipeline "${activePipeline.name}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )
              )}

              {/* Evidence Inspector Toggle Button */}
              <button
                type="button"
                onClick={() => setInspectorOpen((prev) => !prev)}
                className={`p-1.5 sm:px-2.5 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-all shadow-xs shrink-0 ${
                  inspectorOpen
                    ? "bg-cyan-50 dark:bg-cyan-950/70 border-cyan-400 dark:border-cyan-500/60 text-cyan-700 dark:text-cyan-300 font-semibold"
                    : "bg-slate-100 hover:bg-slate-200/80 dark:bg-zinc-900 dark:hover:bg-zinc-800 border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300"
                }`}
                title="Toggle Evidence & Chunks Inspector"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                <span className="hidden sm:inline">Evidence</span>
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-100 dark:bg-cyan-900/80 text-cyan-800 dark:text-cyan-300 font-mono text-[10px] font-bold">
                  {activeRetrievedChunks.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Message Thread */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-12 space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-md">
                <SquarePen className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">New Grounded RAG Chat</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Ask questions across your indexed knowledge base. Every response generates bracketed source citations [1], [2] linked to exact document chunks.
                </p>
              </div>

              {activePipeline && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] text-slate-600 dark:text-zinc-400 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {activePipeline.name} • {activePipeline.generation_model}
                </div>
              )}

              <div className="w-full space-y-2 pt-2">
                <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-zinc-500 font-mono font-semibold block">
                  Suggested Prompts
                </span>
                {[
                  "What are the key chunking strategies supported by RAG Studio?",
                  "Explain how dense vector retrieval works in Chroma DB.",
                  "What evaluation metrics are used to measure retrieval quality?"
                ].map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(promptText)}
                    className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900/60 dark:hover:bg-zinc-800/80 border border-slate-200 dark:border-zinc-800 hover:border-cyan-500/40 text-xs text-slate-800 dark:text-zinc-300 transition-all flex items-center justify-between group shadow-sm"
                  >
                    <span>{promptText}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 text-xs leading-relaxed ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex items-center justify-center shrink-0 text-cyan-600 dark:text-cyan-400">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}

                <div className="flex flex-col gap-1.5 max-w-xl">
                  <div
                    className={`p-4 rounded-2xl ${
                      m.role === "user"
                        ? "bg-cyan-600 text-white font-medium shadow-sm"
                        : "bg-slate-100 dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/90 text-slate-900 dark:text-zinc-200 shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{renderMessageContent(m.content)}</div>
                  </div>
                  {m.role === "assistant" && m.run_metadata && (
                    <div className="flex items-center gap-2 px-2 text-[10px] text-slate-500 dark:text-zinc-500 font-mono flex-wrap">
                      {m.run_metadata.provider && (
                        <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-cyan-800/50 text-cyan-700 dark:text-cyan-400 font-bold flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5 text-cyan-500" />
                          {m.run_metadata.provider}
                        </span>
                      )}
                      {m.run_metadata.model && (
                        <span className="text-slate-700 dark:text-zinc-300">{m.run_metadata.model}</span>
                      )}
                      {m.run_metadata.generation_latency_ms !== undefined && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">• {m.run_metadata.generation_latency_ms}ms</span>
                      )}
                      {m.run_metadata.is_fallback ? (
                        <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/40 font-semibold" title={m.run_metadata.generation_error || "Fallback engine used"}>
                          Fallback
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/40 font-semibold">
                          Live LLM
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {m.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 text-slate-700 dark:text-zinc-300">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-zinc-400">
              <div className="w-7 h-7 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 border border-cyan-300 dark:border-cyan-800/60 flex items-center justify-center text-cyan-700 dark:text-cyan-400">
                <Bot className="w-3.5 h-3.5" />
              </div>
              <div className="p-3 bg-slate-100 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                Retrieving chunks and synthesizing grounded answer...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompt suggestions bar */}
        {messages.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 dark:border-zinc-900 bg-slate-50/50 dark:bg-zinc-950/40 flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-zinc-500 font-semibold shrink-0">
              Try:
            </span>
            {[
              "What chunking strategies are supported?",
              "Explain Context Precision vs Recall.",
              "What LLM-as-a-judge criteria are used?"
            ].map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSendMessage(p)}
                disabled={loading}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 hover:border-cyan-500/40 text-[11px] text-slate-700 dark:text-zinc-300 font-medium whitespace-nowrap transition-all shadow-2xs hover:text-cyan-600 dark:hover:text-cyan-400 disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Chat Input Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question about your indexed documents..."
              className="flex-1 bg-slate-50 dark:bg-zinc-900 border border-slate-300 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all shadow-sm"
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all disabled:opacity-40 shadow-md shadow-cyan-500/20 active:scale-95 font-bold"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Panel 3: Sources / Evidence Inspector & Run Telemetry (Right: Drawer on mobile/tablet, dock on xl) */}
      {inspectorOpen && (
        <>
          {/* Mobile/Tablet Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs z-40 xl:hidden animate-fade-in"
            onClick={() => setInspectorOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-80 sm:w-96 max-w-[92vw] flex flex-col bg-slate-50 dark:bg-zinc-950 border-l border-slate-200 dark:border-zinc-800/80 shadow-2xl xl:static xl:z-auto xl:w-96 xl:shadow-none overflow-y-auto animate-fade-in">
            {/* Telemetry Header */}
            <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-mono">
                    Evidence Inspector
                  </h3>
                  {activeRunMetadata && (
                    <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                      {activeRunMetadata.total_latency_ms}ms
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setInspectorOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-zinc-800 transition-colors"
                  title="Close Evidence Inspector"
                  aria-label="Close Evidence Inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {activeRunMetadata && (
                <div className="space-y-2 mt-3">
                  {(activeRunMetadata.provider || activeRunMetadata.model) && (
                    <div className="flex items-center justify-between text-[10px] font-mono px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 shadow-sm">
                      <span className="text-slate-400 dark:text-zinc-500">LLM Engine</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-bold uppercase">
                        {activeRunMetadata.provider || "LLM"} • <span className="normal-case text-slate-800 dark:text-zinc-300 font-normal">{activeRunMetadata.model}</span>
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                    <div className="p-2 rounded bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 text-center shadow-sm">
                      <span className="text-slate-400 dark:text-zinc-500 block">Embed</span>
                      <span className="text-slate-800 dark:text-zinc-200 font-semibold">{activeRunMetadata.embedding_latency_ms}ms</span>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 text-center shadow-sm">
                      <span className="text-slate-400 dark:text-zinc-500 block">Retrieve</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{activeRunMetadata.retrieval_latency_ms}ms</span>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800/80 text-center shadow-sm">
                      <span className="text-slate-400 dark:text-zinc-500 block">Generate</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{activeRunMetadata.generation_latency_ms}ms</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Retrieved Chunks List */}
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-600 dark:text-zinc-400 flex items-center justify-between">
                <span>Retrieved Chunks ({activeRetrievedChunks.length})</span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">Sorted by Cosine Sim</span>
              </div>

              {activeRetrievedChunks.length > 0 ? (
                activeRetrievedChunks.map((chunk, idx) => {
                  const rankNum = idx + 1;
                  const isCited = activeCitations.some((c) => c.citation_id === rankNum);
                  const isHighlighted = highlightedChunkId === chunk.chunk_id;

                  return (
                    <div
                      key={chunk.chunk_id || idx}
                      className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                        isHighlighted
                          ? "bg-cyan-50 dark:bg-cyan-950/40 border-cyan-500 ring-2 ring-cyan-500/40 shadow-md"
                          : isCited
                          ? "bg-cyan-50/40 dark:bg-zinc-900/90 border-cyan-300 dark:border-cyan-800/40"
                          : "bg-white dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800/60 shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-cyan-700 dark:text-cyan-400">
                          [{rankNum}] {isCited && <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">CITED</span>}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400 font-semibold">
                          Sim: {chunk.score ? `${Math.round(chunk.score * 100)}%` : "N/A"}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-500 dark:text-zinc-400 truncate">
                        {chunk.metadata?.file_name || "Document"} • Page {chunk.metadata?.page || 1}
                      </div>

                      <p className="text-slate-800 dark:text-zinc-300 font-mono text-[11px] leading-relaxed line-clamp-4">
                        {chunk.content}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-400 dark:text-zinc-600 text-xs">
                  No evidence retrieved yet. Submit a question in the chat to inspect evidence.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/50 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete Chat Conversation</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Are you sure you want to delete this chat session and its retrieved evidence?
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-zinc-800/80">
              <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-zinc-500 block font-semibold">Session</span>
              <span className="text-xs text-slate-800 dark:text-zinc-200 font-semibold truncate block">
                {targetConv?.first_query ||
                  conversations.find((c) => c.conversation_id === currentConversationId)?.first_query ||
                  "Active Chat Session"}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingConv}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeleteConversation}
                disabled={deletingConv}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/30 flex items-center gap-2 active:scale-95"
              >
                {deletingConv ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Conversation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Pipeline Confirmation Modal */}
      {showDeletePipelineModal && activePipeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Delete Pipeline</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Permanently delete this architecture</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-zinc-800/80 space-y-1">
              <span className="text-[10px] uppercase font-mono text-slate-400 dark:text-zinc-500 block font-semibold">Pipeline Name</span>
              <span className="text-xs text-slate-900 dark:text-zinc-200 font-semibold truncate block font-mono">
                {activePipeline.name}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
              This will remove this pipeline configuration and any linked evaluation runs. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowDeletePipelineModal(false)}
                disabled={deletingPipeline}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeDeletePipeline}
                disabled={deletingPipeline}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/30 flex items-center gap-2 active:scale-95"
              >
                {deletingPipeline ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Pipeline</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Pipelines Confirmation Modal */}
      {showBatchDeletePipelineModal && selectedPipelinesForDelete.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Batch Delete Pipelines</h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Permanently delete selected architectures</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to permanently delete{" "}
              <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{selectedPipelinesForDelete.length}</span> selected pipeline(s)?
              This will remove all associated configurations and linked evaluation runs.
            </p>

            <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-zinc-800/80">
              {pipelines
                .filter((p) => selectedPipelinesForDelete.includes(p.id))
                .map((p) => (
                  <div key={p.id} className="text-[11px] text-slate-700 dark:text-zinc-300 flex items-center justify-between font-mono">
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">{p.generation_provider}</span>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowBatchDeletePipelineModal(false)}
                disabled={batchDeletingPipelines}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeBatchDeletePipelines}
                disabled={batchDeletingPipelines}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/30 flex items-center gap-2 active:scale-95"
              >
                {batchDeletingPipelines ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting ({selectedPipelinesForDelete.length})...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete {selectedPipelinesForDelete.length} Pipeline(s)</span>
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
