import React, { useState, useEffect, useRef } from "react";
import {
  Settings,
  Key,
  ShieldCheck,
  Server,
  Database,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Cpu,
  RefreshCw,
  HardDrive,
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Save,
  Layers,
  Zap,
  Sun,
  Moon,
  Laptop,
  Lock
} from "lucide-react";
import { api } from "../services/api";
import { useTheme } from "../context/ThemeContext";

interface ProviderModel {
  provider: string;
  model_id: string;
  name: string;
  type: string; // "generation" | "embedding" | "audio"
  context_window?: number;
  dimension?: number;
  description?: string;
  is_available?: boolean;
}

interface ProviderMeta {
  id: string;
  name: string;
  envVar: string;
  description: string;
  badge: string;
  badgeColor: string;
  iconColor: string;
  placeholder: string;
  docsUrl: string;
}

const PROVIDER_METAS: ProviderMeta[] = [
  {
    id: "huggingface",
    name: "Hugging Face Hub",
    envVar: "HUGGINGFACE_API_KEY",
    description: "Open-source embeddings & LLMs via Hugging Face Inference API (BGE, Zephyr, LLaMA, Mistral).",
    badge: "Open Weights / Hub",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300 border-amber-300 dark:border-amber-500/20",
    iconColor: "text-amber-500 dark:text-amber-400",
    placeholder: "hf_...",
    docsUrl: "https://huggingface.co/settings/tokens"
  },
  {
    id: "groq",
    name: "Groq Cloud (LPU)",
    envVar: "GROQ_API_KEY",
    description: "Ultra-low latency inference engine powered by Groq LPUs (LLaMA 3.3 70B, Mixtral, DeepSeek R1).",
    badge: "Ultra Low Latency",
    badgeColor: "bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300 border-orange-300 dark:border-orange-500/20",
    iconColor: "text-orange-500 dark:text-orange-400",
    placeholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys"
  },
  {
    id: "openai",
    name: "OpenAI Gateway",
    envVar: "OPENAI_API_KEY",
    description: "Flagship GPT-4o, GPT-4o Mini, o1 reasoning models, and text-embedding-3 vectors.",
    badge: "Commercial SOTA",
    badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/20",
    iconColor: "text-emerald-500 dark:text-emerald-400",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    envVar: "GOOGLE_API_KEY",
    description: "Long-context 1M-2M token multimodal models (Gemini 1.5 Flash/Pro) and text-embedding-004.",
    badge: "Long Context (1M+)",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300 border-blue-300 dark:border-blue-500/20",
    iconColor: "text-blue-500 dark:text-blue-400",
    placeholder: "AIzaSy...",
    docsUrl: "https://aistudio.google.com/app/apikey"
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    envVar: "ANTHROPIC_API_KEY",
    description: "High-intelligence reasoning and coding models (Claude 3.5 Sonnet, Claude 3.5 Haiku).",
    badge: "Nuanced Reasoning",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-500/10 dark:text-purple-300 border-purple-300 dark:border-purple-500/20",
    iconColor: "text-purple-500 dark:text-purple-400",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys"
  },
  {
    id: "cohere",
    name: "Cohere Command & Embed",
    envVar: "COHERE_API_KEY",
    description: "Enterprise conversational Command R+ and Embed English/Multilingual v3.0.",
    badge: "Enterprise RAG",
    badgeColor: "bg-teal-100 text-teal-800 dark:bg-teal-500/10 dark:text-teal-300 border-teal-300 dark:border-teal-500/20",
    iconColor: "text-teal-500 dark:text-teal-400",
    placeholder: "...",
    docsUrl: "https://dashboard.cohere.com/api-keys"
  }
];

