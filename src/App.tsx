import { useState } from "react";
import { useWorkspaceState } from "./hooks/useWorkspaceState";
import { SpacesPage } from "./pages/SpacesPage";
import { VaultSetupPage } from "./pages/VaultSetupPage";
import { WorkspacePage } from "./pages/WorkspacePage";

function App() {
  const workspace = useWorkspaceState();

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
      activeFile={workspace.activeFile}
      activeContent={workspace.activeContent}
      threads={workspace.threads}
      activeThreadId={workspace.activeThreadId}
      activeThread={workspace.activeThread}
      onOpenHome={() => workspace.setActiveSpace(null)}
      onSetActiveFile={workspace.setActiveFile}
      onSaveActiveFile={workspace.saveActiveFile}
      onSelectThread={workspace.setActiveThreadId}
      onCreateThread={workspace.createThread}
      onRefreshThreads={workspace.refreshThreads}
    />
  );
}

export default App;
