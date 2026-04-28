import { useCallback, useEffect, useState } from "react";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { SpacesPage } from "./pages/SpacesPage";
import { VaultSetupPage } from "./pages/VaultSetupPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import type { WorkspaceLayoutMode } from "./types";

function App() {
  const workspace = useWorkspaceState();
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutMode>("classic");

  useEffect(() => {
    let cancelled = false;
    void window.basis.prefs.getApp().then((p) => {
      if (cancelled) return;
      if (p.workspaceLayout === "columns" || p.workspaceLayout === "classic") {
        setWorkspaceLayout(p.workspaceLayout);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setWorkspaceLayoutMode = useCallback((mode: WorkspaceLayoutMode) => {
    setWorkspaceLayout(mode);
    void window.basis.prefs.setApp({ workspaceLayout: mode });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.basis.prefs.getApp().then((prefs) => {
      if (cancelled) return;
      const theme = prefs.themeMode;
      if (theme === "light" || theme === "dark") {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("basis-theme", theme);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!workspace.vaultPath) {
    return <VaultSetupPage onPickVault={workspace.pickVault} />;
  }

  if (!workspace.activeSpace) {
    return (
      <SpacesPage
        vaultPath={workspace.vaultPath}
        spaces={workspace.spaces}
        onPickVault={workspace.pickVault}
        onCreateSpace={workspace.createSpace}
        onOpenSpace={workspace.openSpace}
        onRenameSpace={workspace.renameSpace}
        onDeleteSpace={workspace.deleteSpace}
      />
    );
  }

  return (
    <WorkspacePage
      vaultPath={workspace.vaultPath}
      activeSpace={workspace.activeSpace}
      fileTree={workspace.fileTree}
      openFiles={workspace.openFiles}
      activeFile={workspace.activeFile}
      activeContent={workspace.activeContent}
      threads={workspace.threads}
      activeThreadId={workspace.activeThreadId}
      activeThread={workspace.activeThread}
      workspaceLayout={workspaceLayout}
      onWorkspaceLayoutChange={setWorkspaceLayoutMode}
      onOpenHome={() => workspace.setActiveSpace(null)}
      onSetActiveFile={workspace.setActiveFile}
      onCloseFile={workspace.closeFile}
      onSaveActiveFile={workspace.saveActiveFile}
      onSelectThread={workspace.setActiveThreadId}
      onCreateThread={workspace.createThread}
      onRefreshThreads={workspace.refreshThreads}
      fileTreeActions={workspace.fileTreeActions}
    />
  );
}

export default App;