export const SettingsScreen: React.FC = () => {
  const { theme, setTheme } = useTheme();

  // Provider key values & visibility state
  const [keys, setKeys] = useState<Record<string, string>>({
    huggingface: "",
    groq: "",
    openai: "",
    gemini: "",
    anthropic: "",
    cohere: ""
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    huggingface: false,
    groq: false,
    openai: false,
    gemini: false,
    anthropic: false,
    cohere: false
  });
  const [isKeyConfigured, setIsKeyConfigured] = useState<Record<string, boolean>>({
    huggingface: false,
    groq: false,
    openai: false,
    gemini: false,
    anthropic: false,
    cohere: false
  });

  // Fetched models per provider
  const [providerModels, setProviderModels] = useState<Record<string, ProviderModel[]>>({});
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<Record<string, { success?: string; error?: string }>>({});
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  const [modelSearch, setModelSearch] = useState<Record<string, string>>({});
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  // Ollama & Chroma DB
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [chromaDirectory, setChromaDirectory] = useState("./storage/chromadb");
  const [globalSaving, setGlobalSaving] = useState(false);
  const [globalSavedToast, setGlobalSavedToast] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [hostedLlmReady, setHostedLlmReady] = useState<boolean>(false);
  const [activeDemoProvider, setActiveDemoProvider] = useState<string | null>(null);

  const keysRef = useRef<Record<string, string>>(keys);
  const isKeyConfiguredRef = useRef<Record<string, boolean>>(isKeyConfigured);

  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  useEffect(() => {
    isKeyConfiguredRef.current = isKeyConfigured;
  }, [isKeyConfigured]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      if (data?.demo_mode !== undefined) {
        setIsDemoMode(Boolean(data.demo_mode));
      }
      if (data?.hosted_llm_ready !== undefined) {
        setHostedLlmReady(Boolean(data.hosted_llm_ready));
      }
      if (data?.active_demo_provider) {
        setActiveDemoProvider(data.active_demo_provider);
      }
      if (data?.providers) {
        const configuredMap: Record<string, boolean> = {};
        const keyValInit: Record<string, string> = {};

        for (const [pId, pInfo] of Object.entries(data.providers as Record<string, any>)) {
          const isSet = Boolean(pInfo.is_set);
          configuredMap[pId] = isSet;
          if (isSet && pInfo.masked_key) {
            keyValInit[pId] = pInfo.masked_key;
          } else if (!isSet) {
            keyValInit[pId] = "";
          }
        }
        setIsKeyConfigured(configuredMap);
        isKeyConfiguredRef.current = configuredMap;

        setKeys((prev) => {
          const next = { ...prev };
          for (const [pId, val] of Object.entries(keyValInit)) {
            if (!next[pId] || next[pId].includes("•")) {
              next[pId] = val;
            }
          }
          keysRef.current = next;
          return next;
        });

        if (data.cached_models) {
          const normalizedModels: Record<string, ProviderModel[]> = { ...data.cached_models };
          if (normalizedModels.google && !normalizedModels.gemini) {
            normalizedModels.gemini = normalizedModels.google;
          } else if (normalizedModels.gemini && !normalizedModels.google) {
            normalizedModels.google = normalizedModels.gemini;
          }
          setProviderModels(normalizedModels);
        }

        // Auto-fetch ONLY for providers that are configured, NOT ollama, and do NOT have models cached yet!
        for (const [pId, pInfo] of Object.entries(data.providers as Record<string, any>)) {
          const hasCached = Boolean(
            data.cached_models?.[pId]?.length ||
            (pId === "gemini" && data.cached_models?.google?.length)
          );
          if (pInfo.is_set && pId !== "ollama" && !hasCached) {
            fetchModelsForProvider(pId, false, { isConfiguredOverride: true });
          }
        }
      }

      if (data.ollama_base_url) setOllamaUrl(data.ollama_base_url);
      if (data.chroma_persist_directory) setChromaDirectory(data.chroma_persist_directory);
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const toggleShowKey = (providerId: string) => {
    setShowKeys((prev) => ({
      ...prev,
      [providerId]: !prev[providerId]
    }));
  };

  const handleKeyChange = (providerId: string, val: string) => {
    setKeys((prev) => {
      const next = { ...prev, [providerId]: val };
      keysRef.current = next;
      return next;
    });
    setProviderStatus((prev) => ({
      ...prev,
      [providerId]: {}
    }));
  };

  const fetchModelsForProvider = async (
    providerId: string,
    expandAfter = true,
    options?: { isConfiguredOverride?: boolean; rawKeyOverride?: string }
  ) => {
    setLoadingProvider(providerId);
    setProviderStatus((prev) => ({
      ...prev,
      [providerId]: {}
    }));

    try {
      const currentRawKey =
        options?.rawKeyOverride !== undefined
          ? options.rawKeyOverride
          : (keys[providerId] ?? keysRef.current[providerId] ?? "");

      const isPlaceholder = !currentRawKey || currentRawKey.includes("•") || !/^[\x20-\x7E]+$/.test(currentRawKey);
      const keyToSend = isPlaceholder ? undefined : currentRawKey.trim();

      const currentlyConfigured =
        options?.isConfiguredOverride !== undefined
          ? options.isConfiguredOverride
          : Boolean(isKeyConfigured[providerId] || isKeyConfiguredRef.current[providerId]);

      if (!keyToSend && !currentlyConfigured && providerId !== "ollama") {
        setProviderStatus((prev) => ({
          ...prev,
          [providerId]: {
            error: `Please enter a valid ${providerId.toUpperCase()} API key before fetching models.`
          }
        }));
        setLoadingProvider(null);
        return;
      }

      const res = await api.fetchProviderModels({
        provider: providerId,
        api_key: keyToSend,
        base_url: providerId === "ollama" ? ollamaUrl : undefined,
        save_key: Boolean(keyToSend && !isPlaceholder)
      });

      if (res.status === "success" && res.models) {
        setProviderModels((prev) => ({
          ...prev,
          [providerId]: res.models,
          ...(providerId === "gemini" ? { google: res.models } : {}),
          ...(providerId === "google" ? { gemini: res.models } : {})
        }));
        setIsKeyConfigured((prev) => ({
          ...prev,
          [providerId]: true
        }));
        isKeyConfiguredRef.current[providerId] = true;

        setProviderStatus((prev) => ({
          ...prev,
          [providerId]: {
            success: `Connected! Loaded ${res.models.length} live models.`
          }
        }));
        if (expandAfter) {
          setExpandedModels((prev) => ({
            ...prev,
            [providerId]: true
          }));
        }
      } else {
        setProviderStatus((prev) => ({
          ...prev,
          [providerId]: {
            error: res.message || "Failed to fetch models from provider."
          }
        }));
      }
    } catch (err: any) {
      setProviderStatus((prev) => ({
        ...prev,
        [providerId]: {
          error: err.message || "Network error querying provider API gateway."
        }
      }));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleSaveAll = async () => {
    if (isDemoMode) {
      alert("Settings modification is disabled in Hosted Demo Mode to protect shared platform credentials. You can test all RAG features directly!");
      return;
    }

    setGlobalSaving(true);
    const sanitizeKey = (k?: string) => {
      if (!k) return undefined;
      if (k.includes("•") || !/^[\x20-\x7E]+$/.test(k)) return undefined;
      const trimmed = k.trim();
      return trimmed === "" ? "" : trimmed;
    };

    try {
      await api.updateSettings({
        hf_key: sanitizeKey(keys.huggingface),
        groq_key: sanitizeKey(keys.groq),
        openai_key: sanitizeKey(keys.openai),
        gemini_key: sanitizeKey(keys.gemini),
        anthropic_key: sanitizeKey(keys.anthropic),
        cohere_key: sanitizeKey(keys.cohere),
        ollama_url: ollamaUrl,
        chroma_directory: chromaDirectory
      });
      setGlobalSavedToast(true);
      setTimeout(() => setGlobalSavedToast(false), 3000);
      loadSettings();
    } catch (e: any) {
      console.error(e);
      alert(e.message || "Failed to save settings");
    } finally {
      setGlobalSaving(false);
    }
  };

  const handleCopyModelId = (modelId: string) => {
    navigator.clipboard.writeText(modelId);
    setCopiedModelId(modelId);
    setTimeout(() => setCopiedModelId(null), 2000);
  };

  const toggleModelsDrawer = (providerId: string) => {
    setExpandedModels((prev) => ({
      ...prev,
      [providerId]: !prev[providerId]
    }));
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800/80">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            Settings & Model Providers
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure inference credentials, inspect live provider models, manage appearance, and inspect storage.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveAll}
            disabled={globalSaving || isDemoMode}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 transition-all active:scale-95 ${
              isDemoMode
                ? "bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 cursor-not-allowed border border-slate-300 dark:border-zinc-700 shadow-none"
                : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20 disabled:opacity-50"
            }`}
            title={isDemoMode ? "Settings are locked in Hosted Demo Mode" : "Save All Credentials"}
          >
            {isDemoMode ? (
              <Lock className="w-4 h-4" />
            ) : globalSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : globalSavedToast ? (
              <Check className="w-4 h-4 text-white" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isDemoMode ? "Locked in Demo Mode" : globalSavedToast ? "Saved All Settings!" : "Save All Credentials"}</span>
          </button>
        </div>
      </div>

      {/* Hosted Demo Banner */}
      {(isDemoMode || hostedLlmReady) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-cyan-500/10 border border-cyan-500/25 flex items-start gap-3.5 shadow-sm">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Hosted Demo Mode Active
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono font-bold text-[10px] border border-emerald-500/20">
                Zero Configuration Required
              </span>
              {activeDemoProvider && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-mono font-bold text-[10px] uppercase border border-cyan-500/20">
                  Default Provider: {activeDemoProvider}
                </span>
              )}
            </div>
            <p className="text-slate-600 dark:text-zinc-300 leading-relaxed">
              The host has pre-configured inference credentials on the server. Viewers can query documents in the Playground, run automated evaluations, and inspect source citations immediately without entering any API keys.
            </p>
            {isDemoMode && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400/90 font-medium">
                Note: Server key modification is locked in Demo Mode to protect shared quotas.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Appearance & Theme Selector Section */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                Appearance & Theme Mode
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Toggle between high-contrast Light Mode, OLED Night Mode, or automatic System OS synchronization.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: "light",
                label: "Light Mode",
                desc: "Crisp white canvas, high-contrast text, clean borders",
                icon: Sun,
                iconColor: "text-amber-500"
              },
              {
                id: "dark",
                label: "Night Mode (Dark)",
                desc: "Deep obsidian charcoal, pure neutral OLED, high-contrast typography",
                icon: Moon,
                iconColor: "text-cyan-400"
              },
              {
                id: "system",
                label: "System Auto",
                desc: "Automatically adapts based on your device's preference",
                icon: Laptop,
                iconColor: "text-indigo-400"
              }
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = theme === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTheme(t.id as any)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-cyan-50/80 dark:bg-zinc-800/90 border-cyan-500 shadow-sm text-slate-900 dark:text-white"
                      : "bg-white dark:bg-zinc-900/40 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${t.iconColor}`} />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">{t.label}</span>
                    </div>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-cyan-500 glow-cyan" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Provider Credentials & Model Fetching Cards */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">LLM & Embedding Model Gateways</h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-zinc-400">
            Click the <Eye className="w-3.5 h-3.5 inline mx-1 text-slate-600 dark:text-zinc-300" /> button to view/hide your key, then click{" "}
            <span className="text-cyan-600 dark:text-cyan-300 font-medium">Fetch Models</span> to discover models.
          </span>
        </div>

        <div className="space-y-4">
          {PROVIDER_METAS.map((provider) => {
            const pKey = keys[provider.id] || "";
            const isVisible = Boolean(showKeys[provider.id]);
            const isConfigured = Boolean(isKeyConfigured[provider.id]);
            const models = providerModels[provider.id] || [];
            const isExpanded = Boolean(expandedModels[provider.id]);
            const isLoading = loadingProvider === provider.id;
            const status = providerStatus[provider.id] || {};
            const searchVal = (modelSearch[provider.id] || "").toLowerCase();

            const filteredModels = models.filter(
              (m) =>
                m.model_id.toLowerCase().includes(searchVal) ||
                m.name.toLowerCase().includes(searchVal) ||
                (m.description || "").toLowerCase().includes(searchVal)
            );

            return (
              <div key={provider.id} className="double-bezel">
                <div className="double-bezel-inner p-4 sm:p-5 space-y-4">
                  {/* Provider Header & Key Input Row */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Sparkles className={`w-4 h-4 ${provider.iconColor}`} />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{provider.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${provider.badgeColor}`}>
                          {provider.badge}
                        </span>
                        {isConfigured && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            Configured
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">{provider.description}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                        <span>Env: {provider.envVar}</span>
                        <span>•</span>
                        <a
                          href={provider.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-cyan-600 dark:hover:text-cyan-400 flex items-center gap-0.5 transition-colors font-medium"
                        >
                          Get API Key <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>

                    {/* Input Field with Eye View Button & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full lg:w-auto">
                      <div className="relative flex items-center w-full sm:w-64">
                        <input
                          id={`api-key-${provider.id}`}
                          type={isVisible ? "text" : "password"}
                          value={pKey}
                          onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                          placeholder={provider.placeholder}
                          className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg pl-3 pr-10 py-2 text-xs text-slate-900 dark:text-white font-mono w-full focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-colors shadow-sm"
                        />
                        {/* VIEW BUTTON FOR API KEY */}
                        <button
                          type="button"
                          onClick={() => toggleShowKey(provider.id)}
                          title={isVisible ? "Hide API Key" : "Show API Key"}
                          aria-label={isVisible ? "Hide API Key" : "Show API Key"}
                          className="absolute right-2 p-1.5 text-slate-400 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-100 rounded-md transition-colors"
                        >
                          {isVisible ? (
                            <EyeOff className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-400" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => fetchModelsForProvider(provider.id, true)}
                          disabled={isLoading}
                          className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-cyan-700 dark:text-cyan-300 text-xs font-semibold border border-slate-300 dark:border-zinc-700 flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 active:scale-95"
                        >
                          {isLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-600 dark:text-cyan-400" />
                          ) : (
                            <Cpu className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          )}
                          <span>{isLoading ? "Fetching..." : "Fetch Models"}</span>
                        </button>

                        {models.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleModelsDrawer(provider.id)}
                            className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-300 text-xs font-semibold border border-slate-300 dark:border-zinc-800 flex items-center gap-1 transition-colors shadow-sm"
                            title={isExpanded ? "Collapse Models List" : "Expand Models List"}
                          >
                            <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 font-bold">{models.length}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Feedback Status Alert */}
                  {status.success && (
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/40 rounded-lg text-[11px] text-emerald-800 dark:text-emerald-400 font-mono flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="font-semibold">{status.success}</span>
                      </div>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-500">Models registered in catalog</span>
                    </div>
                  )}

                  {status.error && (
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/40 rounded-lg text-[11px] text-rose-800 dark:text-rose-300 font-mono flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="font-semibold">{status.error}</span>
                    </div>
                  )}

                  {/* Fetched Models Drawer */}
                  {models.length > 0 && isExpanded && (
                    <div className="pt-4 border-t border-slate-200 dark:border-zinc-800/80 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Available Models from {provider.name} ({models.length})
                          </span>
                        </div>

                        <div className="relative w-full sm:w-60">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-zinc-500" />
                          <input
                            type="text"
                            placeholder="Filter models by name..."
                            value={modelSearch[provider.id] || ""}
                            onChange={(e) =>
                              setModelSearch((prev) => ({
                                ...prev,
                                [provider.id]: e.target.value
                              }))
                            }
                            className="bg-slate-50 dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-md pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-500 w-full focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                          />
                        </div>
                      </div>

                      {/* Models Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto pr-1">
                        {filteredModels.map((m) => {
                          const isCopied = copiedModelId === m.model_id;
                          const isEmbedding = m.type === "embedding";
                          const isAudio = m.type === "audio";

                          return (
                            <div
                              key={m.model_id}
                              className="p-2.5 bg-slate-50 dark:bg-zinc-950/70 border border-slate-200 dark:border-zinc-800/90 rounded-lg hover:border-slate-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between group shadow-sm"
                            >
                              <div className="space-y-1">
                                <div className="flex items-start justify-between gap-1.5">
                                  <span
                                    className="font-mono text-xs text-slate-900 dark:text-zinc-200 font-semibold truncate block max-w-[200px]"
                                    title={m.model_id}
                                  >
                                    {m.model_id}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyModelId(m.model_id)}
                                    title="Copy model ID"
                                    className="p-1 rounded text-slate-400 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
                                  >
                                    {isCopied ? (
                                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 block">
                                  {m.name !== m.model_id ? m.name : m.description || "Provider model"}
                                </span>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-500 font-mono pt-2 mt-2 border-t border-slate-200 dark:border-zinc-900">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-semibold ${
                                    isEmbedding
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20"
                                      : isAudio
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20"
                                      : "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-500/20"
                                  }`}
                                >
                                  {isEmbedding
                                    ? `Embedding (${m.dimension || 768}d)`
                                    : isAudio
                                    ? "Audio / STT"
                                    : "LLM / Chat"}
                                </span>

                                {m.context_window && (
                                  <span>{m.context_window >= 1000 ? `${m.context_window / 1000}k ctx` : `${m.context_window} ctx`}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {filteredModels.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-zinc-500 italic py-2">
                          No models match the filter &quot;{modelSearch[provider.id]}&quot;.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ollama Private Local Daemon */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Ollama Private Local Daemon
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/20 font-semibold">
              Zero Egress / Air-Gapped
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            Run local models on your machine via Ollama daemon without external API keys or cloud dependencies.
          </p>

          <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-800 dark:text-white block">Daemon Base URL</span>
                <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono">Default: http://localhost:11434</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono w-56 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => fetchModelsForProvider("ollama", true)}
                  disabled={loadingProvider === "ollama"}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-cyan-700 dark:text-cyan-300 text-xs font-semibold border border-slate-300 dark:border-zinc-700 flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  {loadingProvider === "ollama" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Discover Models"
                  )}
                </button>
              </div>
            </div>

            {providerStatus["ollama"]?.success && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {providerStatus["ollama"].success}
              </div>
            )}
            {providerStatus["ollama"]?.error && (
              <div className="text-[11px] text-rose-700 dark:text-rose-300 font-mono flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                {providerStatus["ollama"].error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vector Store Configuration: Chroma DB */}
      <div className="double-bezel">
        <div className="double-bezel-inner p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Chroma DB Vector Database Engine
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-100 text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-500/20 font-semibold">
              Active Store: Chroma DB (Persistent)
            </span>
          </div>

          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            RAG Studio utilizes <strong className="text-slate-900 dark:text-white">Chroma DB</strong> as the primary embedded vector database for document passage indexing, fast cosine similarity lookups, and metadata filtering.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2 shadow-sm">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block font-semibold">
                Chroma Persist Directory
              </span>
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <input
                  type="text"
                  value={chromaDirectory}
                  onChange={(e) => setChromaDirectory(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                />
              </div>
              <span className="text-[10px] text-slate-500">
                Collection name: <span className="font-mono text-slate-700 dark:text-zinc-400 font-semibold">rag_studio_chunks</span> (HNSW Cosine)
              </span>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 rounded-xl border border-slate-200 dark:border-zinc-800 space-y-2 flex flex-col justify-between shadow-sm">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block font-semibold">
                  Index Engine Health
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Persistent Disk Store Operational</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-400 pt-2 border-t border-slate-200 dark:border-zinc-800/80">
                <span>Auto-Hydration on Startup:</span>
                <span className="font-mono text-slate-900 dark:text-white font-semibold">Enabled</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
