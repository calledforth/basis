import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AcpManager } from "./acp/manager.js";
import { ChatDb } from "./core/chatDb.js";
import { addLog, setLogPublisher } from "./core/logs.js";
import { nowIso, type AcpEventCategory, type AcpEventEntry, type AcpEventName } from "./core/types.js";
import { registerAcpIpc } from "./ipc/registerAcpIpc.js";
import { registerLogsIpc } from "./ipc/registerLogsIpc.js";
import { registerPrefsIpc } from "./ipc/registerPrefsIpc.js";
import { registerSpacesIpc } from "./ipc/registerSpacesIpc.js";
import { registerThreadsIpc } from "./ipc/registerThreadsIpc.js";
import { registerVaultIpc } from "./ipc/registerVaultIpc.js";
import { registerWindowIpc } from "./ipc/registerWindowIpc.js";
import { VaultService } from "./vault/service.js";
import { createMainWindow } from "./window/createMainWindow.js";

let mainWindow: BrowserWindow | null = null;
let chatDb: ChatDb | null = null;
let vaultService: VaultService | null = null;
let acpManager: AcpManager | null = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sendToRenderer(channel: string, payload: unknown) {
  mainWindow?.webContents.send(channel, payload);
}

function emitAcpEvent(
  spaceSlug: string,
  threadId: string,
  category: AcpEventCategory,
  event: AcpEventName,
  data?: unknown,
  sessionId?: string
) {
  if (!chatDb) return;
  const pending: Omit<AcpEventEntry, "seq"> = {
    id: crypto.randomUUID(),
    at: nowIso(),
    spaceSlug,
    threadId,
    category,
    event,
    sessionId,
    data
  };
  const entry = chatDb.insertAcpEvent(pending);
  sendToRenderer("acp:event", entry);
}

async function bootstrapApp() {
  const dbPath = path.join(app.getPath("userData"), "basis-chat.db");
  chatDb = new ChatDb(dbPath);

  setLogPublisher((entry) => {
    sendToRenderer("logs:entry", entry);
  });

  vaultService = new VaultService({
    addLog,
    onFileChanged: (payload) => {
      sendToRenderer("vault:file-changed", payload);
    }
  });

  acpManager = new AcpManager({
    emitAcpEvent,
    addLog,
    onSessionTitleUpdated: (route, title) => {
      chatDb?.updateThread(route.spaceSlug, route.threadId, { title });
    }
  });

  registerWindowIpc();
  registerPrefsIpc();
  registerVaultIpc({ vaultService });
  registerSpacesIpc({ vaultService });
  registerThreadsIpc({ chatDb });
  registerAcpIpc({
    acpManager,
    chatDb,
    vaultService,
    emitAcpEvent
  });
  registerLogsIpc();

  const createdWindow = await createMainWindow({
    preloadPath: path.join(__dirname, "preload.cjs"),
    onMaximizedChange: (maximized) => sendToRenderer("win:maximized", maximized)
  });
  mainWindow = createdWindow;

  createdWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await bootstrapApp();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const createdWindow = await createMainWindow({
      preloadPath: path.join(__dirname, "preload.cjs"),
      onMaximizedChange: (maximized) => sendToRenderer("win:maximized", maximized)
    });
    mainWindow = createdWindow;
    createdWindow.on("closed", () => {
      mainWindow = null;
    });
  }
});

app.on("window-all-closed", () => {
  acpManager?.disposeAll();
  vaultService?.dispose();
  if (process.platform !== "darwin") {
    setLogPublisher(null);
    chatDb?.close();
    chatDb = null;
    app.quit();
  }
});
