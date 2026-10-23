import React from "react";
import {
  Sun,
  Moon,
  Laptop,
  Sparkles,
  Server,
  Activity,
  Layers,
  Search,
  ExternalLink,
  ChevronRight,
  Plus,
  Menu,
  PanelLeftOpen
} from "lucide-react";
import { ScreenId } from "./Sidebar";
import { useTheme } from "../../context/ThemeContext";
import { RagLogo } from "../common/RagLogo";

interface HeaderProps {
  activeScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  isBackendHealthy?: boolean;
  indexedCount?: number;
  onOpenMobileMenu?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  demoMode?: boolean;
  hostedLlmReady?: boolean;
  activeDemoProvider?: string | null;
}

const SCREEN_METADATA: Record<ScreenId, { title: string; category: string; description: string }> = {
  dashboard: {
    title: "Studio Overview",
    category: "Workspace",
    description: "System telemetry, retrieval accuracy benchmarks, and active pipeline status"
  },
  documents: {
    title: "Document Vault",
    category: "Knowledge Base",
    description: "Corpus management, vector index status, and chunk segmentation inspector"
  },
  "pipeline-builder": {
    title: "Pipeline Architect",
    category: "Engineering",
    description: "Modular chunking, embedding models, vector store, and generation configuration"
  },
  playground: {
    title: "Interactive Playground",
    category: "Testing",
    description: "Real-time multi-model RAG testing, cited passages, and chunk inspector"
  },
  datasets: {
    title: "Dataset Studio",
    category: "Evaluation",
    description: "Golden Q&A test cases, synthetic test generator, and benchmark suites"
  },
  evaluations: {
    title: "Evaluation Center",
    category: "Evaluation",
    description: "Automated retrieval metrics, LLM-as-a-judge scoring, and failure mode analysis"
  },
  experiments: {
    title: "Experiment Comparison",
    category: "Evaluation",
    description: "Side-by-side differential regression analysis across pipeline versions"
  },
  settings: {
    title: "System Settings",
    category: "Platform",
    description: "API keys, model provider connections, and storage management"
  }
};

export const Header: React.FC<HeaderProps> = ({
  activeScreen,
  onNavigate,
  onOpenMobileMenu,
  isSidebarCollapsed = false,
  onToggleSidebar,
  demoMode = false,
  hostedLlmReady = false,
  activeDemoProvider = null,
}) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const meta = SCREEN_METADATA[activeScreen] || {
    title: "RAG Studio",
    category: "Workspace",
    description: "Enterprise Retrieval-Augmented Generation Workbench"
  };

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/95 dark:bg-[#0c0c0e]/95 backdrop-blur-md px-3.5 sm:px-6 flex items-center transition-colors duration-200 shrink-0">
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Left Section: Mobile Menu Button + Permanent Brand Header + Breadcrumbs & Title */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Mobile Menu Hamburger (Only visible on < lg) */}
          <button
            onClick={onOpenMobileMenu}
            className="p-1.5 -ml-1 rounded-xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors lg:hidden shrink-0"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Permanent Brand Header (Always visible in both collapsed and expanded states) */}
          <div
            onClick={() => onNavigate("dashboard")}
            className="flex items-center gap-3 cursor-pointer group shrink-0 select-none"
            title="Go to Dashboard"
          >
            <RagLogo size={34} />
            <div className="min-w-0">
              <div className="font-bold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                RAG Studio
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-800 dark:bg-zinc-800 dark:text-cyan-400 border border-cyan-200 dark:border-zinc-700/80 font-semibold">
                  Pro
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                Pipeline & Eval Suite
              </p>
            </div>
          </div>

          {/* Divider between Brand Header and Page Title */}
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:border-white/[0.08] dark:bg-zinc-800 shrink-0 mx-1" />

          {/* Current Page Breadcrumbs & Title */}
          <div className="min-w-0 hidden xs:block">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] leading-tight text-slate-500 dark:text-zinc-400 font-medium">
              <span>{meta.category}</span>
              <ChevronRight className="w-3 h-3 text-slate-400 dark:text-zinc-600" />
              <span className="text-cyan-600 dark:text-cyan-400 font-semibold truncate">{meta.title}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 truncate leading-tight">
              {meta.title}
            </h1>
          </div>
        </div>

        {/* Right: Quick actions & Night/Light Toggle */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Night / Light Mode Switcher Widget */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-inner">
            <button
              onClick={() => setTheme("light")}
              title="Light Mode"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                theme === "light"
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/80 font-semibold"
                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Sun className={`w-3.5 h-3.5 ${theme === "light" ? "text-amber-500" : ""}`} />
              <span className="hidden sm:inline">Light</span>
            </button>

            <button
              onClick={() => setTheme("dark")}
              title="Night / Dark Mode"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                theme === "dark"
                  ? "bg-zinc-800 text-white shadow-sm border border-zinc-700 font-semibold"
                  : "text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <Moon className={`w-3.5 h-3.5 ${theme === "dark" ? "text-cyan-400" : ""}`} />
              <span className="hidden sm:inline">Night</span>
            </button>

            <button
              onClick={() => setTheme("system")}
              title="System Theme"
              className={`p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                theme === "system"
                  ? "bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-sm border border-slate-200 dark:border-zinc-700 font-semibold"
                  : "text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Contextual Quick Trigger Button */}
          {activeScreen !== "playground" && (
            <button
              onClick={() => onNavigate("playground")}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium shadow-sm transition-all flex items-center gap-1.5 active:scale-95"
              title="Test in Playground"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Playground</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
