import React, { useState, useEffect } from "react";
import { Sidebar, ScreenId } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { PipelineBuilderScreen } from "./screens/PipelineBuilderScreen";
import { PlaygroundScreen } from "./screens/PlaygroundScreen";
import { DatasetStudioScreen } from "./screens/DatasetStudioScreen";
import { EvaluationsScreen } from "./screens/EvaluationsScreen";
import { ExperimentsScreen } from "./screens/ExperimentsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ThemeProvider } from "./context/ThemeContext";
import { api } from "./services/api";

function AppContent() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("dashboard");
  const [indexedCount, setIndexedCount] = useState<number>(0);
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean>(true);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [hostedLlmReady, setHostedLlmReady] = useState<boolean>(false);
  const [activeDemoProvider, setActiveDemoProvider] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("rag_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("rag_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when inside inputs or textareas
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        handleToggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const checkHealth = async () => {
    try {
      const res = await api.getDashboard();
      setIndexedCount(res?.metrics?.total_indexed_chunks || 0);
      setDemoMode(Boolean(res?.demo_mode));
      setHostedLlmReady(Boolean(res?.hosted_llm_ready));
      setActiveDemoProvider(res?.active_demo_provider || null);
      setIsBackendHealthy(true);
    } catch (e) {
      setIsBackendHealthy(false);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-background text-slate-900 dark:text-slate-100 font-sans selection:bg-cyan-500/20 selection:text-cyan-600 dark:selection:text-cyan-300 transition-colors duration-200">
      {/* Sticky Full-Width Header (Always displays brand header and page controls) */}
      <Header
        activeScreen={activeScreen}
        onNavigate={setActiveScreen}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
        isSidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
        demoMode={demoMode}
        hostedLlmReady={hostedLlmReady}
        activeDemoProvider={activeDemoProvider}
      />

      {/* Main Workspace: Collapsible Sidebar Navigation + Screen Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Primary Sidebar (Desktop static with collapse, mobile slide-over) */}
        <Sidebar
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
          indexedCount={indexedCount}
          isBackendHealthy={isBackendHealthy}
          isOpenMobile={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />

        {/* Scrollable Screen Content Workspace */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {activeScreen === "dashboard" && <DashboardScreen onNavigate={setActiveScreen} />}
          {activeScreen === "documents" && <DocumentsScreen />}
          {activeScreen === "pipeline-builder" && <PipelineBuilderScreen />}
          {activeScreen === "playground" && <PlaygroundScreen />}
          {activeScreen === "datasets" && <DatasetStudioScreen />}
          {activeScreen === "evaluations" && <EvaluationsScreen />}
          {activeScreen === "experiments" && <ExperimentsScreen />}
          {activeScreen === "settings" && <SettingsScreen />}
        </main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
