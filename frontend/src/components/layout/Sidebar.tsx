import React from "react";
import {
  LayoutDashboard,
  Files,
  Cpu,
  MessageSquare,
  Database,
  Activity,
  GitCompare,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  X
} from "lucide-react";
import { RagLogo } from "../common/RagLogo";

export type ScreenId =
  | "dashboard"
  | "documents"
  | "pipeline-builder"
  | "playground"
  | "datasets"
  | "evaluations"
  | "experiments"
  | "settings";

interface SidebarProps {
  activeScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
  indexedCount?: number;
  isBackendHealthy?: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  onSelectScreen,
  isOpenMobile = false,
  onCloseMobile,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const navigationGroups = [
    {
      group: "Core Workspace",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "documents", label: "Document Vault", icon: Files },
        { id: "pipeline-builder", label: "Pipeline Builder", icon: Cpu },
        { id: "playground", label: "Playground & Chat", icon: MessageSquare },
      ]
    },
    {
      group: "Benchmarking & Eval",
      items: [
        { id: "datasets", label: "Dataset Studio", icon: Database },
        { id: "evaluations", label: "Evaluation Center", icon: Activity },
        { id: "experiments", label: "Experiment Lab", icon: GitCompare },
      ]
    },
    {
      group: "Configuration",
      items: [
        { id: "settings", label: "Settings & Keys", icon: Settings },
      ]
    }
  ];

  const renderContent = (isMobile = false) => {
    const collapsed = !isMobile && isCollapsed;

    return (
      <div
        className={`flex-1 flex flex-col justify-between h-full ${
          collapsed ? "overflow-visible" : "overflow-y-auto overflow-x-hidden"
        }`}
      >
        <div className="flex-1 flex flex-col pt-2">
          {/* Mobile Drawer Header with Close Button (Only on mobile slide-over) */}
          {isMobile && (
            <div className="h-16 -mt-2 mb-2 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between px-4 shrink-0">
              <div
                onClick={() => {
                  onSelectScreen("dashboard");
                  onCloseMobile?.();
                }}
                className="flex items-center gap-3 min-w-0 cursor-pointer"
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

              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Grouped Navigation */}
          <nav className={`flex-1 ${collapsed ? "p-2.5 space-y-2" : "p-3 space-y-4"}`}>
            {navigationGroups.map((group, gIdx) => (
              <div key={gIdx} className={collapsed ? "space-y-1.5" : "space-y-1"}>
                {collapsed ? (
                  gIdx > 0 ? (
                    <div className="my-2 border-t border-slate-200/80 dark:border-zinc-800/80 w-8 mx-auto" />
                  ) : null
                ) : (
                  <div className="px-3 pb-1 text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-zinc-500">
                    {group.group}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectScreen(item.id as ScreenId);
                        if (isMobile) {
                          onCloseMobile?.();
                        }
                      }}
                      className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150 group relative ${
                        collapsed
                          ? "w-11 h-11 mx-auto justify-center"
                          : "w-full gap-3 px-3 py-2.5"
                      } ${
                        isActive
                          ? "bg-cyan-50/90 text-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300 shadow-xs border border-cyan-200/90 dark:border-cyan-800/60 font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 border border-transparent"
                      }`}
                    >
                      {isActive && (
                        <span
                          className={`absolute rounded-full bg-cyan-500 dark:bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.7)] ${
                            collapsed
                              ? "left-0.5 top-2.5 bottom-2.5 w-1"
                              : "left-1.5 w-1 h-5"
                          }`}
                        />
                      )}
                      <Icon
                        className={`transition-colors shrink-0 ${
                          collapsed ? "w-5 h-5" : "w-4 h-4"
                        } ${
                          isActive
                            ? "text-cyan-600 dark:text-cyan-400"
                            : "text-slate-500 dark:text-zinc-400 group-hover:text-slate-900 dark:group-hover:text-zinc-200"
                        }`}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}

                      {/* Floating tooltip with left caret on hover in collapsed mode */}
                      {collapsed && (
                        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 drop-shadow-xl">
                          <div className="w-0 h-0 border-y-4 border-y-transparent border-r-[5px] border-r-slate-900 dark:border-r-zinc-900 shrink-0" />
                          <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-zinc-900 dark:text-zinc-100 text-xs font-semibold whitespace-nowrap border border-slate-800 dark:border-zinc-700/80 shadow-2xl">
                            {item.label}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom Section: Expand / Collapse Toggle on desktop */}
        {!isMobile && (
          <div
            className={`border-t border-slate-200/80 dark:border-white/[0.08] p-3 shrink-0 flex items-center ${
              collapsed ? "justify-center" : "justify-between"
            }`}
          >
            {collapsed ? (
              <button
                onClick={onToggleCollapse}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-all relative group/expand"
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen className="w-5 h-5 shrink-0" />
                {/* Floating tooltip with Caret */}
                <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none opacity-0 invisible group-hover/expand:opacity-100 group-hover/expand:visible transition-all duration-150 z-50 drop-shadow-xl">
                  <div className="w-0 h-0 border-y-4 border-y-transparent border-r-[5px] border-r-slate-900 dark:border-r-zinc-900 shrink-0" />
                  <div className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-zinc-900 dark:text-zinc-100 text-xs font-semibold whitespace-nowrap border border-slate-800 dark:border-zinc-700/80 shadow-2xl">
                    Expand sidebar
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={onToggleCollapse}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800/80 transition-all group"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:text-zinc-500 dark:group-hover:text-zinc-200 transition-colors shrink-0" />
                <span>Collapse sidebar</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar (Only visible on screens >= lg) */}
      <aside
        className={`hidden lg:flex flex-col h-full select-none z-20 transition-all duration-300 ease-in-out shrink-0 bg-white dark:bg-[#0c0c0e]/95 backdrop-blur-xl border-r border-slate-200 dark:border-white/[0.08] ${
          isCollapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <div className={`flex flex-col h-full ${isCollapsed ? "w-[72px] overflow-visible" : "w-64"}`}>
          {renderContent(false)}
        </div>
      </aside>

      {/* Mobile Drawer (Only on screens < lg) */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-slate-900/60 dark:bg-black/75 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-300 ${
          isOpenMobile ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      {/* Slide-in Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-[#0c0c0e] border-r border-slate-200 dark:border-white/[0.08] flex flex-col justify-between h-full select-none shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderContent(true)}
      </aside>
    </>
  );
};

