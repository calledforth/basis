import { ipcMain } from "electron";
import { ChatDb } from "../core/chatDb.js";
import { addLog } from "../core/logs.js";
import type { ThreadBackend, ThreadRecord } from "../core/types.js";

type RegisterThreadsIpcArgs = {
  chatDb: ChatDb;
};

export function registerThreadsIpc(args: RegisterThreadsIpcArgs) {
  ipcMain.handle("threads:list", (_evt, spaceSlug: string) => {
    return args.chatDb.listThreads(spaceSlug);
  });

  ipcMain.handle(
    "threads:new",
    (_evt, spaceSlug: string, payload?: string | { title?: string; backend?: ThreadBackend }) => {
      const title = typeof payload === "string" ? payload : payload?.title;
      const backend = payload && typeof payload === "object" ? payload.backend ?? "cursor" : "cursor";
      const record = args.chatDb.createThread(spaceSlug, title, backend);
      addLog({
        scope: "thread",
        level: "info",
        message: "Created thread",
        data: { spaceSlug, threadId: record.threadId, backend: record.backend }
      });
      return record;
    }
  );

  ipcMain.handle("threads:update", (_evt, spaceSlug: string, threadId: string, patch: Partial<ThreadRecord>) => {
    args.chatDb.updateThread(spaceSlug, threadId, patch);
    return true;
  });
}
